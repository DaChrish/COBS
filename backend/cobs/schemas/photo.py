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
