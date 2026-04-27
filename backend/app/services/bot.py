from __future__ import annotations

import logging

from aiogram import Bot
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramAPIError

from ..config import get_settings

_log = logging.getLogger(__name__)
_bot: Bot | None = None


def get_bot() -> Bot | None:
    """Return a shared aiogram Bot or `None` if the token isn't set."""

    global _bot
    settings = get_settings()
    if not settings.telegram_bot_token:
        return None
    if _bot is None:
        _bot = Bot(token=settings.telegram_bot_token)
    return _bot


async def send_message(tg_chat_id: int, text: str) -> bool:
    """Send a plain-HTML message. Returns True on success.

    Failures are logged but never raised — notification delivery must
    never block the primary booking flow.
    """

    bot = get_bot()
    if bot is None:
        _log.warning("bot token missing, skipping message to %s", tg_chat_id)
        return False
    try:
        await bot.send_message(
            chat_id=tg_chat_id, text=text, parse_mode=ParseMode.HTML
        )
        return True
    except TelegramAPIError as exc:
        _log.warning("telegram send failed chat_id=%s: %s", tg_chat_id, exc)
        return False


def escape_html(value: str) -> str:
    return (
        value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )
