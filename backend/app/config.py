from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _normalize_database_url(raw: str) -> str:
    """Accept the DSN in the form that most managed Postgres providers
    hand out (Neon, Railway, Render, Heroku, Supabase all emit either
    `postgres://…` or `postgresql://…`) and upgrade it to the async
    driver required by SQLAlchemy. libpq-style query parameters like
    `sslmode=require` and `channel_binding=require` are not understood
    by asyncpg, so we translate them to asyncpg's `ssl=require` or
    strip them.
    """
    if not raw:
        return raw
    url = raw
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and "+asyncpg" not in url.split("://", 1)[0]:
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    if "?" in url:
        base, qs = url.split("?", 1)
        # libpq params asyncpg doesn't accept; map the common one.
        keep: list[str] = []
        want_ssl = False
        for pair in qs.split("&"):
            if not pair:
                continue
            key, _, value = pair.partition("=")
            if key == "sslmode":
                if value in ("require", "verify-ca", "verify-full"):
                    want_ssl = True
            elif key == "channel_binding":
                # Not supported by asyncpg; ignore (Neon works without it).
                continue
            elif key == "ssl":
                want_ssl = want_ssl or value in ("require", "true", "1")
            else:
                keep.append(pair)
        if want_ssl:
            keep.append("ssl=require")
        url = base + (f"?{'&'.join(keep)}" if keep else "")
    return url


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
    salon_banner_url: str = Field(
        default=(
            "https://images.unsplash.com/photo-1560066984-138dadb4c035"
            "?auto=format&fit=crop&w=1200&q=80"
        ),
        alias="SALON_BANNER_URL",
    )
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

    @field_validator("database_url")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        return _normalize_database_url(v)

    @property
    def cors_origin_list(self) -> list[str]:
        return [s.strip() for s in self.cors_origins.split(",") if s.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
