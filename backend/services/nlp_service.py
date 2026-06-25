import os
import re
import logging
import random
import httpx
from collections import Counter
from typing import List, Tuple, Dict, Any, Optional
import gc

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# NLTK bootstrap
# --------------------------------------------------------------------------- #
import nltk
for _pkg in ('punkt', 'punkt_tab', 'averaged_perceptron_tagger',
             'averaged_perceptron_tagger_eng', 'stopwords'):
    try:
        nltk.download(_pkg, quiet=True)
    except Exception as e:
        logger.warning(f"NLTK download failed for {_pkg}: {e}")

from nltk.tokenize import sent_tokenize, word_tokenize
from nltk.corpus import stopwords
from nltk.tag import pos_tag

# --------------------------------------------------------------------------- #
# HF API setup — lightweight, no heavy dependencies
# --------------------------------------------------------------------------- #
HF_TOKEN = os.environ.get("HF_TOKEN", "")
HF_API_URL = "https://api-inference.huggingface.co/models/google/flan-t5-small"

def load_qg_model() -> bool:
    logger.info("Using Hugging Face Inference API")
    return True


# --------------------------------------------------------------------------- #
# Sentence quality gate
# --------------------------------------------------------------------------- #

_SENT_BLACKLIST_RE = re.compile(
    r'^\s*(\d[\d\.\-]*|[IVXLCDM]+\.?)\s',
    re.IGNORECASE
)

def _is_good_sentence(sentence: str) -> bool:
    s = sentence.strip()
    words = s.split()
    if len(words) < 7 or len(words) > 60:
        return False
    if s.endswith(':'):
        return False
    if _SENT_BLACKLIST_RE.match(s):
        return False
    tagged = pos_tag(word_tokenize(s))
    has_verb = any(tag.startswith('VB') for _, tag in tagged)
    if not has_verb:
        return False
    alpha_ratio = sum(c.isalpha() for c in s) / max(len(s), 1)
    if alpha_ratio < 0.55:
        return False
    return True


# --------------------------------------------------------------------------- #
# Candidate extraction
# --------------------------------------------------------------------------- #

def extract_keywords_tfidf(text: str, top_n: int = 20) -> List[str]:
    """Pure-Python keyword extraction — no sklearn needed."""
    try:
        stops = set(stopwords.words('english'))
        words = [
            w.lower() for w in word_tokenize(text)
            if w.isalnum() and len(w) > 3 and w.lower() not in stops
        ]
        return [w for w, _ in Counter(words).most_common(top_n)]
    except Exception as e:
        logger.warning(f"Keyword extraction failed: {e}")
        return []


def extract_entities_nltk(text: str) -> List[str]:
    """Lightweight NER using POS tags only — no numpy needed."""
    try:
        entities = []
        for sentence in sent_tokenize(text):
            tokens = word_tokenize(sentence)
            tagged = pos_tag(tokens)
            current = []
            for word, tag in tagged:
                if tag in ('NNP', 'NNPS'):
                    current.append(word)
                else:
                    if current:
                        entities.append(" ".join(current))
                        current = []
            if current:
                entities.append(" ".join(current))
        return list(set(entities))
    except Exception as e:
        logger.warning(f"NER failed: {e}")
        return []


def extract_noun_phrases(text: str) -> List[str]:
    try:
        stops = set(stopwords.words('english'))
        candidates = []
        grammar = r"NP: {<DT>?<JJ>*<NN.*>+}"
        cp = nltk.RegexpParser(grammar)
        for sentence in sent_tokenize(text):
            tokens = word_tokenize(sentence)
            tagged = pos_tag(tokens)
            tree = cp.parse(tagged)
            for sub in tree.subtrees():
                if sub.label() == 'NP':
                    phrase = " ".join(w for w, _ in sub.leaves())
                    if phrase.lower() not in stops and len(phrase) > 3 and not phrase.isdigit():
                        candidates.append(phrase)
        return list(set(candidates))
    except Exception as e:
        logger.warning(f"NP extraction failed: {e}")
        return []


# --------------------------------------------------------------------------- #
# Question generation — HF API via httpx
# --------------------------------------------------------------------------- #

def generate_t5_question(answer: str, context: str) -> str:
    try:
        if not HF_TOKEN:
            logger.warning("HF_TOKEN not set, skipping API call")
            return ""

        prompt = f"Generate a question whose answer is: {answer}\nContext: {context}\nQuestion:"
        headers = {"Authorization": f"Bearer {HF_TOKEN}"}
        payload = {
            "inputs": prompt,
            "parameters": {"max_new_tokens": 50}
        }

        response = httpx.post(HF_API_URL, headers=headers, json=payload, timeout=10)

        if response.status_code == 200:
            result = response.json()
            if isinstance(result, list) and result:
                return result[0].get("generated_text", "").strip()
        else:
            logger.error(f"HF API error {response.status_code}: {response.text}")
        return ""

    except Exception as e:
        logger.error(f"HF API generation error: {type(e).__name__}: {e}")
        return ""


