import uuid

from sqlalchemy import Float, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from cobs.models.base import Base, TimestampMixin


class BatchAnalysis(TimestampMixin, Base):
    __tablename__ = "batch_analyses"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    label: Mapped[str] = mapped_column(String(200), default="")
    num_players: Mapped[int] = mapped_column(Integer)
    num_cubes: Mapped[int] = mapped_column(Integer)
    max_rounds: Mapped[int] = mapped_column(Integer)
    swiss_rounds_per_draft: Mapped[int] = mapped_column(Integer, default=3)
    num_simulations: Mapped[int] = mapped_column(Integer)
    vote_distribution: Mapped[dict] = mapped_column(JSON, default=dict)
    player_profiles: Mapped[list] = mapped_column(JSON, default=list)
    optimizer_config: Mapped[dict] = mapped_column(JSON, default=dict)
    avg_desired_pct: Mapped[float] = mapped_column(Float, default=0.0)
    avg_neutral_pct: Mapped[float] = mapped_column(Float, default=0.0)
    avg_avoid_pct: Mapped[float] = mapped_column(Float, default=0.0)
    min_desired_pct: Mapped[float] = mapped_column(Float, default=0.0)
    max_desired_pct: Mapped[float] = mapped_column(Float, default=0.0)
    min_avoid_pct: Mapped[float] = mapped_column(Float, default=0.0)
    max_avoid_pct: Mapped[float] = mapped_column(Float, default=0.0)
    simulations: Mapped[list] = mapped_column(JSON, default=list)
    total_time_ms: Mapped[int] = mapped_column(Integer, default=0)
