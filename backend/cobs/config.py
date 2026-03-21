from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://drafttool:drafttool@localhost:5432/drafttool"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 10080  # 7 days

    model_config = {"env_prefix": "COBS_"}


settings = Settings()
