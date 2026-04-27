"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-26
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    user_role = sa.Enum("client", "master", "admin", name="user_role")
    booking_status = sa.Enum(
        "pending",
        "confirmed",
        "cancelled",
        "completed",
        "no_show",
        name="booking_status",
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tg_id", sa.BigInteger, nullable=False, unique=True),
        sa.Column("username", sa.String(64)),
        sa.Column("first_name", sa.String(128), nullable=False, server_default=""),
        sa.Column("last_name", sa.String(128)),
        sa.Column("language_code", sa.String(8)),
        sa.Column("photo_url", sa.String(512)),
        sa.Column("role", user_role, nullable=False, server_default="client"),
        sa.Column(
            "is_blocked", sa.Boolean, nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_users_tg_id", "users", ["tg_id"], unique=True)
    op.create_index("ix_users_role", "users", ["role"])

    op.create_table(
        "categories",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(128), nullable=False, unique=True),
        sa.Column("description", sa.Text),
        sa.Column("icon", sa.String(64)),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "is_active",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("true"),
        ),
    )

    op.create_table(
        "services",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "category_id",
            sa.Integer,
            sa.ForeignKey("categories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column(
            "price", sa.Numeric(10, 2), nullable=False, server_default="0"
        ),
        sa.Column(
            "duration_min",
            sa.Integer,
            nullable=False,
            server_default="60",
        ),
        sa.Column(
            "is_active",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.create_index("ix_services_category_id", "services", ["category_id"])

    op.create_table(
        "masters",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("display_name", sa.String(128), nullable=False),
        sa.Column("bio", sa.Text),
        sa.Column("photo_url", sa.String(512)),
        sa.Column(
            "rating_avg", sa.Numeric(3, 2), nullable=False, server_default="0"
        ),
        sa.Column(
            "rating_count", sa.Integer, nullable=False, server_default="0"
        ),
        sa.Column(
            "booking_stopped",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("booking_stopped_reason", sa.Text),
        sa.Column(
            "is_active",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("true"),
        ),
    )

    op.create_table(
        "master_services",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "master_id",
            sa.Integer,
            sa.ForeignKey("masters.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "service_id",
            sa.Integer,
            sa.ForeignKey("services.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("price_override", sa.Numeric(10, 2)),
        sa.Column("duration_override_min", sa.Integer),
        sa.UniqueConstraint("master_id", "service_id", name="uq_master_service"),
    )
    op.create_index(
        "ix_master_services_master_id", "master_services", ["master_id"]
    )
    op.create_index(
        "ix_master_services_service_id", "master_services", ["service_id"]
    )

    op.create_table(
        "schedules",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "master_id",
            sa.Integer,
            sa.ForeignKey("masters.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("weekday", sa.Integer),
        sa.Column("date", sa.Date),
        sa.Column("start_time", sa.Time, nullable=False),
        sa.Column("end_time", sa.Time, nullable=False),
        sa.Column(
            "is_off", sa.Boolean, nullable=False, server_default=sa.text("false")
        ),
        sa.CheckConstraint(
            "(weekday IS NOT NULL) <> (date IS NOT NULL)",
            name="ck_schedule_weekday_xor_date",
        ),
    )
    op.create_index(
        "ix_schedule_master_date", "schedules", ["master_id", "date"]
    )
    op.create_index(
        "ix_schedule_master_weekday", "schedules", ["master_id", "weekday"]
    )

    op.create_table(
        "bookings",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "client_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "master_id",
            sa.Integer,
            sa.ForeignKey("masters.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "service_id",
            sa.Integer,
            sa.ForeignKey("services.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "price_at_booking",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "status",
            booking_status,
            nullable=False,
            server_default="pending",
        ),
        sa.Column("client_comment", sa.Text),
        sa.Column("cancellation_reason", sa.Text),
        sa.Column(
            "cancelled_by_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_booking_master_time", "bookings", ["master_id", "start_at"]
    )
    op.create_index(
        "ix_booking_client_time", "bookings", ["client_id", "start_at"]
    )
    op.create_index("ix_booking_start_at", "bookings", ["start_at"])
    op.create_index("ix_booking_status", "bookings", ["status"])

    op.create_table(
        "reviews",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "booking_id",
            sa.Integer,
            sa.ForeignKey("bookings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "master_id",
            sa.Integer,
            sa.ForeignKey("masters.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "client_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rating", sa.Integer, nullable=False),
        sa.Column("text", sa.Text),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("booking_id", name="uq_review_booking"),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_review_rating"),
    )
    op.create_index("ix_reviews_master_id", "reviews", ["master_id"])

    op.create_table(
        "gallery_items",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "master_id",
            sa.Integer,
            sa.ForeignKey("masters.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "service_id",
            sa.Integer,
            sa.ForeignKey("services.id", ondelete="SET NULL"),
        ),
        sa.Column("image_url", sa.String(1024), nullable=False),
        sa.Column("caption", sa.String(256)),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "broadcasts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "author_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=False,
        ),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column(
            "sent_count", sa.Integer, nullable=False, server_default="0"
        ),
        sa.Column(
            "failed_count", sa.Integer, nullable=False, server_default="0"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "client_notes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "master_id",
            sa.Integer,
            sa.ForeignKey("masters.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "client_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("text", sa.Text, nullable=False, server_default=""),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "master_id", "client_id", name="uq_master_client_note"
        ),
    )

    op.create_table(
        "client_blocks",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "master_id",
            sa.Integer,
            sa.ForeignKey("masters.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "client_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("reason", sa.Text),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "master_id", "client_id", name="uq_master_client_block"
        ),
    )


def downgrade() -> None:
    op.drop_table("client_blocks")
    op.drop_table("client_notes")
    op.drop_table("broadcasts")
    op.drop_table("gallery_items")
    op.drop_index("ix_reviews_master_id", table_name="reviews")
    op.drop_table("reviews")
    op.drop_index("ix_booking_status", table_name="bookings")
    op.drop_index("ix_booking_start_at", table_name="bookings")
    op.drop_index("ix_booking_client_time", table_name="bookings")
    op.drop_index("ix_booking_master_time", table_name="bookings")
    op.drop_table("bookings")
    op.drop_index("ix_schedule_master_weekday", table_name="schedules")
    op.drop_index("ix_schedule_master_date", table_name="schedules")
    op.drop_table("schedules")
    op.drop_index(
        "ix_master_services_service_id", table_name="master_services"
    )
    op.drop_index(
        "ix_master_services_master_id", table_name="master_services"
    )
    op.drop_table("master_services")
    op.drop_table("masters")
    op.drop_index("ix_services_category_id", table_name="services")
    op.drop_table("services")
    op.drop_table("categories")
    op.drop_index("ix_users_role", table_name="users")
    op.drop_index("ix_users_tg_id", table_name="users")
    op.drop_table("users")
    sa.Enum(name="booking_status").drop(op.get_bind(), checkfirst=False)
    sa.Enum(name="user_role").drop(op.get_bind(), checkfirst=False)
