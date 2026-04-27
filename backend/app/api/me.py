from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..config import get_settings
from ..database import get_session
from ..models import Master, User
from ..schemas import MeOut, UserOut

router = APIRouter(tags=["me"])


@router.get("/me", response_model=MeOut)
async def me(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MeOut:
    settings = get_settings()
    master = (
        await session.execute(select(Master).where(Master.user_id == user.id))
    ).scalar_one_or_none()
    return MeOut(
        user=UserOut.model_validate(user),
        is_master=master is not None,
        master_id=master.id if master else None,
        salon_name=settings.salon_name,
        salon_banner_url=settings.salon_banner_url,
    )
