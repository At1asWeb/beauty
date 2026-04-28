from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import (
    Booking,
    BookingStatus,
    ClientBlock,
    Master,
    MasterCategory,
    MasterService,
    Schedule,
    Service,
)

# Only these statuses count as "occupying" a slot.
BUSY_STATUSES = (BookingStatus.PENDING, BookingStatus.CONFIRMED)

# Granularity at which we expose start times. 30 min is the common
# default for salons and keeps the slot grid compact.
SLOT_STEP_MIN = 30


def _combine(d: date, t: time) -> datetime:
    return datetime.combine(d, t, tzinfo=timezone.utc)


async def get_effective_service(
    session: AsyncSession, master_id: int, service_id: int
) -> tuple[Service, float, int] | None:
    """Resolve the price/duration to use for a given master+service.

    A master is assigned to whole categories (`master_categories`) and
    implicitly performs every active service inside each linked
    category. We additionally honour any per-service override left over
    in `master_services` if one exists, but the assignment itself comes
    from the category mapping.

    Returns (service, price, duration_minutes) or None if this master
    doesn't perform that service.
    """

    q = (
        select(Service)
        .join(
            MasterCategory,
            and_(
                MasterCategory.category_id == Service.category_id,
                MasterCategory.master_id == master_id,
            ),
        )
        .where(Service.id == service_id, Service.is_active.is_(True))
    )
    service = (await session.execute(q)).scalars().first()
    if service is None:
        return None

    override = (
        await session.execute(
            select(MasterService).where(
                MasterService.master_id == master_id,
                MasterService.service_id == service_id,
            )
        )
    ).scalar_one_or_none()
    price = float(
        override.price_override
        if override and override.price_override is not None
        else service.price
    )
    duration = (
        override.duration_override_min
        if override and override.duration_override_min is not None
        else service.duration_min
    )
    return service, price, duration


async def _load_day_schedule(
    session: AsyncSession, master_id: int, day: date
) -> list[tuple[time, time]] | None:
    """Return working intervals for the day, or None if it's a day off.

    Date-specific overrides take precedence over the weekly weekday
    pattern.
    """

    # 1. Date-specific override (may mark off or define explicit hours)
    date_rows = (
        await session.execute(
            select(Schedule)
            .where(Schedule.master_id == master_id, Schedule.date == day)
            .order_by(Schedule.start_time)
        )
    ).scalars().all()
    if date_rows:
        if any(r.is_off for r in date_rows):
            return None
        return [(r.start_time, r.end_time) for r in date_rows]

    # 2. Weekly pattern
    wd_rows = (
        await session.execute(
            select(Schedule)
            .where(
                Schedule.master_id == master_id,
                Schedule.weekday == day.weekday(),
            )
            .order_by(Schedule.start_time)
        )
    ).scalars().all()
    if not wd_rows:
        return None
    if any(r.is_off for r in wd_rows):
        return None
    return [(r.start_time, r.end_time) for r in wd_rows]


async def _busy_ranges(
    session: AsyncSession,
    master_id: int,
    day_start: datetime,
    day_end: datetime,
) -> list[tuple[datetime, datetime]]:
    q = select(Booking.start_at, Booking.end_at).where(
        Booking.master_id == master_id,
        Booking.status.in_(BUSY_STATUSES),
        Booking.start_at < day_end,
        Booking.end_at > day_start,
    )
    rows = (await session.execute(q)).all()
    return [(r[0], r[1]) for r in rows]


def _overlaps(
    a_start: datetime,
    a_end: datetime,
    busy: Iterable[tuple[datetime, datetime]],
) -> bool:
    for b_start, b_end in busy:
        if a_start < b_end and a_end > b_start:
            return True
    return False


async def compute_available_slots(
    session: AsyncSession,
    master_id: int,
    service_id: int,
    day: date,
    now: datetime | None = None,
) -> list[tuple[datetime, datetime]]:
    """Return a list of bookable (start, end) pairs for `day`.

    The caller should filter past slots itself if it prefers to allow
    "book for 10 minutes from now" — we filter anything starting before
    `now` here by default.
    """

    resolved = await get_effective_service(session, master_id, service_id)
    if resolved is None:
        return []
    _service, _price, duration_min = resolved

    master = (
        await session.execute(select(Master).where(Master.id == master_id))
    ).scalar_one_or_none()
    if master is None or master.booking_stopped or not master.is_active:
        return []

    intervals = await _load_day_schedule(session, master_id, day)
    if not intervals:
        return []

    day_start = _combine(day, time(0, 0))
    day_end = _combine(day + timedelta(days=1), time(0, 0))
    busy = await _busy_ranges(session, master_id, day_start, day_end)

    slot_step = timedelta(minutes=SLOT_STEP_MIN)
    service_dur = timedelta(minutes=duration_min)
    now_ts = now or datetime.now(timezone.utc)

    out: list[tuple[datetime, datetime]] = []
    for start_t, end_t in intervals:
        cursor = _combine(day, start_t)
        interval_end = _combine(day, end_t)
        while cursor + service_dur <= interval_end:
            slot_end = cursor + service_dur
            if cursor > now_ts and not _overlaps(cursor, slot_end, busy):
                out.append((cursor, slot_end))
            cursor += slot_step
    return out


async def is_client_blocked(
    session: AsyncSession, master_id: int, client_id: int
) -> bool:
    q = select(ClientBlock.id).where(
        ClientBlock.master_id == master_id,
        ClientBlock.client_id == client_id,
    )
    return (await session.execute(q)).scalar_one_or_none() is not None
