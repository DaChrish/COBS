import uuid

from pydantic import BaseModel


class CubeCreate(BaseModel):
    name: str
    description: str = ""
    image_url: str | None = None
    max_players: int | None = None


class CubeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    image_url: str | None = None
    max_players: int | None = None


class CubeResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    image_url: str | None
    max_players: int | None = None

    model_config = {"from_attributes": True}
