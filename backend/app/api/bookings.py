from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_current_user, require_role
from ..database import get_session
from ..models import Booking, BookingStatus, Master, User, UserRole
from ..schemas import BookingCreate, BookingOut, BookingUpdate
from ..services.booking_logic import (
    BUSY_STATUSES,
    get_effective_service,
    is_client_blocked,
)
from ..services.notifications import (
    notify_booking_created,
    notify_booking_status_change,
)

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.post("", response_model=BookingOut, status_code=201)
async def create_booking(
    payload: BookingCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> BookingOut:
    master = await session.get(Master, payload.master_id)
    if master is None or not master.is_active:
        raise HTTPException(404, "master not found")
    if master.booking_stopped:
        raise HTTPException(409, "booking is temporarily stopped by master")
    if await is_client_blocked(session, master.id, user.id):
        raise HTTPException(403, "client is blocked by master")

    resolved = await get_effective_service(
        session, master.id, payload.service_id
    )
    if resolved is None:
        raise HTTPException(400, "master does not perform this service")
    _service, price, duration_min = resolved

    start = payload.start_at
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if start <= datetime.now(timezone.utc):
        raise HTTPException(400, "start_at must be in the future")
    end = start + timedelta(minutes=duration_min)

    # Conflict check: any PENDING/CONFIRMED booking overlaps this window.
    conflict_q = select(Booking.id).where(
        Booking.master_id == master.id,
        Booking.status.in_(BUSY_STATUSES),
        Booking.start_at < end,
        Booking.end_at > start,
    )
    if (await session.execute(conflict_q)).scalar_one_or_none() is not None:
        raise HTTPException(409, "slot is not available")

    b = Booking(
        client_id=user.id,
        master_id=master.id,
        service_id=payload.service_id,
        start_at=start,
        end_at=end,
        price_at_booking=price,
        status=BookingStatus.PENDING,
        client_comment=payload.client_comment,
    )
    session.add(b)
    await session.commit()
    await session.refresh(b)

    await notify_booking_created(session, b.id)
    return BookingOut.model_validate(b)


@router.get("/my", response_model=list[BookingOut])
async def my_bookings(
    upcoming_only: bool = False,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[BookingOut]:
    q = select(Booking).where(Booking.client_id == user.id)
    if upcoming_only:
        q = q.where(
            Booking.start_at >= datetime.now(timezone.utc),
            Booking.status.in_(BUSY_STATUSES),
        )
    q = q.order_by(Booking.start_at.desc())
    rows = (await session.execute(q)).scalars().all()
    return [BookingOut.model_validate(b) for b in rows]


@router.get("/master/{master_id}", response_model=list[BookingOut])
async def master_bookings(
    master_id: int,
    status: BookingStatus | None = Query(default=None),
    from_ts: datetime | None = Query(default=None, alias="from"),
    to_ts: datetime | None = Query(default=None, alias="to"),
    session: AsyncSession = Depends(get_session),
    actor: User = Depends(require_role(UserRole.MASTER)),
) -> list[BookingOut]:
    master = await session.get(Master, master_id)
    if master is None:
        raise HTTPException(404, "master not found")
    if actor.role != UserRole.ADMIN and master.user_id != actor.id:
        raise HTTPException(403, "not your bookings")

    q = select(Booking).where(Booking.master_id == master_id)
    if status is not None:
        q = q.where(Booking.status == status)
    if from_ts is not None:
        q = q.where(Booking.start_at >= from_ts)
    if to_ts is not None:
        q = q.where(Booking.start_at <= to_ts)
    q = q.order_by(Booking.start_at.asc())
    rows = (await session.execute(q)).scalars().all()
    return [BookingOut.model_validate(b) for b in rows]


@router.patch("/{booking_id}", response_model=BookingOut)
async def update_booking(
    booking_id: int,
    payload: BookingUpdate,
    session: AsyncSession = Depends(get_session),
    actor: User = Depends(get_current_user),
) -> BookingOut:
    b = (
        await session.execute(
            select(Booking)
            .where(Booking.id == booking_id)
            .options(selectinload(Booking.master))
        )
    ).scalar_one_or_none()
    if b is None:
        raise HTTPException(404, "booking not found")

    is_client = b.client_id == actor.id
    is_master_self = (
        actor.role in (UserRole.MASTER, UserRole.ADMIN)
        and b.master.user_id == actor.id
    )
    is_admin = actor.role == UserRole.ADMIN
    if not (is_client or is_master_self or is_admin):
        raise HTTPException(403, "not your booking")

    new_status = payload.status
    if new_status == BookingStatus.CANCELLED:
        if not payload.cancellation_reason:
            raise HTTPException(400, "cancellation_reason is required")
        b.status = BookingStatus.CANCELLED
        b.cancellation_reason = payload.cancellation_reason
        b.cancelled_by_id = actor.id
    elif new_status == BookingStatus.CONFIRMED:
        if not (is_master_self or is_admin):
            raise HTTPException(403, "only master/admin can confirm")
        if b.status != BookingStatus.PENDING:
            raise HTTPException(409, "only pending bookings can be confirmed")
        b.status = BookingStatus.CONFIRMED
    elif new_status == BookingStatus.COMPLETED:
        if not (is_master_self or is_admin):
            raise HTTPException(403, "only master/admin can complete")
        if b.status not in (BookingStatus.CONFIRMED, BookingStatus.PENDING):
            raise HTTPException(409, "booking not in a completable state")
        b.status = BookingStatus.COMPLETED
    elif new_status == BookingStatus.NO_SHOW:
        if not (is_master_self or is_admin):
            raise HTTPException(403, "only master/admin can set no-show")
        b.status = BookingStatus.NO_SHOW
    else:
        raise HTTPException(400, "unsupported status transition")

    await session.commit()
    await session.refresh(b)
    await notify_booking_status_change(session, b.id, actor)
    return BookingOut.model_validate(b)
