import os
import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.database import get_database, ping_database, close_database
from backend.routers import auth, flashcards, review
from backend.services.nlp_service import load_qg_model

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Warm up model asynchronously on startup
async def warmup_model():
    # Run QG model loader in standard threadpool to not block asyncio event loop
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, load_qg_model)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Connect to database
    try:
        await ping_database()
        logger.info("Database connected successfully.")
        
        # Create indexes
        db = get_database()
        await db.users.create_index("email", unique=True)
        await db.flashcard_sets.create_index("user_id")
        await db.flashcards.create_index("set_id")
        logger.info("Database indexes ensured.")
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        
    # 2. Warm up model in background
    asyncio.create_task(warmup_model())
    
    yield
    
    # 3. Shutdown database connection
    close_database()
    logger.info("Database connection closed.")

app = FastAPI(
    title="Smart Flashcard Generator API",
    description="Backend service using NLP to generate flashcards from text notes.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(flashcards.router, prefix="/api/flashcards", tags=["Flashcards"])
app.include_router(review.router, prefix="/api/review", tags=["Review"])

# Mount static files to serve the frontend
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
    logger.info(f"Mounted frontend static files from {frontend_dir}")
else:
    logger.warning(f"Frontend directory not found at {frontend_dir}. API only mode.")
