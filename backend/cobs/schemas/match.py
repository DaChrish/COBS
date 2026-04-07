import uuid

from pydantic import BaseModel


class MatchResponse(BaseModel):
    id: uuid.UUID
    pod_id: uuid.UUID
    swiss_round: int
    player1_id: uuid.UUID
    player1_username: str
    player2_id: uuid.UUID | None
    player2_username: str | None
    player1_wins: int
    player2_wins: int
    is_bye: bool
    reported: bool
    has_conflict: bool
    editable: bool = False
    p1_reported_p1_wins: int | None
    p1_reported_p2_wins: int | None
    p2_reported_p1_wins: int | None
    p2_reported_p2_wins: int | None

    model_config = {"from_attributes": True}


class MatchReportRequest(BaseModel):
    player1_wins: int
    player2_wins: int


class MatchResolveRequest(BaseModel):
    player1_wins: int
    player2_wins: int