# --------------------------------------------------------------------------- #
# Rule-based question generation (rich fallback)
# --------------------------------------------------------------------------- #

_DEFINITION_PATTERNS: List[Tuple[str, Any]] = [
    (r'\b(?P<subj>.+?)\s+is\s+(?P<rest>.+)',
     lambda m, c: f"What is {c}?"),
    (r'\b(?P<subj>.+?)\s+are\s+(?P<rest>.+)',
     lambda m, c: f"What are {c}?"),
    (r'\b(?P<subj>.+?)\s+(?:is|are)\s+defined\s+as\s+(?P<rest>.+)',
     lambda m, c: f"How is {c} defined?"),
    (r'\b(?P<subj>.+?)\s+refers?\s+to\s+(?P<rest>.+)',
     lambda m, c: f"What does {c} refer to?"),
    (r'\b(?P<subj>.+?)\s+(?:is|are)\s+used\s+(?:to|for)\s+(?P<rest>.+)',
     lambda m, c: f"What is {c} used for?"),
    (r'\b(?P<subj>.+?)\s+(?:consists?|is\s+made\s+up)\s+of\s+(?P<rest>.+)',
     lambda m, c: f"What does {c} consist of?"),
    (r'\b(?P<subj>.+?)\s+(?:was|were)\s+(?:created|invented|discovered|developed)\s+(?:by|in)\s+(?P<rest>.+)',
     lambda m, c: f"Who or when was {c} created/discovered?"),
    (r'\b(?P<subj>.+?)\s+(?:enables?|allows?|helps?)\s+(?P<rest>.+)',
     lambda m, c: f"What does {c} enable or allow?"),
    (r'\b(?P<subj>.+?)\s+(?:causes?|results?\s+in|leads?\s+to)\s+(?P<rest>.+)',
     lambda m, c: f"What does {c} cause or lead to?"),
    (r'\b(?P<subj>.+?)\s+(?:includes?|contains?|comprises?)\s+(?P<rest>.+)',
     lambda m, c: f"What does {c} include?"),
]


def _rule_based_question(sentence: str, candidate: str) -> Optional[str]:
    s_lower = sentence.lower()
    c_lower = candidate.lower()
    for pattern, q_fn in _DEFINITION_PATTERNS:
        m = re.search(pattern, s_lower)
        if m:
            subj = m.group('subj') if 'subj' in m.groupdict() else ''
            if c_lower in subj or c_lower in s_lower:
                return q_fn(m, candidate)
    return None


def _extract_answer_for_rule(sentence: str, candidate: str) -> str:
    s_lower = sentence.lower()
    c_lower = candidate.lower()
    for trigger in [' is defined as ', ' is ', ' are ', ' refers to ',
                    ' is used for ', ' consists of ', ' contains ',
                    ' includes ', ' causes ', ' enables ', ' allows ']:
        if trigger in s_lower:
            idx = s_lower.index(trigger)
            before = sentence[:idx].strip()
            after = sentence[idx + len(trigger):].strip().rstrip('.')
            if c_lower in before.lower():
                return after if after else candidate
    return candidate


def _wh_question_from_pos(sentence: str, candidate: str) -> Optional[str]:
    tagged = pos_tag(word_tokenize(candidate))
    if not tagged:
        return None
    head_tag = tagged[-1][1]
    if head_tag in ('NNP', 'NNPS'):
        qword = "Who or what"
    elif head_tag in ('NN', 'NNS'):
        qword = "What"
    elif head_tag in ('VBG', 'VB', 'VBZ'):
        qword = "What"
    elif head_tag in ('JJ', 'JJR', 'JJS'):
        qword = "Which"
    else:
        qword = "What"
    pattern = re.compile(r'\b' + re.escape(candidate) + r'\b', re.IGNORECASE)
    masked = pattern.sub("___", sentence)
    return f"{qword} is described as follows: \"{masked}\"?"


def create_cloze_question(sentence: str, answer: str) -> str:
    pattern = re.compile(r'\b' + re.escape(answer) + r'\b', re.IGNORECASE)
    cloze = pattern.sub("________", sentence, count=1)
    if "________" not in cloze:
        return ""
    return cloze


# --------------------------------------------------------------------------- #
# Deduplication
# --------------------------------------------------------------------------- #

def _jaccard_sim(a: str, b: str) -> float:
    sa = set(a.lower().split())
    sb = set(b.lower().split())
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def _is_duplicate(question: str, seen: List[str], threshold: float = 0.6) -> bool:
    for s in seen:
        if _jaccard_sim(question, s) >= threshold:
            return True
    return False


# --------------------------------------------------------------------------- #
# Candidate quality filter
# --------------------------------------------------------------------------- #

