import enum
import uuid

from sqlalchemy import Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cobs.models.base import Base, TimestampMixin


class PhotoType(str, enum.Enum):
    POOL = "POOL"
    DECK = "DECK"
    RETURNED = "RETURNED"


class DraftPhoto(TimestampMixin, Base):
    __tablename__ = "draft_photos"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    draft_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("drafts.id", ondelete="CASCADE")
    )
    tournament_player_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournament_players.id", ondelete="CASCADE")
    )
    photo_type: Mapped[PhotoType] = mapped_column(Enum(PhotoType))
    filename: Mapped[str] = mapped_column(String(255))

    draft: Mapped["Draft"] = relationship()
    tournament_player: Mapped["TournamentPlayer"] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "draft_id", "tournament_player_id", "photo_type",
            name="uq_draft_player_photo_type",
        ),
    )
