import enum
import uuid

from sqlalchemy import Enum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cobs.models.base import Base


class VoteType(str, enum.Enum):
    DESIRED = "DESIRED"
    NEUTRAL = "NEUTRAL"
    AVOID = "AVOID"


class CubeVote(Base):
    __tablename__ = "cube_votes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tournament_player_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournament_players.id", ondelete="CASCADE")
    )
    tournament_cube_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournament_cubes.id", ondelete="CASCADE")
    )
    vote: Mapped[VoteType] = mapped_column(Enum(VoteType), default=VoteType.NEUTRAL)

    tournament_player: Mapped["TournamentPlayer"] = relationship(
        back_populates="votes"
    )
    tournament_cube: Mapped["TournamentCube"] = relationship(back_populates="votes")

    __table_args__ = (
        UniqueConstraint(
            "tournament_player_id",
            "tournament_cube_id",
            name="uq_player_cube_vote",
        ),
    )
