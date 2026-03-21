import uuid

from pydantic import BaseModel

from cobs.models.tournament import TournamentStatus


class TournamentCreate(BaseModel):
    name: str
    max_rounds: int = 3
    cube_ids: list[uuid.UUID] = []


class TournamentUpdate(BaseModel):
    name: str | None = None
    status: TournamentStatus | None = None
    max_rounds: int | None = None


class TournamentResponse(BaseModel):
    id: uuid.UUID
    name: str
    status: TournamentStatus
    join_code: str
    max_rounds: int
    player_count: int = 0
    cube_count: int = 0

    model_config = {"from_attributes": True}


class TournamentDetailResponse(TournamentResponse):
    players: list["TournamentPlayerResponse"] = []
    cubes: list["TournamentCubeResponse"] = []


class TournamentPlayerResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    username: str
    match_points: int
    game_wins: int
    game_losses: int
    dropped: bool

    model_config = {"from_attributes": True}


class TournamentCubeResponse(BaseModel):
    id: uuid.UUID
    cube_id: uuid.UUID
    cube_name: str
    cube_description: str
    cube_image_url: str | None
    max_players: int | None

    model_config = {"from_attributes": True}


class JoinTournamentRequest(BaseModel):
    join_code: str
    username: str
    password: str
