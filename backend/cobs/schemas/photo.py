import uuid

from pydantic import BaseModel

from cobs.models.photo import PhotoType


class PhotoResponse(BaseModel):
    id: uuid.UUID
    draft_id: uuid.UUID
    tournament_player_id: uuid.UUID
    photo_type: PhotoType
    filename: str
    url: str

    model_config = {"from_attributes": True}


class PlayerPhotoStatus(BaseModel):
    tournament_player_id: uuid.UUID
    user_id: uuid.UUID
    username: str
    pool: str | None = None
    deck: str | None = None
    returned: str | None = None

    model_config = {"from_attributes": True}


class DraftPhotoStatusResponse(BaseModel):
    total_players: int
    pool_deck_ready: int
    returned_ready: int
    players: list[PlayerPhotoStatus]
