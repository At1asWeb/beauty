from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user, require_role
from ..config import get_settings
from ..database import get_session
from ..models import (
    Booking,
    BookingStatus,
    ClientBlock,
    ClientNote,
    Master,
    MasterService,
    Review,
    Schedule,
    User,
    UserRole,
)
from ..schemas import (
    ClientBlockOut,
    ClientNoteOut,
    ClientNoteUpdate,
    MasterCreate,
    MasterOut,
    MasterProfileUpdate,
    MasterServiceAssign,
    MasterStatsOut,
    ReviewOut,
    ScheduleEntry,
    ScheduleUpdate,
    ServiceOut,
    SlotOut,
    StopBookingUpdate,
)
from ..services.booking_logic import compute_available_slots

router = APIRouter(prefix="/masters", tags=["masters"])


def _ensure_self_or_admin(acting: User, master: Master) -> None:
    if acting.role == UserRole.ADMIN:
        return
    if master.user_id != acting.id:
        raise HTTPException(403, "not your master profile")


@router.get("", response_model=list[MasterOut])
async def list_masters(
    service_id: int | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    _: User = Depends(get_current_user),
) -> list[MasterOut]:
    q = select(Master).where(Master.is_active.is_(True))
    if service_id is not None:
        q = q.join(
            MasterService,
            and_(
                MasterService.master_id == Master.id,
                MasterService.service_id == service_id,
            ),
        )
    q = q.order_by(Master.display_name)
    rows = (await session.execute(q)).scalars().all()
    return [MasterOut.model_validate(m) for m in rows]


