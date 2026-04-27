from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user, require_role
from ..database import get_session
from ..models import GalleryItem, User, UserRole
from ..schemas import GalleryItemCreate, GalleryItemOut

router = APIRouter(prefix="/gallery", tags=["gallery"])


@router.get("", response_model=list[GalleryItemOut])
async def list_gallery(
    master_id: int | None = None,
    service_id: int | None = None,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(get_current_user),
) -> list[GalleryItemOut]:
    q = select(GalleryItem)
    if master_id is not None:
        q = q.where(GalleryItem.master_id == master_id)
    if service_id is not None:
        q = q.where(GalleryItem.service_id == service_id)
    q = q.order_by(
        GalleryItem.sort_order, GalleryItem.created_at.desc()
    )
    rows = (await session.execute(q)).scalars().all()
    return [GalleryItemOut.model_validate(r) for r in rows]


@router.post("", response_model=GalleryItemOut, status_code=201)
async def create_gallery_item(
    payload: GalleryItemCreate,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(require_role(UserRole.ADMIN)),
) -> GalleryItemOut:
    item = GalleryItem(**payload.model_dump())
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return GalleryItemOut.model_validate(item)


@router.delete("/{item_id}", status_code=204)
async def delete_gallery_item(
    item_id: int,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(require_role(UserRole.ADMIN)),
) -> None:
    item = await session.get(GalleryItem, item_id)
    if item is None:
        raise HTTPException(404, "gallery item not found")
    await session.delete(item)
    await session.commit()
