import uuid

from sqlalchemy import Boolean, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cobs.models.base import Base, TimestampMixin


class Match(TimestampMixin, Base):
    __tablename__ = "matches"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    pod_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pods.id", ondelete="CASCADE")
    )
    swiss_round: Mapped[int] = mapped_column(Integer)

    player1_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournament_players.id", ondelete="CASCADE")
    )
    player2_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tournament_players.id", ondelete="CASCADE"), nullable=True
    )

    player1_wins: Mapped[int] = mapped_column(Integer, default=0)
    player2_wins: Mapped[int] = mapped_column(Integer, default=0)
    is_bye: Mapped[bool] = mapped_column(Boolean, default=False)
    reported: Mapped[bool] = mapped_column(Boolean, default=False)

    # Player self-reports
    p1_reported_p1_wins: Mapped[int | None] = mapped_column(Integer, nullable=True)
    p1_reported_p2_wins: Mapped[int | None] = mapped_column(Integer, nullable=True)
    p2_reported_p1_wins: Mapped[int | None] = mapped_column(Integer, nullable=True)
    p2_reported_p2_wins: Mapped[int | None] = mapped_column(Integer, nullable=True)
    has_conflict: Mapped[bool] = mapped_column(Boolean, default=False)

    pod: Mapped["Pod"] = relationship(back_populates="matches")
    player1: Mapped["TournamentPlayer"] = relationship(
        foreign_keys=[player1_id]
    )
    player2: Mapped["TournamentPlayer | None"] = relationship(
        foreign_keys=[player2_id]
    )