@router.post("", response_model=MasterOut)
async def create_master(
    payload: MasterCreate,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(require_role(UserRole.ADMIN)),
) -> MasterOut:
    # Upsert the target user by tg_id so an admin may add a master who
    # hasn't opened the app yet.
    user = (
        await session.execute(select(User).where(User.tg_id == payload.tg_id))
    ).scalar_one_or_none()
    if user is None:
        user = User(tg_id=payload.tg_id, first_name=payload.display_name)
        session.add(user)
        await session.flush()
    user.role = UserRole.ADMIN if payload.is_admin else UserRole.MASTER

    existing = (
        await session.execute(select(Master).where(Master.user_id == user.id))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(409, "user is already a master")

    m = Master(
        user_id=user.id,
        display_name=payload.display_name,
        bio=payload.bio,
        photo_url=payload.photo_url,
    )
    session.add(m)
    await session.commit()
    await session.refresh(m)
    return MasterOut.model_validate(m)


@router.get("/{master_id}", response_model=MasterOut)
async def get_master(
    master_id: int,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(get_current_user),
) -> MasterOut:
    m = await session.get(Master, master_id)
    if m is None:
        raise HTTPException(404, "master not found")
    return MasterOut.model_validate(m)


@router.patch("/{master_id}", response_model=MasterOut)
async def update_master(
    master_id: int,
    payload: MasterProfileUpdate,
    session: AsyncSession = Depends(get_session),
    actor: User = Depends(require_role(UserRole.MASTER)),
) -> MasterOut:
    m = await session.get(Master, master_id)
    if m is None:
        raise HTTPException(404, "master not found")
    _ensure_self_or_admin(actor, m)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(m, k, v)
    await session.commit()
    await session.refresh(m)
    return MasterOut.model_validate(m)


@router.delete("/{master_id}", status_code=204)
async def delete_master(
    master_id: int,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(require_role(UserRole.ADMIN)),
) -> None:
    m = await session.get(Master, master_id)
    if m is None:
        raise HTTPException(404, "master not found")
    # Demote the user back to CLIENT unless they were an explicit admin
    # set via env (root admin stays an admin on next login).
    user = await session.get(User, m.user_id)
    if user is not None and user.role == UserRole.MASTER:
        user.role = UserRole.CLIENT
    await session.delete(m)
    await session.commit()


@router.post("/{master_id}/stop-booking", response_model=MasterOut)
async def set_stop_booking(
    master_id: int,
    payload: StopBookingUpdate,
    session: AsyncSession = Depends(get_session),
    actor: User = Depends(require_role(UserRole.MASTER)),
) -> MasterOut:
    m = await session.get(Master, master_id)
    if m is None:
        raise HTTPException(404, "master not found")
    _ensure_self_or_admin(actor, m)
    m.booking_stopped = payload.booking_stopped
    m.booking_stopped_reason = (
        payload.booking_stopped_reason if payload.booking_stopped else None
    )
    await session.commit()
    await session.refresh(m)
    return MasterOut.model_validate(m)


# ---- services offered by this master ----


@router.get("/{master_id}/services", response_model=list[ServiceOut])
async def list_master_services(
    master_id: int,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(get_current_user),
) -> list[ServiceOut]:
    from ..models import Service  # local import to avoid cycle noise

    q = (
        select(Service)
        .join(
            MasterService,
            and_(
                MasterService.service_id == Service.id,
                MasterService.master_id == master_id,
            ),
        )
        .where(Service.is_active.is_(True))
        .order_by(Service.name)
    )
    rows = (await session.execute(q)).scalars().all()
    return [ServiceOut.model_validate(s) for s in rows]


@router.post("/{master_id}/services", response_model=ServiceOut)
async def add_master_service(
    master_id: int,
    payload: MasterServiceAssign,
    session: AsyncSession = Depends(get_session),
    actor: User = Depends(require_role(UserRole.MASTER)),
) -> ServiceOut:
    from ..models import Service

    m = await session.get(Master, master_id)
    if m is None:
        raise HTTPException(404, "master not found")
    _ensure_self_or_admin(actor, m)
    svc = await session.get(Service, payload.service_id)
    if svc is None:
        raise HTTPException(404, "service not found")
    existing = (
        await session.execute(
            select(MasterService).where(
                MasterService.master_id == master_id,
                MasterService.service_id == payload.service_id,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        session.add(
            MasterService(
                master_id=master_id,
                service_id=payload.service_id,
                price_override=payload.price_override,
                duration_override_min=payload.duration_override_min,
            )
        )
    else:
        existing.price_override = payload.price_override
        existing.duration_override_min = payload.duration_override_min
    await session.commit()
    return ServiceOut.model_validate(svc)


@router.delete(
    "/{master_id}/services/{service_id}", status_code=204
)
async def remove_master_service(
    master_id: int,
    service_id: int,
    session: AsyncSession = Depends(get_session),
    actor: User = Depends(require_role(UserRole.MASTER)),
) -> None:
    m = await session.get(Master, master_id)
    if m is None:
        raise HTTPException(404, "master not found")
    _ensure_self_or_admin(actor, m)
    await session.execute(
        delete(MasterService).where(
            MasterService.master_id == master_id,
            MasterService.service_id == service_id,
        )
    )
    await session.commit()


# ---- schedule ----


@router.get("/{master_id}/schedule", response_model=list[ScheduleEntry])
async def get_schedule(
    master_id: int,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(get_current_user),
) -> list[ScheduleEntry]:
    q = (
        select(Schedule)
        .where(Schedule.master_id == master_id)
        .order_by(Schedule.weekday, Schedule.date, Schedule.start_time)
    )
    rows = (await session.execute(q)).scalars().all()
    return [
        ScheduleEntry(
            id=r.id,
            weekday=r.weekday,
            date=r.date,
            start_time=r.start_time,
            end_time=r.end_time,
            is_off=r.is_off,
        )
        for r in rows
    ]


@router.put("/{master_id}/schedule", response_model=list[ScheduleEntry])
async def replace_schedule(
    master_id: int,
    payload: ScheduleUpdate,
    session: AsyncSession = Depends(get_session),
    actor: User = Depends(require_role(UserRole.MASTER)),
) -> list[ScheduleEntry]:
    m = await session.get(Master, master_id)
    if m is None:
        raise HTTPException(404, "master not found")
    _ensure_self_or_admin(actor, m)

    for e in payload.entries:
        if (e.weekday is None) == (e.date is None):
            raise HTTPException(
                400, "each entry must specify exactly one of weekday/date"
            )
        if e.end_time <= e.start_time and not e.is_off:
            raise HTTPException(400, "end_time must be greater than start_time")

    await session.execute(
        delete(Schedule).where(Schedule.master_id == master_id)
    )
    for e in payload.entries:
        session.add(
            Schedule(
                master_id=master_id,
                weekday=e.weekday,
                date=e.date,
                start_time=e.start_time,
                end_time=e.end_time,
                is_off=e.is_off,
            )
        )
    await session.commit()
    return await get_schedule(master_id, session, actor)


@router.get("/{master_id}/slots", response_model=list[SlotOut])
async def get_slots(
    master_id: int,
    service_id: int = Query(...),
    day: date = Query(...),
    session: AsyncSession = Depends(get_session),
    _: User = Depends(get_current_user),
) -> list[SlotOut]:
    slots = await compute_available_slots(session, master_id, service_id, day)
    return [SlotOut(start_at=s, end_at=e) for s, e in slots]


# ---- reviews listing ----


@router.get("/{master_id}/reviews", response_model=list[ReviewOut])
async def list_master_reviews(
    master_id: int,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(get_current_user),
) -> list[ReviewOut]:
    q = (
        select(Review)
        .where(Review.master_id == master_id)
        .order_by(Review.created_at.desc())
    )
    rows = (await session.execute(q)).scalars().all()
    return [ReviewOut.model_validate(r) for r in rows]


# ---- client notes ----


@router.get(
    "/{master_id}/clients/{client_id}/note", response_model=ClientNoteOut
)
async def get_client_note(
    master_id: int,
    client_id: int,
    session: AsyncSession = Depends(get_session),
    actor: User = Depends(require_role(UserRole.MASTER)),
) -> ClientNoteOut:
    m = await session.get(Master, master_id)
    if m is None:
        raise HTTPException(404, "master not found")
    _ensure_self_or_admin(actor, m)
    note = (
        await session.execute(
            select(ClientNote).where(
                ClientNote.master_id == master_id,
                ClientNote.client_id == client_id,
            )
        )
    ).scalar_one_or_none()
    if note is None:
        note = ClientNote(master_id=master_id, client_id=client_id, text="")
        session.add(note)
        await session.commit()
        await session.refresh(note)
    return ClientNoteOut.model_validate(note)


@router.put(
    "/{master_id}/clients/{client_id}/note", response_model=ClientNoteOut
)
async def set_client_note(
    master_id: int,
    client_id: int,
    payload: ClientNoteUpdate,
    session: AsyncSession = Depends(get_session),
    actor: User = Depends(require_role(UserRole.MASTER)),
) -> ClientNoteOut:
    m = await session.get(Master, master_id)
    if m is None:
        raise HTTPException(404, "master not found")
    _ensure_self_or_admin(actor, m)
    note = (
        await session.execute(
            select(ClientNote).where(
                ClientNote.master_id == master_id,
                ClientNote.client_id == client_id,
            )
        )
    ).scalar_one_or_none()
    if note is None:
        note = ClientNote(
            master_id=master_id, client_id=client_id, text=payload.text
        )
        session.add(note)
    else:
        note.text = payload.text
    await session.commit()
    await session.refresh(note)
    return ClientNoteOut.model_validate(note)


# ---- client blocks ----


@router.get("/{master_id}/blocks", response_model=list[ClientBlockOut])
async def list_blocks(
    master_id: int,
    session: AsyncSession = Depends(get_session),
    actor: User = Depends(require_role(UserRole.MASTER)),
) -> list[ClientBlockOut]:
    m = await session.get(Master, master_id)
    if m is None:
        raise HTTPException(404, "master not found")
    _ensure_self_or_admin(actor, m)
    rows = (
        await session.execute(
            select(ClientBlock).where(ClientBlock.master_id == master_id)
        )
    ).scalars().all()
    return [ClientBlockOut.model_validate(b) for b in rows]


@router.post(
    "/{master_id}/blocks/{client_id}", response_model=ClientBlockOut
)
async def block_client(
    master_id: int,
    client_id: int,
    reason: str | None = None,
    session: AsyncSession = Depends(get_session),
    actor: User = Depends(require_role(UserRole.MASTER)),
) -> ClientBlockOut:
    m = await session.get(Master, master_id)
    if m is None:
        raise HTTPException(404, "master not found")
    _ensure_self_or_admin(actor, m)
    if await session.get(User, client_id) is None:
        raise HTTPException(404, "client not found")
    existing = (
        await session.execute(
            select(ClientBlock).where(
                ClientBlock.master_id == master_id,
                ClientBlock.client_id == client_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.reason = reason
        await session.commit()
        await session.refresh(existing)
        return ClientBlockOut.model_validate(existing)
    block = ClientBlock(
        master_id=master_id, client_id=client_id, reason=reason
    )
    session.add(block)
    await session.commit()
    await session.refresh(block)
    return ClientBlockOut.model_validate(block)


@router.delete("/{master_id}/blocks/{client_id}", status_code=204)
async def unblock_client(
    master_id: int,
    client_id: int,
    session: AsyncSession = Depends(get_session),
    actor: User = Depends(require_role(UserRole.MASTER)),
) -> None:
    m = await session.get(Master, master_id)
    if m is None:
        raise HTTPException(404, "master not found")
    _ensure_self_or_admin(actor, m)
    await session.execute(
        delete(ClientBlock).where(
            ClientBlock.master_id == master_id,
            ClientBlock.client_id == client_id,
        )
    )
    await session.commit()


# ---- stats ----


@router.get("/{master_id}/stats", response_model=MasterStatsOut)
async def master_stats(
    master_id: int,
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    session: AsyncSession = Depends(get_session),
    actor: User = Depends(require_role(UserRole.MASTER)),
) -> MasterStatsOut:
    m = await session.get(Master, master_id)
    if m is None:
        raise HTTPException(404, "master not found")
    _ensure_self_or_admin(actor, m)

    today = date.today()
    start = from_date or (today - timedelta(days=30))
    end = to_date or today

    from datetime import datetime, time, timezone

    start_dt = datetime.combine(start, time(0, 0), tzinfo=timezone.utc)
    end_dt = datetime.combine(
        end + timedelta(days=1), time(0, 0), tzinfo=timezone.utc
    )

    total_q = select(func.count(Booking.id)).where(
        Booking.master_id == master_id,
        Booking.start_at >= start_dt,
        Booking.start_at < end_dt,
    )
    completed_q = total_q.where(Booking.status == BookingStatus.COMPLETED)
    cancelled_q = total_q.where(Booking.status == BookingStatus.CANCELLED)
    revenue_q = select(
        func.coalesce(func.sum(Booking.price_at_booking), 0)
    ).where(
        Booking.master_id == master_id,
        Booking.status == BookingStatus.COMPLETED,
        Booking.start_at >= start_dt,
        Booking.start_at < end_dt,
    )

    total = (await session.execute(total_q)).scalar_one()
    completed = (await session.execute(completed_q)).scalar_one()
    cancelled = (await session.execute(cancelled_q)).scalar_one()
    revenue = (await session.execute(revenue_q)).scalar_one()
    if isinstance(revenue, Decimal):
        revenue = float(revenue)

    return MasterStatsOut(
        master_id=master_id,
        from_date=start,
        to_date=end,
        total_bookings=int(total),
        completed_bookings=int(completed),
        cancelled_bookings=int(cancelled),
        revenue=float(revenue),
    )
