import enum
import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cobs.models.base import Base, TimestampMixin


class TournamentStatus(str, enum.Enum):
    SETUP = "SETUP"
    VOTING = "VOTING"
    DRAFTING = "DRAFTING"
    FINISHED = "FINISHED"


class Tournament(TimestampMixin, Base):
    __tablename__ = "tournaments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[TournamentStatus] = mapped_column(
        Enum(TournamentStatus), default=TournamentStatus.SETUP
    )
    join_code: Mapped[str] = mapped_column(String(8), unique=True, index=True)
    max_rounds: Mapped[int] = mapped_column(Integer, default=3)

    tournament_cubes: Mapped[list["TournamentCube"]] = relationship(
        back_populates="tournament", cascade="all, delete-orphan"
    )
    players: Mapped[list["TournamentPlayer"]] = relationship(
        back_populates="tournament", cascade="all, delete-orphan"
    )


class TournamentPlayer(TimestampMixin, Base):
    __tablename__ = "tournament_players"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tournament_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    match_points: Mapped[int] = mapped_column(Integer, default=0)
    game_wins: Mapped[int] = mapped_column(Integer, default=0)
    game_losses: Mapped[int] = mapped_column(Integer, default=0)
    dropped: Mapped[bool] = mapped_column(Boolean, default=False)

    tournament: Mapped["Tournament"] = relationship(back_populates="players")
    user: Mapped["User"] = relationship(back_populates="tournament_players")
    votes: Mapped[list["CubeVote"]] = relationship(
        back_populates="tournament_player", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("tournament_id", "user_id", name="uq_tournament_user"),
    )
