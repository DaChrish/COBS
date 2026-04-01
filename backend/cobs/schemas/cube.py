import uuid

from pydantic import BaseModel


class CubeCreate(BaseModel):
    cubecobra_id: str | None = None
    name: str | None = None
    description: str = ""
    image_url: str | None = None
    artist: str | None = None
    max_players: int | None = None


class CubeUpdate(BaseModel):
    cubecobra_id: str | None = None
    name: str | None = None
    description: str | None = None
    image_url: str | None = None
    artist: str | None = None
    max_players: int | None = None


class CubeResponse(BaseModel):
    id: uuid.UUID
    cubecobra_id: str | None = None
    name: str
    description: str
    image_url: str | None
    artist: str | None = None
    max_players: int | None = None

    model_config = {"from_attributes": True}
