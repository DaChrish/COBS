import uuid

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cobs.models.base import Base, TimestampMixin


class Cube(TimestampMixin, Base):
    """Persistent cube that can be reused across tournaments."""

    __tablename__ = "cubes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    max_players: Mapped[int | None] = mapped_column(Integer, nullable=True)

    tournament_cubes: Mapped[list["TournamentCube"]] = relationship(
        back_populates="cube"
    )


class TournamentCube(Base):
    """Links a Cube to a Tournament with optional per-tournament settings."""

    __tablename__ = "tournament_cubes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tournament_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE")
    )
    cube_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cubes.id", ondelete="CASCADE")
    )
    max_players: Mapped[int | None] = mapped_column(Integer, nullable=True)

    tournament: Mapped["Tournament"] = relationship(back_populates="tournament_cubes")
    cube: Mapped["Cube"] = relationship(back_populates="tournament_cubes")
    votes: Mapped[list["CubeVote"]] = relationship(
        back_populates="tournament_cube", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("tournament_id", "cube_id", name="uq_tournament_cube"),
    )
