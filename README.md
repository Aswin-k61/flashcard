# Smart Flashcard Generator

Smart Flashcard Generator is a full-stack, responsive web application that uses Natural Language Processing (NLP) to convert raw study notes into interactive flashcards. It implements user registration/login, spaced repetition schedules for optimal learning retention, and a modern glassmorphic dark-mode user interface.

## Core Features

1. **User Authentication**: Sign up and log in securely. Passwords are hashed using `bcrypt` and sessions are verified using JSON Web Tokens (JWT).
2. **AI Flashcard Generation**: Paste or type a paragraph of study notes (50 to 5000 characters). The backend parses the text using:
   - **NLTK sentence segmentation** to split the text.
   - **TF-IDF Keyword ranking** (scikit-learn) and **NLTK Named Entity Recognition** to select optimal answers.
   - **Hugging Face transformers** (`valhalla/t5-small-qg-hl` model) to generate context-aware questions for the answers.
   - **Cloze (Fill-in-the-blank) fallback** if the transformers model fails or is loading, ensuring 100% reliability.
3. **Interactive Spaced Repetition**: Review cards one-by-one with a smooth 3D flip card effect. Mark cards as **"Known"** or **"Not Known"**.
   - **Weighted random selection** determines future card appearances.
   - **Known** cards have their weight halved (min 0.1), showing up less frequently.
   - **Not Known** cards have their weight doubled (max 5.0), showing up more frequently.
4. **Editable Previews**: Add, edit, or delete individual cards in the generation preview workbench before saving them.
5. **Dashboard Management**: Track progress percentages and relative timestamps for all saved study decks on a responsive grid dashboard.

---

## Tech Stack

- **Frontend**: Vanilla HTML5, CSS3 (Midnight Scholar theme), ES6 Javascript.
- **Backend**: FastAPI + Uvicorn (lifespan configuration).
- **Database**: MongoDB Atlas via Motor async driver.
- **NLP Library**: NLTK, scikit-learn, Hugging Face Transformers.

---

## Installation & Setup

### Prerequisites
- Python 3.9+ installed.
- A MongoDB Atlas connection string (or local MongoDB connection).

### 1. Clone the project
Navigate into your project folder:
```bash
cd GISUL_PROJECT
```

### 2. Configure Environment variables
Create a `.env` file in the `backend/` directory:
```env
MONGODB_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/flashcard_db?retryWrites=true&w=majority
JWT_SECRET=3b8a1c9db9ef8f0b75a1c8f85f3c9e6de8b5ef83a9d20c5d6e7f8a9b0c1d2e3f
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```
*Note: Replace `MONGODB_URL` with your actual MongoDB Atlas cluster free-tier connection string. Generate a secure secret key with `python -c "import secrets; print(secrets.token_hex(32))"` and set it as `JWT_SECRET`.*

### 3. Create a Virtual Environment & Install Dependencies
Run the following commands in your shell to set up the backend:
```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment (Windows)
venv\Scripts\activate

# Install requirements
pip install -r backend/requirements.txt
```
*(On first load of the generation feature, the system will automatically download NLTK data components and cache the Hugging Face `valhalla/t5-small-qg-hl` model ~242MB. Make sure you are connected to the internet.)*

---

## Running the Application

Start the backend server using Uvicorn:
```bash
cd backend
uvicorn main:app --reload --port 8000
```

Once the server is running, open your web browser and visit:
**[http://localhost:8000](http://localhost:8000)**

This will serve the frontend client directly.

---

## API Documentation

FastAPI provides interactive Swagger documentation automatically:
- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

### Key Endpoints:
- `POST /api/auth/signup`: Create a new account.
- `POST /api/auth/login`: Authenticate and receive a JWT access token.
- `POST /api/flashcards/generate`: Run NLP pipeline to create flashcards from text.
- `GET /api/flashcards/sets`: Retrieve user's flashcard sets with statistics.
- `GET /api/review/{set_id}/next`: Fetch the next card to review using weighted random selection.
- `PATCH /api/review/{card_id}`: Update review status ("known" / "not_known") to adjust spaced repetition weights.
