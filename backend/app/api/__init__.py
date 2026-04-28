from fastapi import APIRouter

from . import (
    admin,
    bookings,
    categories,
    gallery,
    masters,
    me,
    reviews,
    services,
    uploads,
)

router = APIRouter(prefix="/api")
router.include_router(me.router)
router.include_router(categories.router)
router.include_router(services.router)
router.include_router(masters.router)
router.include_router(bookings.router)
router.include_router(reviews.router)
router.include_router(gallery.router)
router.include_router(uploads.router)
router.include_router(admin.router)

__all__ = ["router"]
