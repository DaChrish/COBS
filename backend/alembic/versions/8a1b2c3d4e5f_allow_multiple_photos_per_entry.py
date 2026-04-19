"""allow multiple photos per entry

Revision ID: 8a1b2c3d4e5f
Revises: 3dad6d21c1b8
Create Date: 2026-04-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "8a1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "3dad6d21c1b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("uq_draft_player_photo_type", "draft_photos", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint(
        "uq_draft_player_photo_type",
        "draft_photos",
        ["draft_id", "tournament_player_id", "photo_type"],
    )