_STOP_WORDS = None

def _get_stops():
    global _STOP_WORDS
    if _STOP_WORDS is None:
        _STOP_WORDS = set(stopwords.words('english'))
    return _STOP_WORDS


def _is_good_candidate(candidate: str) -> bool:
    stops = _get_stops()
    c = candidate.strip().lower()
    if c in stops:
        return False
    words = c.split()
    if len(words) == 1 and len(c) <= 4:
        return False
    if c.isdigit():
        return False
    if len(words) == 1 and not candidate[0].isupper() and len(c) < 7:
        return False
    return True


# --------------------------------------------------------------------------- #
# Main pipeline
# --------------------------------------------------------------------------- #

def generate_flashcards(text: str) -> List[Dict[str, str]]:
    sentences = sent_tokenize(text)
    if not sentences:
        return []

    good_sentences = [s for s in sentences if _is_good_sentence(s)]
    if not good_sentences:
        good_sentences = sentences

    keywords     = extract_keywords_tfidf(text)
    entities     = extract_entities_nltk(text)
    noun_phrases = extract_noun_phrases(text)

    all_candidates: List[str] = []
    seen_cands: set = set()
    for c in entities + keywords + noun_phrases:
        c_clean = c.strip().strip(".,;:!?()'\"").strip()
        c_lower = c_clean.lower()
        if not c_clean or c_lower in seen_cands:
            continue
        if not _is_good_candidate(c_clean):
            continue
        seen_cands.add(c_lower)
        all_candidates.append(c_clean)

    model_available = load_qg_model()

    flashcards: List[Dict[str, str]] = []
    seen_questions: List[str] = []
    card_index = 0

    for sentence in good_sentences:
        s_lower = sentence.lower()
        sentence_candidates = []
        for cand in all_candidates:
            pat = r'\b' + re.escape(cand.lower()) + r'\b'
            if re.search(pat, s_lower):
                sentence_candidates.append(cand)

        sentence_candidates.sort(
            key=lambda c: (len(c.split()), c[0].isupper(), len(c)),
            reverse=True
        )

        sentence_card_count = 0
        for cand in sentence_candidates:
            if sentence_card_count >= 2:
                break
            if not _is_good_candidate(cand):
                continue

            question = ""
            answer = cand
            use_cloze = random.random() < 0.3

            if use_cloze:
                cloze_q = create_cloze_question(sentence, cand)
                if cloze_q and len(cloze_q.split()) >= 5:
                    question = cloze_q
                    answer = cand
                else:
                    use_cloze = False

            if not use_cloze:
                if model_available:
                    question = generate_t5_question(cand, sentence)

                if not question or len(question) < 10 or '?' not in question:
                    rule_q = _rule_based_question(sentence, cand)
                    if rule_q:
                        question = rule_q
                        answer = _extract_answer_for_rule(sentence, cand)

                if not question or len(question) < 10 or '?' not in question:
                    wh_q = _wh_question_from_pos(sentence, cand)
                    if wh_q:
                        question = wh_q

                if not question or len(question) < 10 or '?' not in question:
                    cloze_q = create_cloze_question(sentence, cand)
                    if cloze_q and len(cloze_q.split()) >= 5:
                        question = cloze_q
                        answer = cand
                    else:
                        continue

            if len(question.split()) < 5:
                continue

            if _is_duplicate(question, seen_questions, threshold=0.55):
                continue

            seen_questions.append(question)
            flashcards.append({
                "question": question,
                "answer": answer,
                "type": "fill_blank" if use_cloze else "question"
            })
            sentence_card_count += 1
            card_index += 1

    if len(flashcards) < 3:
        for kw in keywords[:8]:
            for sentence in good_sentences:
                if kw.lower() not in sentence.lower():
                    continue
                use_cloze_fallback = (card_index % 2 == 1)
                if use_cloze_fallback:
                    cloze_q = create_cloze_question(sentence, kw)
                    if cloze_q and not _is_duplicate(cloze_q, seen_questions):
                        seen_questions.append(cloze_q)
                        flashcards.append({"question": cloze_q, "answer": kw, "type": "fill_blank"})
                        card_index += 1
                else:
                    rule_q = _rule_based_question(sentence, kw)
                    if not rule_q:
                        continue
                    if _is_duplicate(rule_q, seen_questions):
                        continue
                    answer = _extract_answer_for_rule(sentence, kw)
                    seen_questions.append(rule_q)
                    flashcards.append({"question": rule_q, "answer": answer, "type": "question"})
                    card_index += 1
                if len(flashcards) >= 5:
                    break

    flashcards.sort(
        key=lambda fc: (
            fc.get('type') == 'question',
            '?' in fc['question'],
            len(fc['answer']) > len(fc['question']) * 0.2
        ),
        reverse=True
    )

    gc.collect()
    logger.info("Flashcard generation complete.")
    return flashcards[:15]