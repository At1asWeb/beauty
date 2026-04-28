from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user, require_role
from ..database import get_session
from ..models import Booking, Category, Service, User, UserRole
from ..schemas import CategoryCreate, CategoryOut

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
async def list_categories(
    session: AsyncSession = Depends(get_session),
    _: User = Depends(get_current_user),
) -> list[CategoryOut]:
    q = select(Category).order_by(Category.sort_order, Category.name)
    rows = (await session.execute(q)).scalars().all()
    return [CategoryOut.model_validate(c) for c in rows]


@router.post("", response_model=CategoryOut)
async def create_category(
    payload: CategoryCreate,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(require_role(UserRole.ADMIN)),
) -> CategoryOut:
    c = Category(**payload.model_dump())
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return CategoryOut.model_validate(c)


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: int,
    payload: CategoryCreate,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(require_role(UserRole.ADMIN)),
) -> CategoryOut:
    c = await session.get(Category, category_id)
    if c is None:
        raise HTTPException(404, "category not found")
    for k, v in payload.model_dump().items():
        setattr(c, k, v)
    await session.commit()
    await session.refresh(c)
    return CategoryOut.model_validate(c)


@router.delete("/{category_id}", status_code=204)
async def delete_category(
    category_id: int,
    force: bool = Query(False, description="Удалить вместе со связанными записями"),
    session: AsyncSession = Depends(get_session),
    _: User = Depends(require_role(UserRole.ADMIN)),
) -> None:
    """Delete a category.

    By default refuses with `409` when the category contains services
    that have bookings (because `bookings.service_id` is `RESTRICT`).
    Pass `?force=true` to also delete those bookings as part of the
    operation. Services and `master_categories` are removed via SQLAlchemy
    `cascade="all, delete-orphan"` regardless.
    """
    c = await session.get(Category, category_id)
    if c is None:
        raise HTTPException(404, "category not found")

    services_count = (
        await session.execute(
            select(func.count())
            .select_from(Service)
            .where(Service.category_id == category_id)
        )
    ).scalar_one()
    bookings_count = (
        await session.execute(
            select(func.count())
            .select_from(Booking)
            .join(Service, Booking.service_id == Service.id)
            .where(Service.category_id == category_id)
        )
    ).scalar_one()

    if bookings_count and not force:
        raise HTTPException(
            409,
            (
                f"В категории {services_count} услуг(и) с {bookings_count} "
                f"записями. Удалите записи или повторите с принудительным "
                f"удалением."
            ),
        )

    if force and bookings_count:
        await session.execute(
            delete(Booking).where(
                Booking.service_id.in_(
                    select(Service.id).where(Service.category_id == category_id)
                )
            )
        )

    await session.delete(c)
    await session.commit()
