from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user, require_role
from ..database import get_session
from ..models import Category, Service, User, UserRole
from ..schemas import ServiceCreate, ServiceOut

router = APIRouter(prefix="/services", tags=["services"])


@router.get("", response_model=list[ServiceOut])
async def list_services(
    category_id: int | None = None,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(get_current_user),
) -> list[ServiceOut]:
    q = select(Service).where(Service.is_active.is_(True))
    if category_id is not None:
        q = q.where(Service.category_id == category_id)
    q = q.order_by(Service.name)
    rows = (await session.execute(q)).scalars().all()
    return [ServiceOut.model_validate(s) for s in rows]


@router.post("", response_model=ServiceOut)
async def create_service(
    payload: ServiceCreate,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(require_role(UserRole.ADMIN)),
) -> ServiceOut:
    if await session.get(Category, payload.category_id) is None:
        raise HTTPException(400, "category not found")
    s = Service(**payload.model_dump())
    session.add(s)
    await session.commit()
    await session.refresh(s)
    return ServiceOut.model_validate(s)


@router.patch("/{service_id}", response_model=ServiceOut)
async def update_service(
    service_id: int,
    payload: ServiceCreate,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(require_role(UserRole.ADMIN)),
) -> ServiceOut:
    s = await session.get(Service, service_id)
    if s is None:
        raise HTTPException(404, "service not found")
    for k, v in payload.model_dump().items():
        setattr(s, k, v)
    await session.commit()
    await session.refresh(s)
    return ServiceOut.model_validate(s)


@router.delete("/{service_id}", status_code=204)
async def delete_service(
    service_id: int,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(require_role(UserRole.ADMIN)),
) -> None:
    s = await session.get(Service, service_id)
    if s is None:
        raise HTTPException(404, "service not found")
    await session.delete(s)
    await session.commit()
