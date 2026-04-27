from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .database import get_session
from .models import User, UserRole

# Telegram's initData is considered valid for 24h after issue; we also
# refuse blatantly future timestamps as a safety margin against skew.
INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60


@dataclass(frozen=True)
class TelegramUser:
    """Parsed Telegram user payload from the WebApp initData string.

    Fields mirror the `WebAppUser` from the Telegram Web Apps API.
    """

    tg_id: int
    username: str | None
    first_name: str
    last_name: str | None
    language_code: str | None
    photo_url: str | None


def _compute_secret_key(bot_token: str) -> bytes:
    # Per the Telegram WebApp docs:
    #   secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
    return hmac.new(
        key=b"WebAppData", msg=bot_token.encode(), digestmod=hashlib.sha256
    ).digest()


def verify_init_data(init_data: str, bot_token: str) -> dict[str, str]:
    """Validate the initData string and return its parsed fields.

    Raises HTTPException(401) on any validation failure.
    """

    if not init_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="init data missing"
        )
    if not bot_token:
        # Misconfiguration — don't pretend to validate.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="bot token not configured on server",
        )

    # parse_qsl preserves order of declaration, which is critical because
    # Telegram sends parameters in a specific sequence that must be
    # reproduced for HMAC to match.
    pairs = parse_qsl(init_data, keep_blank_values=True)
    provided_hash = None
    clean_pairs: list[tuple[str, str]] = []
    for key, value in pairs:
        if key == "hash":
            provided_hash = value
        else:
            clean_pairs.append((key, value))

    if not provided_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="no hash in init data"
        )

    clean_pairs.sort(key=lambda kv: kv[0])
    data_check_string = "\n".join(f"{k}={v}" for k, v in clean_pairs)

    secret_key = _compute_secret_key(bot_token)
    computed = hmac.new(
        key=secret_key,
        msg=data_check_string.encode(),
        digestmod=hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(computed, provided_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="bad init data hash"
        )

    parsed = dict(clean_pairs)
    auth_date = int(parsed.get("auth_date", "0") or "0")
    if auth_date == 0:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="no auth_date"
        )
    now = int(time.time())
    if abs(now - auth_date) > INIT_DATA_MAX_AGE_SEC:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="init data expired"
        )
    return parsed


def parse_tg_user(init_data_parsed: dict[str, str]) -> TelegramUser:
    raw = init_data_parsed.get("user")
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="no user in init data"
        )
    try:
        user_obj = json.loads(raw)
    except json.JSONDecodeError as exc:  # noqa: BLE001 - narrow
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid user JSON in init data",
        ) from exc
    tg_id = user_obj.get("id")
    if not isinstance(tg_id, int):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="no user.id"
        )
    return TelegramUser(
        tg_id=tg_id,
        username=user_obj.get("username"),
        first_name=user_obj.get("first_name", "") or "",
        last_name=user_obj.get("last_name"),
        language_code=user_obj.get("language_code"),
        photo_url=user_obj.get("photo_url"),
    )


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> User:
    """FastAPI dependency that returns the authenticated DB user.

    Auth source priority:
      1. `Authorization: tma <initData>` header (recommended).
      2. `X-Telegram-Init-Data: <initData>` header (fallback).
      3. `X-Dev-User-Id` header (dev mode only).
    """

    settings = get_settings()
    init_data = None

    auth_header = request.headers.get("authorization") or ""
    if auth_header.lower().startswith("tma "):
        init_data = auth_header[4:].strip()
    if init_data is None:
        init_data = request.headers.get("x-telegram-init-data")

    if settings.dev_mode and not init_data:
        dev_id = request.headers.get("x-dev-user-id")
        if dev_id and dev_id.isdigit():
            tg_user = TelegramUser(
                tg_id=int(dev_id),
                username=f"dev_{dev_id}",
                first_name=f"Dev{dev_id}",
                last_name=None,
                language_code="ru",
                photo_url=None,
            )
            return await _get_or_create_user(session, tg_user)

    parsed = verify_init_data(init_data or "", settings.telegram_bot_token)
    tg_user = parse_tg_user(parsed)
    return await _get_or_create_user(session, tg_user)


async def _get_or_create_user(
    session: AsyncSession, tg_user: TelegramUser
) -> User:
    settings = get_settings()
    result = await session.execute(
        select(User).where(User.tg_id == tg_user.tg_id)
    )
    user = result.scalar_one_or_none()

    if user is None:
        role = (
            UserRole.ADMIN
            if tg_user.tg_id == settings.root_admin_tg_id
            else UserRole.CLIENT
        )
        user = User(
            tg_id=tg_user.tg_id,
            username=tg_user.username,
            first_name=tg_user.first_name,
            last_name=tg_user.last_name,
            language_code=tg_user.language_code,
            photo_url=tg_user.photo_url,
            role=role,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user

    # Keep profile fields fresh and promote the root admin if the env
    # was set after their first login.
    mutated = False
    if user.username != tg_user.username:
        user.username = tg_user.username
        mutated = True
    if user.first_name != tg_user.first_name and tg_user.first_name:
        user.first_name = tg_user.first_name
        mutated = True
    if user.last_name != tg_user.last_name:
        user.last_name = tg_user.last_name
        mutated = True
    if tg_user.photo_url and user.photo_url != tg_user.photo_url:
        user.photo_url = tg_user.photo_url
        mutated = True
    if (
        tg_user.tg_id == settings.root_admin_tg_id
        and user.role != UserRole.ADMIN
    ):
        user.role = UserRole.ADMIN
        mutated = True
    if mutated:
        await session.commit()
        await session.refresh(user)
    return user


def require_role(*roles: UserRole):
    """Dependency factory to enforce role membership.

    ADMIN implicitly satisfies any MASTER requirement (per spec:
    admin = extended master).
    """

    allowed = set(roles)
    if UserRole.MASTER in allowed:
        allowed.add(UserRole.ADMIN)

    async def _dep(user: User = Depends(get_current_user)) -> User:
        if user.is_blocked:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="user blocked",
            )
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="insufficient role",
            )
        return user

    return _dep
