from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    MONGODB_URL: str = "mongodb://localhost:27017/flashcard_db"
    JWT_SECRET: str = "3b8a1c9db9ef8f0b75a1c8f85f3c9e6de8b5ef83a9d20c5d6e7f8a9b0c1d2e3f"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()
