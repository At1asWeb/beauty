from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    Values mirror the variables documented in `.env.example`. Defaults
    target local docker-compose development; production deployments
    should override every secret via the environment.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    telegram_bot_token: str = Field(default="", alias="TELEGRAM_BOT_TOKEN")
    root_admin_tg_id: int = Field(default=0, alias="ROOT_ADMIN_TG_ID")
    salon_name: str = Field(default="Салон красоты", alias="SALON_NAME")
    database_url: str = Field(
        default="postgresql+asyncpg://salon:salon@localhost:5432/salon",
        alias="DATABASE_URL",
    )
    webapp_public_url: str = Field(
        default="http://localhost:5173", alias="WEBAPP_PUBLIC_URL"
    )
    cors_origins: str = Field(
        default="http://localhost:5173,https://web.telegram.org",
        alias="CORS_ORIGINS",
    )
    dev_mode: bool = Field(default=False, alias="DEV_MODE")

    @property
    def cors_origin_list(self) -> list[str]:
        return [s.strip() for s in self.cors_origins.split(",") if s.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
