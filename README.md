# Smart Flashcard Generator

Smart Flashcard Generator is a full-stack, responsive web application that uses Natural Language Processing (NLP) to convert raw study notes into interactive flashcards. It features user authentication, spaced repetition scheduling for optimal learning retention, and a modern glassmorphic dark-mode UI.

---

## Selected Assignment Option

**Option A — Smart Flashcard Generator**

Build a tool that helps students convert their study notes into flashcards automatically using
NLP, then review them.
---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML5, CSS3, ES6 JavaScript |
| Backend | FastAPI + Uvicorn |
| Database | MongoDB Atlas via Motor (async) |
| Authentication | JWT (python-jose) + bcrypt password hashing |
| NLP | NLTK, Hugging Face Inference API (httpx) |
| Deployment | Railway (production), GitHub (version control) |

---

## Core Features

1. **User Authentication** — Secure signup and login. Passwords are hashed with `bcrypt` and sessions are managed with JSON Web Tokens (JWT).

2. **AI Flashcard Generation** — Paste study notes (50–5000 characters). The NLP pipeline:
   - Splits text into sentences using NLTK sentence tokenisation.
   - Extracts keywords using frequency-based ranking (pure Python, no heavy dependencies).
   - Extracts named entities using POS tag-based NER (proper noun detection).
   - Extracts noun phrases using NLTK RegexpParser.
   - Generates questions via the **Hugging Face Inference API** (`google/flan-t5-small`) using `httpx` for lightweight HTTP calls.
   - Falls back to rule-based question generation and cloze (fill-in-the-blank) questions when the API is unavailable.

3. **Interactive Spaced Repetition** — Review cards one-by-one with a 3D flip card animation. Mark cards as **Known** or **Not Known**.
   - Known cards have their weight halved (min 0.1), appearing less frequently.
   - Not Known cards have their weight doubled (max 5.0), appearing more frequently.

4. **Editable Preview** — Add, edit, or delete cards in the generation workbench before saving.

5. **Dashboard** — Track progress percentages and timestamps for all saved decks on a responsive grid.

---

## Local Setup Instructions

### Prerequisites
- Python 3.9+
- A MongoDB Atlas account (free tier is sufficient)
- A Hugging Face account with an API token (free tier)

### 1. Clone the repository
```bash
git clone https://github.com/Aswin-k61/flashcard.git
cd flashcard
```

### 2. Configure environment variables
Create a `.env` file in the project root:
```env
MONGODB_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/flashcard_db?retryWrites=true&w=majority
JWT_SECRET=<generate with: python -c "import secrets; print(secrets.token_hex(32))">
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
HF_TOKEN=<your Hugging Face API token from huggingface.co/settings/tokens>
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Run the application
```bash
uvicorn backend.main:app --reload --port 8000
```

Open your browser at **http://localhost:8000**

---

## API Documentation

FastAPI provides interactive documentation automatically:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Key Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/signup` | Create a new account |
| POST | `/api/auth/login` | Authenticate and receive a JWT token |
| POST | `/api/flashcards/generate` | Run NLP pipeline on study notes |
| GET | `/api/flashcards/sets` | Retrieve all flashcard sets for the user |
| GET | `/api/review/{set_id}/next` | Get next card using weighted random selection |
| PATCH | `/api/review/{card_id}` | Update card weight (known / not known) |

---

## AI/ML Implementation — Changes Made

The original implementation loaded the `valhalla/t5-small-qg-hl` transformer model (~242MB) and `scikit-learn` directly on the server. This caused **out-of-memory crashes** on free-tier cloud hosts (512MB RAM limit).

### Problem
- Loading PyTorch + Transformers consumed ~400MB RAM on startup.
- `scikit-learn` (numpy + scipy) added another ~200MB.
- Together they exceeded the 512MB free-tier limit on every cold start.

### Changes Made

| Before | After | Reason |
|---|---|---|
| `transformers` + `torch` loaded locally | Hugging Face **Inference API** via `httpx` | Offloads model compute to HF servers; zero RAM cost locally |
| `scikit-learn` TF-IDF vectoriser | Pure Python `Counter`-based frequency ranking | Eliminates numpy/scipy dependency (~200MB saved) |
| `nltk.ne_chunk` (requires numpy) | POS tag-based proper noun detection | Removes numpy dependency entirely |
| `InferenceClient` from `huggingface_hub` | Direct `httpx.post` to HF REST API | Lighter dependency chain |
| NLTK downloads at runtime | NLTK downloads at **build time** (`render_build.sh`) | Faster cold starts, no repeated downloads |

### Current NLP Pipeline

```
Input text
    │
    ▼
Sentence tokenisation (NLTK)
    │
    ├──▶ Keyword extraction (Counter frequency ranking)
    ├──▶ Named entity extraction (POS tag NNP/NNPS detection)
    └──▶ Noun phrase extraction (NLTK RegexpParser)
              │
              ▼
        Candidate filtering & deduplication
              │
              ▼
        Question generation (per candidate)
              │
        ┌─────┴─────┐
        ▼           ▼
   HF API call   Rule-based fallback
   (flan-t5-small)  (pattern matching)
        │           │
        └─────┬─────┘
              ▼
        Cloze fallback (fill-in-the-blank)
              │
              ▼
        Deduplication (Jaccard similarity)
              │
              ▼
        Quality sort & return top 15 cards
```

### Result
Memory usage reduced from ~450MB (crashing) to ~120MB (stable), enabling reliable deployment on Railway's free tier.

---

## Deployment

The application is deployed on **Railway** at:
`https://<your-service>.up.railway.app`

Environment variables are configured via the Railway dashboard (not committed to the repository). The `.env` file is listed in `.gitignore`.
