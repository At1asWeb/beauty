from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_session
from ..models import Booking, BookingStatus, Master, Review, User
from ..schemas import ReviewCreate, ReviewOut

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.post("", response_model=ReviewOut, status_code=201)
async def create_review(
    payload: ReviewCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ReviewOut:
    b = await session.get(Booking, payload.booking_id)
    if b is None:
        raise HTTPException(404, "booking not found")
    if b.client_id != user.id:
        raise HTTPException(403, "not your booking")
    if b.status != BookingStatus.COMPLETED:
        raise HTTPException(
            409, "review allowed only for completed bookings"
        )

    existing = (
        await session.execute(
            select(Review).where(Review.booking_id == b.id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(409, "this visit is already reviewed")

    r = Review(
        booking_id=b.id,
        master_id=b.master_id,
        client_id=b.client_id,
        rating=payload.rating,
        text=payload.text,
    )
    session.add(r)
    # Flush so the aggregate below sees the new row.
    await session.flush()

    agg = (
        await session.execute(
            select(func.avg(Review.rating), func.count(Review.id)).where(
                Review.master_id == b.master_id
            )
        )
    ).one()
    avg_val, count_val = agg
    master = await session.get(Master, b.master_id)
    if master is not None:
        master.rating_avg = round(float(avg_val or 0), 2)
        master.rating_count = int(count_val or 0)

    await session.commit()
    await session.refresh(r)
    return ReviewOut.model_validate(r)
