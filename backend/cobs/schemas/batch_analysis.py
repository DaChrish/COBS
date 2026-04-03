import uuid

from pydantic import BaseModel


class VoteDistributionConfig(BaseModel):
    desired: float = 0.4
    neutral: float = 0.3
    avoid: float = 0.3


class PlayerProfileConfig(BaseModel):
    count: int = 1
    desired_pct: float = 0.1
    neutral_pct: float = 0.0
    avoid_pct: float = 0.9


class BatchAnalysisRequest(BaseModel):
    label: str = ""
    num_players: int = 16
    num_cubes: int = 4
    max_rounds: int = 3
    swiss_rounds_per_draft: int = 3
    num_simulations: int = 10
    base_seed: int = 1
    deterministic: bool = False
    vote_distribution: VoteDistributionConfig = VoteDistributionConfig()
    player_profiles: list[PlayerProfileConfig] = []
    optimizer_config: dict = {}


class BatchAnalysisResponse(BaseModel):
    id: uuid.UUID
    label: str
    num_players: int
    num_cubes: int
    max_rounds: int
    swiss_rounds_per_draft: int
    num_simulations: int
    vote_distribution: dict
    player_profiles: list
    optimizer_config: dict
    avg_desired_pct: float
    avg_neutral_pct: float
    avg_avoid_pct: float
    min_desired_pct: float
    max_desired_pct: float
    min_avoid_pct: float
    max_avoid_pct: float
    simulations: list
    total_time_ms: int
    created_at: str | None = None

    model_config = {"from_attributes": True}
