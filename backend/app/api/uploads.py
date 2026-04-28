from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_role
from ..config import get_settings
from ..database import get_session
from ..models import Upload, User, UserRole
from ..schemas import UploadOut

router = APIRouter(prefix="/uploads", tags=["uploads"])

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
}


@router.post("", response_model=UploadOut)
async def create_upload(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    actor: User = Depends(require_role(UserRole.MASTER)),
) -> UploadOut:
    """Accept an image upload from the admin/master UI.

    The blob is stored straight in Postgres so the deployment doesn't
    depend on any external object storage. Size is bounded by the
    `UPLOAD_MAX_BYTES` setting (default 8 MB). Only common image MIME
    types are accepted; the file is served back at `/api/uploads/{id}`.
    """
    settings = get_settings()
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            415, f"unsupported content type: {content_type or 'unknown'}"
        )
    data = await file.read()
    if not data:
        raise HTTPException(400, "empty file")
    if len(data) > settings.upload_max_bytes:
        raise HTTPException(
            413,
            f"file too large (limit {settings.upload_max_bytes // 1024} KB)",
        )

    up = Upload(
        owner_id=actor.id,
        content_type=content_type,
        filename=(file.filename or None),
        size=len(data),
        data=data,
    )
    session.add(up)
    await session.commit()
    await session.refresh(up)
    return UploadOut(
        id=up.id,
        url=f"/api/uploads/{up.id}",
        content_type=up.content_type,
        size=up.size,
    )


@router.get("/{upload_id}")
async def get_upload(
    upload_id: int,
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Serve an uploaded image. Public on purpose so <img> tags work
    without forwarding the Telegram initData header.
    """
    up = await session.get(Upload, upload_id)
    if up is None:
        raise HTTPException(404, "upload not found")
    return Response(
        content=up.data,
        media_type=up.content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )
