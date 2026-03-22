import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://drafttool:drafttool@localhost:5432/drafttool"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 10080  # 7 days
    upload_dir: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
    max_upload_size: int = 25 * 1024 * 1024  # 25 MB
    max_image_dimension: int = 1200

    model_config = {"env_prefix": "COBS_"}


settings = Settings()
