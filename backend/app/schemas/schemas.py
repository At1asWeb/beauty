from __future__ import annotations

from datetime import date as _Date, datetime, time

from pydantic import BaseModel, ConfigDict, Field

from ..models import BookingStatus, UserRole


class _ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserOut(_ORMBase):
    id: int
    tg_id: int
    username: str | None
    first_name: str
    last_name: str | None
    photo_url: str | None
    role: UserRole
    is_blocked: bool


class MeOut(BaseModel):
    """Current-user snapshot sent to the frontend on every app boot.

    `is_master` is true if the user has a linked Master record, which is
    independent of role: an admin may or may not also be a salon master.
    """

    user: UserOut
    is_master: bool
    master_id: int | None
    salon_name: str
    salon_banner_url: str


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    icon: str | None = None
    sort_order: int = 0
    is_active: bool = True


class CategoryOut(_ORMBase):
    id: int
    name: str
    description: str | None
    icon: str | None
    sort_order: int
    is_active: bool


class ServiceCreate(BaseModel):
    category_id: int
    name: str = Field(min_length=1, max_length=160)
    description: str | None = None
    price: float = 0
    duration_min: int = Field(default=60, gt=0, le=24 * 60)
    is_active: bool = True


class ServiceOut(_ORMBase):
    id: int
    category_id: int
    name: str
    description: str | None
    price: float
    duration_min: int
    is_active: bool


class MasterCreate(BaseModel):
    """Admin payload when adding a new master by their Telegram id.

    The user record is created lazily if this tg_id hasn't logged in yet;
    display_name may be taken from the current Telegram profile on first
    `/me`.
    """

    tg_id: int
    display_name: str = Field(min_length=1, max_length=128)
    bio: str | None = None
    photo_url: str | None = None
    is_admin: bool = False


class MasterProfileUpdate(BaseModel):
    display_name: str | None = None
    bio: str | None = None
    photo_url: str | None = None
    is_active: bool | None = None


class MasterOut(_ORMBase):
    id: int
    user_id: int
    display_name: str
    bio: str | None
    photo_url: str | None
    rating_avg: float
    rating_count: int
    booking_stopped: bool
    booking_stopped_reason: str | None
    is_active: bool


class MasterServiceAssign(BaseModel):
    service_id: int
    price_override: float | None = None
    duration_override_min: int | None = Field(
        default=None, gt=0, le=24 * 60
    )


class ScheduleEntry(BaseModel):
    """One row of the working-hours grid for a master.

    Exactly one of `weekday` / `date` must be provided. `weekday` uses
    Python convention: Monday=0 … Sunday=6.
    """

    id: int | None = None
    weekday: int | None = Field(default=None, ge=0, le=6)
    date: _Date | None = None
    start_time: time
    end_time: time
    is_off: bool = False


class ScheduleUpdate(BaseModel):
    entries: list[ScheduleEntry]


class SlotOut(BaseModel):
    """A candidate start time offered to the client booking UI."""

    start_at: datetime
    end_at: datetime


class BookingCreate(BaseModel):
    master_id: int
    service_id: int
    start_at: datetime
    client_comment: str | None = None


class BookingUpdate(BaseModel):
    """Partial update used by the master's action panel.

    Either confirm/cancel/complete; cancellation_reason is required
    when moving to CANCELLED.
    """

    status: BookingStatus
    cancellation_reason: str | None = None


class BookingOut(_ORMBase):
    id: int
    client_id: int
    master_id: int
    service_id: int
    start_at: datetime
    end_at: datetime
    price_at_booking: float
    status: BookingStatus
    client_comment: str | None
    cancellation_reason: str | None
    created_at: datetime


class ReviewCreate(BaseModel):
    booking_id: int
    rating: int = Field(ge=1, le=5)
    text: str | None = None


class ReviewOut(_ORMBase):
    id: int
    booking_id: int
    master_id: int
    client_id: int
    rating: int
    text: str | None
    created_at: datetime


class GalleryItemCreate(BaseModel):
    master_id: int | None = None
    service_id: int | None = None
    image_url: str = Field(min_length=1, max_length=1024)
    caption: str | None = None
    sort_order: int = 0


class GalleryItemOut(_ORMBase):
    id: int
    master_id: int | None
    service_id: int | None
    image_url: str
    caption: str | None
    sort_order: int
    created_at: datetime


class BroadcastCreate(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class BroadcastOut(_ORMBase):
    id: int
    author_id: int
    text: str
    sent_count: int
    failed_count: int
    created_at: datetime


class ClientNoteUpdate(BaseModel):
    text: str = ""


class ClientNoteOut(_ORMBase):
    id: int
    master_id: int
    client_id: int
    text: str
    updated_at: datetime


class ClientBlockOut(_ORMBase):
    id: int
    master_id: int
    client_id: int
    reason: str | None
    created_at: datetime


class StopBookingUpdate(BaseModel):
    booking_stopped: bool
    booking_stopped_reason: str | None = None


class MasterStatsOut(BaseModel):
    """Simple per-master aggregate over a time window."""

    master_id: int
    from_date: _Date
    to_date: _Date
    total_bookings: int
    completed_bookings: int
    cancelled_bookings: int
    revenue: float
