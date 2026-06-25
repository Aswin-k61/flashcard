#!/bin/bash
# render_build.sh
pip install -r requirements.txt
python -c "
import nltk
for pkg in ['punkt', 'punkt_tab', 'averaged_perceptron_tagger',
            'averaged_perceptron_tagger_eng', 'maxent_ne_chunker',
            'maxent_ne_chunker_tab', 'words', 'stopwords']:
    nltk.download(pkg, quiet=True)
"