import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cobs.auth.dependencies import get_current_user, require_admin
from cobs.auth.jwt import create_access_token, hash_password, verify_password
from cobs.database import get_db
from cobs.models.user import User
from cobs.schemas.auth import (
    ImpersonateRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already taken")

    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(str(user.id), is_admin=user.is_admin)
    return TokenResponse(access_token=token, user_id=user.id, is_admin=user.is_admin)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(str(user.id), is_admin=user.is_admin)
    return TokenResponse(access_token=token, user_id=user.id, is_admin=user.is_admin)


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    return user


@router.post("/admin/setup", response_model=TokenResponse, status_code=201)
async def setup_admin(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create the first admin account. Only works if no admin exists yet."""
    result = await db.execute(select(User).where(User.is_admin.is_(True)))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Admin already exists")

    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        is_admin=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(str(user.id), is_admin=True)
    return TokenResponse(access_token=token, user_id=user.id, is_admin=True)


@router.post("/impersonate", response_model=TokenResponse)
async def impersonate(
    body: ImpersonateRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == body.user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    imp_token = create_access_token(
        str(admin.id),
        is_admin=True,
        impersonating=str(target.id),
        expire_minutes=240,  # 4 hours
    )

    return TokenResponse(
        access_token=imp_token, user_id=target.id, is_admin=False
    )


@router.post("/change-password")
async def change_password(
    body: LoginRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change password. `username` field is ignored, `password` is the new password."""
    user.password_hash = hash_password(body.password)
    await db.commit()
    return {"ok": True}
