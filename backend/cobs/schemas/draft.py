import uuid
from datetime import datetime

from pydantic import BaseModel

from cobs.models.draft import DraftStatus


class DraftCreate(BaseModel):
    """Config overrides for the optimizer (all optional)."""
    score_want: float = 5.0
    score_avoid: float = -200.0
    score_neutral: float = 0.0
    match_point_penalty_weight: float = 10000.0
    early_round_bonus: float = 3.0
    lower_standing_bonus: float = 0.3
    repeat_avoid_multiplier: float = 4.0
    skip_photo_check: bool = False


class PodPlayerResponse(BaseModel):
    tournament_player_id: uuid.UUID
    username: str
    seat_number: int
    vote: str | None = None

    model_config = {"from_attributes": True}


class PodResponse(BaseModel):
    id: uuid.UUID
    pod_number: int
    pod_size: int
    cube_name: str
    cube_id: uuid.UUID
    timer_ends_at: datetime | None
    players: list[PodPlayerResponse]

    model_config = {"from_attributes": True}


class DraftResponse(BaseModel):
    id: uuid.UUID
    round_number: int
    status: DraftStatus
    pods: list[PodResponse]

    model_config = {"from_attributes": True}
