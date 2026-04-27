from __future__ import annotations

import enum
from datetime import date, datetime, time

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class UserRole(str, enum.Enum):
    """Role granted to a user.

    Precedence is CLIENT < MASTER < ADMIN. An admin is always also a
    master (per the spec: "admin = extended master"). We do not model
    that implicitly here; instead the role check helper treats ADMIN as
    a superset of MASTER privileges.
    """

    CLIENT = "client"
    MASTER = "master"
    ADMIN = "admin"


class BookingStatus(str, enum.Enum):
    PENDING = "pending"  # new, not yet confirmed by master
    CONFIRMED = "confirmed"  # confirmed by master
    CANCELLED = "cancelled"  # cancelled by client or master
    COMPLETED = "completed"  # visit happened, open for review
    NO_SHOW = "no_show"  # client did not come


class User(Base):
    """Telegram user known to the app.

    Every user is created on first `/me` call with a valid `initData`.
    Roles are upgraded by admins via the admin panel.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    tg_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    first_name: Mapped[str] = mapped_column(String(128), default="")
    last_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    language_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    role: Mapped[UserRole] = mapped_column(
        Enum(
            UserRole,
            name="user_role",
            values_callable=lambda enum_cls: [m.value for m in enum_cls],
        ),
        default=UserRole.CLIENT,
        index=True,
    )
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    master: Mapped[Master | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    bookings: Mapped[list[Booking]] = relationship(
        back_populates="client",
        foreign_keys="Booking.client_id",
        cascade="all, delete-orphan",
    )


class Category(Base):
    """A top-level service category, e.g. "Волосы", "Маникюр"."""

    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    services: Mapped[list[Service]] = relationship(
        back_populates="category", cascade="all, delete-orphan"
    )


class Service(Base):
    """A concrete service offered by one or more masters."""

    __tablename__ = "services"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    # Service duration in minutes. Drives slot size on the booking page.
    duration_min: Mapped[int] = mapped_column(Integer, default=60)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    category: Mapped[Category] = relationship(back_populates="services")
    master_services: Mapped[list[MasterService]] = relationship(
        back_populates="service", cascade="all, delete-orphan"
    )


class Master(Base):
    """Master profile attached 1:1 to a user."""

    __tablename__ = "masters"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    display_name: Mapped[str] = mapped_column(String(128))
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Average rating 0..5, recomputed after each review.
    rating_avg: Mapped[float] = mapped_column(Numeric(3, 2), default=0)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    # When true, no new bookings can be created for this master.
    booking_stopped: Mapped[bool] = mapped_column(Boolean, default=False)
    booking_stopped_reason: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    user: Mapped[User] = relationship(back_populates="master")
    master_services: Mapped[list[MasterService]] = relationship(
        back_populates="master", cascade="all, delete-orphan"
    )
    schedule: Mapped[list[Schedule]] = relationship(
        back_populates="master", cascade="all, delete-orphan"
    )
    bookings: Mapped[list[Booking]] = relationship(
        back_populates="master", cascade="all, delete-orphan"
    )


class MasterService(Base):
    """Join table: which masters perform which services.

    A master may override the default price/duration per service if
    needed; `None` means "use Service defaults".
    """

    __tablename__ = "master_services"
    __table_args__ = (
        UniqueConstraint("master_id", "service_id", name="uq_master_service"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    master_id: Mapped[int] = mapped_column(
        ForeignKey("masters.id", ondelete="CASCADE"), index=True
    )
    service_id: Mapped[int] = mapped_column(
        ForeignKey("services.id", ondelete="CASCADE"), index=True
    )
    price_override: Mapped[float | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    duration_override_min: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )

    master: Mapped[Master] = relationship(back_populates="master_services")
    service: Mapped[Service] = relationship(back_populates="master_services")


class Schedule(Base):
    """Master working hours for one calendar day or one weekday.

    Two kinds of entries coexist:
    - `weekday`-only (date IS NULL) recurring weekly pattern.
    - `date`-only (weekday IS NULL) overrides for a specific day, e.g.
      a day-off or a shifted shift.
    `is_off` marks the day/weekday as "off work" regardless of times.
    """

    __tablename__ = "schedules"
    __table_args__ = (
        CheckConstraint(
            "(weekday IS NOT NULL) <> (date IS NOT NULL)",
            name="ck_schedule_weekday_xor_date",
        ),
        Index("ix_schedule_master_date", "master_id", "date"),
        Index("ix_schedule_master_weekday", "master_id", "weekday"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    master_id: Mapped[int] = mapped_column(
        ForeignKey("masters.id", ondelete="CASCADE")
    )
    weekday: Mapped[int | None] = mapped_column(Integer, nullable=True)
    date: Mapped[date | None] = mapped_column(Date, nullable=True)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    is_off: Mapped[bool] = mapped_column(Boolean, default=False)

    master: Mapped[Master] = relationship(back_populates="schedule")


class Booking(Base):
    """A client's booking for a master + service at a specific time."""

    __tablename__ = "bookings"
    __table_args__ = (
        Index("ix_booking_master_time", "master_id", "start_at"),
        Index("ix_booking_client_time", "client_id", "start_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    master_id: Mapped[int] = mapped_column(
        ForeignKey("masters.id", ondelete="CASCADE")
    )
    service_id: Mapped[int] = mapped_column(
        ForeignKey("services.id", ondelete="RESTRICT")
    )
    start_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True
    )
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    price_at_booking: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    status: Mapped[BookingStatus] = mapped_column(
        Enum(
            BookingStatus,
            name="booking_status",
            values_callable=lambda enum_cls: [m.value for m in enum_cls],
        ),
        default=BookingStatus.PENDING,
        index=True,
    )
    client_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    cancelled_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    client: Mapped[User] = relationship(
        back_populates="bookings", foreign_keys=[client_id]
    )
    master: Mapped[Master] = relationship(back_populates="bookings")
    service: Mapped[Service] = relationship()
    review: Mapped[Review | None] = relationship(
        back_populates="booking",
        uselist=False,
        cascade="all, delete-orphan",
    )


