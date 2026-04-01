import uuid

from sqlalchemy import Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cobs.models.base import Base, TimestampMixin


class Simulation(TimestampMixin, Base):
    __tablename__ = "simulations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tournament_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE")
    )
    label: Mapped[str] = mapped_column(String(200), default="")
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    total_desired: Mapped[int] = mapped_column(Integer, default=0)
    total_neutral: Mapped[int] = mapped_column(Integer, default=0)
    total_avoid: Mapped[int] = mapped_column(Integer, default=0)
    objective_score: Mapped[float] = mapped_column(Float, default=0.0)
    max_standings_diff: Mapped[int] = mapped_column(Integer, default=0)
    player_count: Mapped[int] = mapped_column(Integer, default=0)
    pod_count: Mapped[int] = mapped_column(Integer, default=0)
    solver_time_ms: Mapped[int] = mapped_column(Integer, default=0)

    tournament: Mapped["Tournament"] = relationship()
