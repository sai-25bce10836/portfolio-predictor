import os
from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application configuration environment settings.
    Reads values from backend/.env or system environment variables.
    """
    # Service Configuration
    PROJECT_NAME: str = "Quantitative ML Portfolio Terminal"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    FRONTEND_URL: str = "http://localhost:3000"
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # ML Pipeline Configuration Defaults
    DEFAULT_MODEL_TYPE: str = "linear"
    DEFAULT_LOOKBACK_DAYS: int = 90

    # Upstox OAuth 2.0 Credentials (Free Broker API)
    UPSTOX_CLIENT_ID: Optional[str] = None
    UPSTOX_CLIENT_SECRET: Optional[str] = None
    UPSTOX_REDIRECT_URI: str = "http://localhost:8000/api/upstox/callback"

    # Dhan API Credentials (Free Broker API)
    DHAN_CLIENT_ID: Optional[str] = None
    DHAN_ACCESS_TOKEN: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()