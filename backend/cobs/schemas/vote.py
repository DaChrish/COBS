import uuid
from pydantic import BaseModel
from cobs.models.vote import VoteType

class VoteResponse(BaseModel):
    tournament_cube_id: uuid.UUID
    cube_name: str
    vote: VoteType
    model_config = {"from_attributes": True}

class VoteUpdate(BaseModel):
    tournament_cube_id: uuid.UUID
    vote: VoteType

class VoteBulkUpdate(BaseModel):
    votes: list[VoteUpdate]

class VoteSummaryEntry(BaseModel):
    username: str
    vote: str

class CubeVoteSummary(BaseModel):
    tournament_cube_id: uuid.UUID
    cube_name: str
    desired: int
    neutral: int
    avoid: int
    votes: list[VoteSummaryEntry]
