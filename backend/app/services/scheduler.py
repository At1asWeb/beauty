from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from ..config import get_settings
from ..database import SessionLocal as AsyncSessionLocal
from ..models import Booking, BookingStatus
from .notifications import notify_booking_reminder

_log = logging.getLogger(__name__)
_task: asyncio.Task[None] | None = None

# How often the scheduler wakes up to look for upcoming bookings.
_TICK_SECONDS = 60


async def _tick_once() -> None:
    """Scan for bookings inside the reminder window and send pings.

    The window is [now+T-tick, now+T] where `T` is REMINDER_HOURS_BEFORE.
    `reminded_at` is set after the messages are dispatched so each
    booking is only reminded once even if the scheduler restarts.
    """
    settings = get_settings()
    if settings.reminder_hours_before <= 0:
        return
    horizon = timedelta(hours=settings.reminder_hours_before)
    now = datetime.now(timezone.utc)
    window_end = now + horizon
    # A small safety margin so a bit of clock drift or a missed tick
    # still picks up bookings whose ideal reminder time has already
    # passed.
    window_start = window_end - timedelta(seconds=_TICK_SECONDS * 2)

    async with AsyncSessionLocal() as session:
        q = (
            select(Booking)
            .where(
                Booking.status == BookingStatus.CONFIRMED,
                Booking.reminded_at.is_(None),
                Booking.start_at >= window_start,
                Booking.start_at <= window_end,
            )
            .order_by(Booking.start_at)
        )
        rows = (await session.execute(q)).scalars().all()
        for b in rows:
            try:
                await notify_booking_reminder(session, b.id)
                b.reminded_at = datetime.now(timezone.utc)
                await session.commit()
            except Exception:  # pragma: no cover - best-effort path
                _log.exception("reminder failed for booking %s", b.id)
                await session.rollback()


async def _loop() -> None:
    while True:
        try:
            await _tick_once()
        except Exception:  # pragma: no cover
            _log.exception("scheduler tick failed")
        await asyncio.sleep(_TICK_SECONDS)


def start_scheduler() -> None:
    """Spawn the background reminder loop.

    Idempotent: a second call is a no-op so test imports don't end up
    with multiple tickers competing.
    """
    global _task
    if _task is not None and not _task.done():
        return
    _task = asyncio.create_task(_loop(), name="reminder-scheduler")


async def stop_scheduler() -> None:
    global _task
    if _task is None:
        return
    _task.cancel()
    try:
        await _task
    except (asyncio.CancelledError, Exception):  # noqa: BLE001
        pass
    _task = None
