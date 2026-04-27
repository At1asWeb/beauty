from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user, require_role
from ..database import get_session
from ..models import Category, User, UserRole
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
    session: AsyncSession = Depends(get_session),
    _: User = Depends(require_role(UserRole.ADMIN)),
) -> None:
    c = await session.get(Category, category_id)
    if c is None:
        raise HTTPException(404, "category not found")
    await session.delete(c)
    await session.commit()
