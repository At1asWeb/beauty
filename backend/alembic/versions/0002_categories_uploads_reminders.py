"""category photos, master↔categories, uploads, booking reminders

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-28
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Category gets a photo for the home-page card.
    op.add_column(
        "categories",
        sa.Column("photo_url", sa.String(1024), nullable=True),
    )

    # Master ↔ Category assignment: replaces the per-service mapping as
    # the primary "what does this master do" signal.
    op.create_table(
        "master_categories",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "master_id",
            sa.Integer,
            sa.ForeignKey("masters.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "category_id",
            sa.Integer,
            sa.ForeignKey("categories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "master_id", "category_id", name="uq_master_category"
        ),
    )
    op.create_index(
        "ix_master_categories_master_id",
        "master_categories",
        ["master_id"],
    )
    op.create_index(
        "ix_master_categories_category_id",
        "master_categories",
        ["category_id"],
    )

    # Backfill: every existing master_services row implies the master
    # works in that service's category — preserve those assignments.
    op.execute(
        """
        INSERT INTO master_categories (master_id, category_id)
        SELECT DISTINCT ms.master_id, s.category_id
        FROM master_services ms
        JOIN services s ON s.id = ms.service_id
        ON CONFLICT (master_id, category_id) DO NOTHING
        """
    )

    # Booking reminder timestamp: NULL = no reminder sent yet.
    op.add_column(
        "bookings",
        sa.Column(
            "reminded_at", sa.DateTime(timezone=True), nullable=True
        ),
    )

    # Uploads: store binary blobs straight in Postgres so we don't need
    # an external object storage just to let an admin pick a photo from
    # their phone.
    op.create_table(
        "uploads",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "owner_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("content_type", sa.String(64), nullable=False),
        sa.Column("filename", sa.String(256)),
        sa.Column("size", sa.Integer, nullable=False),
        sa.Column("data", sa.LargeBinary, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("uploads")
    op.drop_column("bookings", "reminded_at")
    op.drop_index(
        "ix_master_categories_category_id", table_name="master_categories"
    )
    op.drop_index(
        "ix_master_categories_master_id", table_name="master_categories"
    )
    op.drop_table("master_categories")
    op.drop_column("categories", "photo_url")
