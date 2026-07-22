"""
Backend configuration
"""
import os
from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path



class Settings(BaseSettings):
    """Application settings"""
    
    # API Settings
    app_name: str = "PrepMeAI API"
    app_version: str = "1.0.0"
    
    # Database
    database_url: str = "sqlite+aiosqlite:///./prepmeai.db"
    
    # Groq API
    groq_api_key: str = ""
    groq_model_primary: str = "llama-3.1-8b-instant"
    groq_model_fallback: str = "llama-3.3-70b-versatile"
    
    # PDF Paths
    pdf_path: str = "../ncert_science_8.pdf"
    pdf_science_path: str = "../ncert_science_8.pdf"
    pdf_maths_path: str = "../ncert_maths_8.pdf"
    
    # Embeddings
    embed_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    
    # Security
    secret_key: str = "prepmeai-dev-secret-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