class Review(Base):
    """Review left by a client after a completed booking.

    Uniqueness is enforced per-booking so each visit can be reviewed at
    most once (matches the spec: "один отзыв на одного клиента за
    визит").
    """

    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("booking_id", name="uq_review_booking"),
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_review_rating"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE")
    )
    master_id: Mapped[int] = mapped_column(
        ForeignKey("masters.id", ondelete="CASCADE"), index=True
    )
    client_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    rating: Mapped[int] = mapped_column(Integer)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    booking: Mapped[Booking] = relationship(back_populates="review")


class GalleryItem(Base):
    """A single image in the salon works gallery."""

    __tablename__ = "gallery_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    master_id: Mapped[int | None] = mapped_column(
        ForeignKey("masters.id", ondelete="SET NULL"), nullable=True
    )
    service_id: Mapped[int | None] = mapped_column(
        ForeignKey("services.id", ondelete="SET NULL"), nullable=True
    )
    image_url: Mapped[str] = mapped_column(String(1024))
    caption: Mapped[str | None] = mapped_column(String(256), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Broadcast(Base):
    """Admin broadcast log; the bot actually sends messages out of band."""

    __tablename__ = "broadcasts"

    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    text: Mapped[str] = mapped_column(Text)
    sent_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ClientNote(Base):
    """Private note a master keeps about a client."""

    __tablename__ = "client_notes"
    __table_args__ = (
        UniqueConstraint("master_id", "client_id", name="uq_master_client_note"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    master_id: Mapped[int] = mapped_column(
        ForeignKey("masters.id", ondelete="CASCADE")
    )
    client_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    text: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class ClientBlock(Base):
    """A master blocking a specific client from booking with them."""

    __tablename__ = "client_blocks"
    __table_args__ = (
        UniqueConstraint("master_id", "client_id", name="uq_master_client_block"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    master_id: Mapped[int] = mapped_column(
        ForeignKey("masters.id", ondelete="CASCADE")
    )
    client_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
