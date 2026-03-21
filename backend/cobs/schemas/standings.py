import uuid

from pydantic import BaseModel


class StandingsEntryResponse(BaseModel):
    player_id: uuid.UUID
    username: str
    match_points: int
    match_wins: int
    match_losses: int
    match_draws: int
    game_wins: int
    game_losses: int
    omw_percent: float
    gw_percent: float
    ogw_percent: float
    dropped: bool
