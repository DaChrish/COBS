import uuid

from pydantic import BaseModel


class SimulateDraftRequest(BaseModel):
    label: str = ""
    round_number: int = 1
    score_want: float = 5.0
    score_avoid: float = -200.0
    score_neutral: float = 0.0
    match_point_penalty_weight: float = 100000.0
    early_round_bonus: float = 3.0
    lower_standing_bonus: float = 0.3
    repeat_avoid_multiplier: float = 4.0
    avoid_penalty_scaling: float = 1.0
    avoid_penalty_formula: str = "linear"


class SimulationResponse(BaseModel):
    id: uuid.UUID
    tournament_id: uuid.UUID
    label: str
    config: dict
    result: dict
    total_desired: int
    total_neutral: int
    total_avoid: int
    objective_score: float
    max_standings_diff: int
    player_count: int
    pod_count: int
    solver_time_ms: int
    created_at: str | None = None

    model_config = {"from_attributes": True}
