from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_role
from ..database import get_session
from ..models import Broadcast, User, UserRole
from ..schemas import BroadcastCreate, BroadcastOut, UserOut
from ..services.bot import escape_html, send_message
from ..config import get_settings

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[UserOut])
async def list_users(
    session: AsyncSession = Depends(get_session),
    _: User = Depends(require_role(UserRole.ADMIN)),
) -> list[UserOut]:
    rows = (
        await session.execute(select(User).order_by(User.created_at.desc()))
    ).scalars().all()
    return [UserOut.model_validate(u) for u in rows]


@router.patch("/users/{user_id}/role", response_model=UserOut)
async def change_user_role(
    user_id: int,
    role: UserRole,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(require_role(UserRole.ADMIN)),
) -> UserOut:
    u = await session.get(User, user_id)
    if u is None:
        raise HTTPException(404, "user not found")
    u.role = role
    await session.commit()
    await session.refresh(u)
    return UserOut.model_validate(u)


@router.post("/broadcasts", response_model=BroadcastOut, status_code=201)
async def create_broadcast(
    payload: BroadcastCreate,
    session: AsyncSession = Depends(get_session),
    actor: User = Depends(require_role(UserRole.ADMIN)),
) -> BroadcastOut:
    settings = get_settings()
    salon = escape_html(settings.salon_name)
    # Freeze the list of recipients at send time: every user who isn't
    # blocked in our system and has a tg_id receives the message.
    rows = (
        await session.execute(
            select(User).where(User.is_blocked.is_(False))
        )
    ).scalars().all()

    sent = 0
    failed = 0
    text = f"📣 <b>{salon}</b>\n\n{escape_html(payload.text)}"
    for u in rows:
        ok = await send_message(u.tg_id, text)
        if ok:
            sent += 1
        else:
            failed += 1

    br = Broadcast(
        author_id=actor.id,
        text=payload.text,
        sent_count=sent,
        failed_count=failed,
    )
    session.add(br)
    await session.commit()
    await session.refresh(br)
    return BroadcastOut.model_validate(br)
