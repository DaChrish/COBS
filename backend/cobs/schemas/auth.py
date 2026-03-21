import uuid

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: uuid.UUID
    is_admin: bool


class UserResponse(BaseModel):
    id: uuid.UUID
    username: str
    is_admin: bool

    model_config = {"from_attributes": True}


class ImpersonateRequest(BaseModel):
    user_id: uuid.UUID
