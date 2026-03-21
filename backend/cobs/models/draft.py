import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cobs.models.base import Base, TimestampMixin


class DraftStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    FINISHED = "FINISHED"


class Draft(TimestampMixin, Base):
    __tablename__ = "drafts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tournament_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE")
    )
    round_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[DraftStatus] = mapped_column(
        Enum(DraftStatus), default=DraftStatus.PENDING
    )

    tournament: Mapped["Tournament"] = relationship()
    pods: Mapped[list["Pod"]] = relationship(
        back_populates="draft", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("tournament_id", "round_number", name="uq_tournament_round"),
    )


class Pod(TimestampMixin, Base):
    __tablename__ = "pods"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    draft_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("drafts.id", ondelete="CASCADE")
    )
    tournament_cube_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournament_cubes.id", ondelete="CASCADE")
    )
    pod_number: Mapped[int] = mapped_column(Integer)
    pod_size: Mapped[int] = mapped_column(Integer)
    timer_ends_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    draft: Mapped["Draft"] = relationship(back_populates="pods")
    tournament_cube: Mapped["TournamentCube"] = relationship()
    players: Mapped[list["PodPlayer"]] = relationship(
        back_populates="pod", cascade="all, delete-orphan"
    )
    matches: Mapped[list["Match"]] = relationship(
        back_populates="pod", cascade="all, delete-orphan"
    )


class PodPlayer(Base):
    __tablename__ = "pod_players"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    pod_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pods.id", ondelete="CASCADE")
    )
    tournament_player_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournament_players.id", ondelete="CASCADE")
    )
    seat_number: Mapped[int] = mapped_column(Integer, default=0)

    pod: Mapped["Pod"] = relationship(back_populates="players")
    tournament_player: Mapped["TournamentPlayer"] = relationship()

    __table_args__ = (
        UniqueConstraint("pod_id", "tournament_player_id", name="uq_pod_player"),
    )
