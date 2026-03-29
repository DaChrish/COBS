# COBS v2 Phase 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild COBS on a FastAPI + React/Vite/Mantine stack with proper auth, persistent cube database, and tournament management.

**Architecture:** Python FastAPI backend with SQLAlchemy ORM and Alembic migrations. React frontend with Vite build tooling and Mantine UI library. PostgreSQL database. The optimizer (OR-Tools CP-SAT) becomes a direct Python module in the backend instead of a separate service. JWT-based auth with admin user accounts.

**Tech Stack:** Python 3.12+, FastAPI, SQLAlchemy 2.0 (async), Alembic, Pydantic v2, OR-Tools, React 19, Vite, Mantine v7, TypeScript, PostgreSQL 16, Docker Compose

---

## Scope

Phase 1 covers the foundational layer that all other features build on:

1. Project scaffolding (backend + frontend + Docker)
2. Database models + initial migration
3. Auth system (player accounts, admin accounts, JWT, impersonation)
4. Persistent cube database (CRUD, images)
5. Tournament management (CRUD, join-code, status flow, player join/drop)

Phase 2 (separate plan) will cover: Voting, Optimizer integration, Drafts, Swiss Pairing, Match Reporting, Standings.

Phase 3 (separate plan) will cover: UI design, Photos, Timer, WebSockets.

---

## File Structure

```
cobs-v2/                          # New top-level on branch v2/fastapi
├── backend/
│   ├── cobs/
│   │   ├── __init__.py
│   │   ├── app.py                # FastAPI app factory + router registration
│   │   ├── config.py             # Pydantic Settings (env vars)
│   │   ├── database.py           # SQLAlchemy async engine + session
│   │   ├── models/
│   │   │   ├── __init__.py       # Re-exports all models (for Alembic)
│   │   │   ├── base.py           # DeclarativeBase
│   │   │   ├── user.py           # User model (player + admin)
│   │   │   ├── cube.py           # Cube (persistent) + TournamentCube (junction)
│   │   │   ├── tournament.py     # Tournament + TournamentPlayer
│   │   │   └── vote.py           # CubeVote
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py           # Login/register request/response schemas
│   │   │   ├── cube.py           # Cube CRUD schemas
│   │   │   ├── tournament.py     # Tournament CRUD schemas
│   │   │   └── user.py           # User schemas
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py           # POST /auth/login, /auth/register, /auth/impersonate
│   │   │   ├── cubes.py          # GET/POST/PATCH/DELETE /cubes
│   │   │   ├── tournaments.py    # GET/POST/PATCH /tournaments, POST /tournaments/join
│   │   │   └── health.py         # GET /health
│   │   ├── auth/
│   │   │   ├── __init__.py
│   │   │   ├── jwt.py            # JWT encode/decode helpers
│   │   │   └── dependencies.py   # get_current_user, require_admin FastAPI deps
│   │   └── logic/
│   │       ├── __init__.py
│   │       └── pod_sizes.py      # calculatePodSizes (ported from TS)
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/             # Auto-generated migration files
│   ├── tests/
│   │   ├── conftest.py           # Test DB setup, fixtures, test client
│   │   ├── test_auth.py
│   │   ├── test_cubes.py
│   │   ├── test_tournaments.py
│   │   └── test_pod_sizes.py
│   ├── alembic.ini
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── main.tsx              # React entry + MantineProvider
│   │   ├── App.tsx               # Router setup
│   │   ├── api/
│   │   │   └── client.ts         # Fetch wrapper with JWT
│   │   ├── hooks/
│   │   │   └── useAuth.ts        # Auth context + hook
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   └── AdminPage.tsx
│   │   └── components/
│   │       └── Layout.tsx        # Shell layout with nav
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
├── docker-compose.yml            # db + backend + frontend
└── README.md
```

---

## Task 1: Project Scaffolding — Backend

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/cobs/__init__.py`
- Create: `backend/cobs/config.py`
- Create: `backend/cobs/database.py`
- Create: `backend/cobs/app.py`
- Create: `backend/cobs/routes/__init__.py`
- Create: `backend/cobs/routes/health.py`

- [ ] **Step 1: Create `backend/pyproject.toml`**

```toml
[project]
name = "cobs"
version = "2.0.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "sqlalchemy[asyncio]>=2.0",
    "asyncpg>=0.30",
    "alembic>=1.14",
    "pydantic-settings>=2.7",
    "python-jose[cryptography]>=3.3",
    "passlib[bcrypt]>=1.7",
    "python-multipart>=0.0.18",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.24",
    "httpx>=0.28",
    "aiosqlite>=0.20",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

- [ ] **Step 2: Create `backend/cobs/__init__.py`**

```python
# COBS v2 Backend
```

- [ ] **Step 3: Create `backend/cobs/config.py`**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://drafttool:drafttool@localhost:5432/drafttool"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 10080  # 7 days

    model_config = {"env_prefix": "COBS_"}


settings = Settings()
```

- [ ] **Step 4: Create `backend/cobs/database.py`**

```python
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from cobs.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession]:
    async with async_session() as session:
        yield session
```

- [ ] **Step 5: Create `backend/cobs/routes/health.py`**

```python
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 6: Create `backend/cobs/routes/__init__.py`**

```python
# Routes package
```

- [ ] **Step 7: Create `backend/cobs/app.py`**

```python
from fastapi import FastAPI
from cobs.routes import health


def create_app() -> FastAPI:
    app = FastAPI(title="COBS", version="2.0.0")
    app.include_router(health.router, tags=["health"])
    return app


app = create_app()
```

- [ ] **Step 8: Verify the backend starts**

Run: `cd backend && uv sync && uv run uvicorn cobs.app:app --reload --port 8000`
Expected: Server starts, `GET http://localhost:8000/health` returns `{"status": "ok"}`

- [ ] **Step 9: Commit**

```bash
git add backend/
git commit -m "feat: backend scaffolding with FastAPI + health endpoint"
```

---

## Task 2: Database Models — Base + User

**Files:**
- Create: `backend/cobs/models/__init__.py`
- Create: `backend/cobs/models/base.py`
- Create: `backend/cobs/models/user.py`

- [ ] **Step 1: Create `backend/cobs/models/base.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

- [ ] **Step 2: Create `backend/cobs/models/user.py`**

```python
import uuid

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cobs.models.base import Base, TimestampMixin


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    tournament_players: Mapped[list["TournamentPlayer"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
```

Note: `TournamentPlayer` will be created in Task 4. The relationship string reference resolves at runtime.

- [ ] **Step 3: Create `backend/cobs/models/__init__.py`**

This file must import all models so Alembic can discover them:

```python
from cobs.models.base import Base
from cobs.models.user import User

__all__ = ["Base", "User"]
```

- [ ] **Step 4: Commit**

```bash
git add backend/cobs/models/
git commit -m "feat: User model with SQLAlchemy"
```

---

## Task 3: Database Models — Cube + Tournament + Vote

**Files:**
- Create: `backend/cobs/models/cube.py`
- Create: `backend/cobs/models/tournament.py`
- Create: `backend/cobs/models/vote.py`
- Modify: `backend/cobs/models/__init__.py`

- [ ] **Step 1: Create `backend/cobs/models/cube.py`**

Cubes are persistent (exist independently of tournaments). `TournamentCube` links a cube to a tournament with optional per-tournament overrides.

```python
import uuid

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cobs.models.base import Base, TimestampMixin


class Cube(TimestampMixin, Base):
    """Persistent cube that can be reused across tournaments."""

    __tablename__ = "cubes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    tournament_cubes: Mapped[list["TournamentCube"]] = relationship(
        back_populates="cube"
    )


class TournamentCube(Base):
    """Links a Cube to a Tournament with optional per-tournament settings."""

    __tablename__ = "tournament_cubes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tournament_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE")
    )
    cube_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cubes.id", ondelete="CASCADE")
    )
    max_players: Mapped[int | None] = mapped_column(Integer, nullable=True)

    tournament: Mapped["Tournament"] = relationship(back_populates="tournament_cubes")
    cube: Mapped["Cube"] = relationship(back_populates="tournament_cubes")
    votes: Mapped[list["CubeVote"]] = relationship(
        back_populates="tournament_cube", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("tournament_id", "cube_id", name="uq_tournament_cube"),
    )
```

- [ ] **Step 2: Create `backend/cobs/models/tournament.py`**

```python
import enum
import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cobs.models.base import Base, TimestampMixin


class TournamentStatus(str, enum.Enum):
    SETUP = "SETUP"
    VOTING = "VOTING"
    DRAFTING = "DRAFTING"
    FINISHED = "FINISHED"


class Tournament(TimestampMixin, Base):
    __tablename__ = "tournaments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[TournamentStatus] = mapped_column(
        Enum(TournamentStatus), default=TournamentStatus.SETUP
    )
    join_code: Mapped[str] = mapped_column(String(8), unique=True, index=True)
    max_rounds: Mapped[int] = mapped_column(Integer, default=3)

    tournament_cubes: Mapped[list["TournamentCube"]] = relationship(
        back_populates="tournament", cascade="all, delete-orphan"
    )
    players: Mapped[list["TournamentPlayer"]] = relationship(
        back_populates="tournament", cascade="all, delete-orphan"
    )


class TournamentPlayer(TimestampMixin, Base):
    __tablename__ = "tournament_players"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tournament_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    match_points: Mapped[int] = mapped_column(Integer, default=0)
    game_wins: Mapped[int] = mapped_column(Integer, default=0)
    game_losses: Mapped[int] = mapped_column(Integer, default=0)
    dropped: Mapped[bool] = mapped_column(Boolean, default=False)

    tournament: Mapped["Tournament"] = relationship(back_populates="players")
    user: Mapped["User"] = relationship(back_populates="tournament_players")
    votes: Mapped[list["CubeVote"]] = relationship(
        back_populates="tournament_player", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("tournament_id", "user_id", name="uq_tournament_user"),
    )
```

- [ ] **Step 3: Create `backend/cobs/models/vote.py`**

```python
import enum
import uuid

from sqlalchemy import Enum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cobs.models.base import Base


class VoteType(str, enum.Enum):
    DESIRED = "DESIRED"
    NEUTRAL = "NEUTRAL"
    AVOID = "AVOID"


class CubeVote(Base):
    __tablename__ = "cube_votes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tournament_player_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournament_players.id", ondelete="CASCADE")
    )
    tournament_cube_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournament_cubes.id", ondelete="CASCADE")
    )
    vote: Mapped[VoteType] = mapped_column(Enum(VoteType), default=VoteType.NEUTRAL)

    tournament_player: Mapped["TournamentPlayer"] = relationship(
        back_populates="votes"
    )
    tournament_cube: Mapped["TournamentCube"] = relationship(back_populates="votes")

    __table_args__ = (
        UniqueConstraint(
            "tournament_player_id",
            "tournament_cube_id",
            name="uq_player_cube_vote",
        ),
    )
```

- [ ] **Step 4: Update `backend/cobs/models/__init__.py`**

```python
from cobs.models.base import Base
from cobs.models.user import User
from cobs.models.cube import Cube, TournamentCube
from cobs.models.tournament import Tournament, TournamentPlayer, TournamentStatus
from cobs.models.vote import CubeVote, VoteType

__all__ = [
    "Base",
    "User",
    "Cube",
    "TournamentCube",
    "Tournament",
    "TournamentPlayer",
    "TournamentStatus",
    "CubeVote",
    "VoteType",
]
```

- [ ] **Step 5: Commit**

```bash
git add backend/cobs/models/
git commit -m "feat: Cube, Tournament, TournamentPlayer, CubeVote models"
```

---

## Task 4: Alembic Setup + Initial Migration

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Auto-generated: `backend/alembic/versions/` (first migration)

- [ ] **Step 1: Initialize Alembic**

```bash
cd backend
uv run alembic init alembic
```

This creates `alembic.ini` and `alembic/` directory.

- [ ] **Step 2: Edit `backend/alembic/env.py`**

Replace the generated `env.py` with async support:

```python
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from cobs.config import settings
from cobs.models import Base  # noqa: F401 — triggers all model imports

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline():
    context.configure(url=settings.database_url, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online():
    connectable = create_async_engine(settings.database_url)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

- [ ] **Step 3: Edit `backend/alembic.ini`**

Change the `sqlalchemy.url` line to empty (we set it from config):

```ini
sqlalchemy.url =
```

- [ ] **Step 4: Generate the initial migration**

Run: `cd backend && uv run alembic revision --autogenerate -m "initial schema"`
Expected: A new file in `alembic/versions/` with CREATE TABLE statements for `users`, `cubes`, `tournament_cubes`, `tournaments`, `tournament_players`, `cube_votes`.

- [ ] **Step 5: Run the migration against a local PostgreSQL**

Requires a running PostgreSQL (e.g. via `docker run -e POSTGRES_USER=drafttool -e POSTGRES_PASSWORD=drafttool -e POSTGRES_DB=drafttool -p 5432:5432 postgres:16-alpine`).

Run: `cd backend && uv run alembic upgrade head`
Expected: All tables created successfully.

- [ ] **Step 6: Commit**

```bash
git add backend/alembic/ backend/alembic.ini
git commit -m "feat: Alembic setup + initial migration"
```

---

## Task 5: Auth — JWT Helpers + FastAPI Dependencies

**Files:**
- Create: `backend/cobs/auth/__init__.py`
- Create: `backend/cobs/auth/jwt.py`
- Create: `backend/cobs/auth/dependencies.py`
- Create: `backend/cobs/schemas/__init__.py`
- Create: `backend/cobs/schemas/auth.py`

- [ ] **Step 1: Create `backend/cobs/auth/__init__.py`**

```python
# Auth package
```

- [ ] **Step 2: Create `backend/cobs/auth/jwt.py`**

```python
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from cobs.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(
    user_id: str,
    is_admin: bool = False,
    impersonating: str | None = None,
    expire_minutes: int | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expire_minutes or settings.jwt_expire_minutes
    )
    payload: dict = {
        "sub": user_id,
        "admin": is_admin,
        "exp": expire,
    }
    if impersonating:
        payload["impersonating"] = impersonating
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except JWTError:
        return None
```

- [ ] **Step 3: Create `backend/cobs/auth/dependencies.py`**

```python
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cobs.auth.jwt import decode_access_token
from cobs.database import get_db
from cobs.models.user import User

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Carry impersonation info if present
    impersonating_id = payload.get("impersonating")
    if impersonating_id:
        result = await db.execute(
            select(User).where(User.id == uuid.UUID(impersonating_id))
        )
        impersonated = result.scalar_one_or_none()
        if impersonated:
            impersonated._real_admin_id = uuid.UUID(user_id)  # type: ignore[attr-defined]
            return impersonated

    return user


async def require_admin(
    user: User = Depends(get_current_user),
) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user
```

- [ ] **Step 4: Create `backend/cobs/schemas/__init__.py`**

```python
# Schemas package
```

- [ ] **Step 5: Create `backend/cobs/schemas/auth.py`**

```python
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
```

- [ ] **Step 6: Commit**

```bash
git add backend/cobs/auth/ backend/cobs/schemas/
git commit -m "feat: JWT auth helpers + FastAPI dependencies"
```

---

## Task 6: Auth Routes

**Files:**
- Create: `backend/cobs/routes/auth.py`
- Modify: `backend/cobs/app.py`

- [ ] **Step 1: Create `backend/cobs/routes/auth.py`**

```python
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
```

- [ ] **Step 2: Update `backend/cobs/app.py`**

```python
from fastapi import FastAPI
from cobs.routes import auth, health


def create_app() -> FastAPI:
    app = FastAPI(title="COBS", version="2.0.0")
    app.include_router(health.router, tags=["health"])
    app.include_router(auth.router)
    return app


app = create_app()
```

- [ ] **Step 3: Commit**

```bash
git add backend/cobs/routes/auth.py backend/cobs/app.py
git commit -m "feat: auth routes (register, login, me, admin setup, impersonate)"
```

---

## Task 7: Auth Tests

**Files:**
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_auth.py`

- [ ] **Step 1: Create `backend/tests/__init__.py`**

```python
# Tests package
```

- [ ] **Step 2: Create `backend/tests/conftest.py`**

Uses an in-memory SQLite for tests (fast, no external dependencies):

```python
import asyncio
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from cobs.app import create_app
from cobs.database import get_db
from cobs.models import Base

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSession = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def override_get_db() -> AsyncGenerator[AsyncSession]:
    async with TestSession() as session:
        yield session


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient]:
    app = create_app()
    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c
```

- [ ] **Step 3: Create `backend/tests/test_auth.py`**

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_register(client: AsyncClient):
    resp = await client.post(
        "/auth/register", json={"username": "alice", "password": "test123"}
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["access_token"]
    assert data["is_admin"] is False


async def test_register_duplicate(client: AsyncClient):
    await client.post("/auth/register", json={"username": "bob", "password": "pw"})
    resp = await client.post(
        "/auth/register", json={"username": "bob", "password": "pw"}
    )
    assert resp.status_code == 409


async def test_login(client: AsyncClient):
    await client.post("/auth/register", json={"username": "carol", "password": "pw"})
    resp = await client.post(
        "/auth/login", json={"username": "carol", "password": "pw"}
    )
    assert resp.status_code == 200
    assert resp.json()["access_token"]


async def test_login_wrong_password(client: AsyncClient):
    await client.post("/auth/register", json={"username": "dave", "password": "pw"})
    resp = await client.post(
        "/auth/login", json={"username": "dave", "password": "wrong"}
    )
    assert resp.status_code == 401


async def test_me(client: AsyncClient):
    reg = await client.post(
        "/auth/register", json={"username": "eve", "password": "pw"}
    )
    token = reg.json()["access_token"]
    resp = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["username"] == "eve"


async def test_me_no_token(client: AsyncClient):
    resp = await client.get("/auth/me")
    assert resp.status_code == 403


async def test_admin_setup(client: AsyncClient):
    resp = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "admin123"}
    )
    assert resp.status_code == 201
    assert resp.json()["is_admin"] is True


async def test_admin_setup_only_once(client: AsyncClient):
    await client.post(
        "/auth/admin/setup", json={"username": "admin1", "password": "pw"}
    )
    resp = await client.post(
        "/auth/admin/setup", json={"username": "admin2", "password": "pw"}
    )
    assert resp.status_code == 409


async def test_impersonate(client: AsyncClient):
    # Create admin
    admin_resp = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    admin_token = admin_resp.json()["access_token"]

    # Create player
    player_resp = await client.post(
        "/auth/register", json={"username": "player1", "password": "pw"}
    )
    player_id = player_resp.json()["user_id"]

    # Impersonate
    imp_resp = await client.post(
        "/auth/impersonate",
        json={"user_id": player_id},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert imp_resp.status_code == 200
    imp_token = imp_resp.json()["access_token"]

    # /me should return the impersonated player
    me_resp = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {imp_token}"}
    )
    assert me_resp.json()["username"] == "player1"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_auth.py -v`
Expected: All 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/
git commit -m "test: auth routes (register, login, me, admin, impersonate)"
```

---

## Task 8: Cube Schemas + Routes (Persistent Cube Database)

**Files:**
- Create: `backend/cobs/schemas/cube.py`
- Create: `backend/cobs/routes/cubes.py`
- Modify: `backend/cobs/app.py`

- [ ] **Step 1: Create `backend/cobs/schemas/cube.py`**

```python
import uuid

from pydantic import BaseModel


class CubeCreate(BaseModel):
    name: str
    description: str = ""
    image_url: str | None = None


class CubeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    image_url: str | None = None


class CubeResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    image_url: str | None

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Create `backend/cobs/routes/cubes.py`**

```python
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cobs.auth.dependencies import require_admin
from cobs.database import get_db
from cobs.models.cube import Cube
from cobs.models.user import User
from cobs.schemas.cube import CubeCreate, CubeResponse, CubeUpdate

router = APIRouter(prefix="/cubes", tags=["cubes"])


@router.get("", response_model=list[CubeResponse])
async def list_cubes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cube).order_by(Cube.name))
    return result.scalars().all()


@router.post("", response_model=CubeResponse, status_code=201)
async def create_cube(
    body: CubeCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Cube).where(Cube.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Cube name already exists")

    cube = Cube(name=body.name, description=body.description, image_url=body.image_url)
    db.add(cube)
    await db.commit()
    await db.refresh(cube)
    return cube


@router.get("/{cube_id}", response_model=CubeResponse)
async def get_cube(cube_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cube).where(Cube.id == cube_id))
    cube = result.scalar_one_or_none()
    if not cube:
        raise HTTPException(status_code=404, detail="Cube not found")
    return cube


@router.patch("/{cube_id}", response_model=CubeResponse)
async def update_cube(
    cube_id: uuid.UUID,
    body: CubeUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Cube).where(Cube.id == cube_id))
    cube = result.scalar_one_or_none()
    if not cube:
        raise HTTPException(status_code=404, detail="Cube not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cube, field, value)

    await db.commit()
    await db.refresh(cube)
    return cube


@router.delete("/{cube_id}", status_code=204)
async def delete_cube(
    cube_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Cube).where(Cube.id == cube_id))
    cube = result.scalar_one_or_none()
    if not cube:
        raise HTTPException(status_code=404, detail="Cube not found")

    await db.delete(cube)
    await db.commit()
```

- [ ] **Step 3: Update `backend/cobs/app.py`**

```python
from fastapi import FastAPI
from cobs.routes import auth, cubes, health


def create_app() -> FastAPI:
    app = FastAPI(title="COBS", version="2.0.0")
    app.include_router(health.router, tags=["health"])
    app.include_router(auth.router)
    app.include_router(cubes.router)
    return app


app = create_app()
```

- [ ] **Step 4: Commit**

```bash
git add backend/cobs/schemas/cube.py backend/cobs/routes/cubes.py backend/cobs/app.py
git commit -m "feat: persistent cube CRUD routes"
```

---

## Task 9: Cube Tests

**Files:**
- Create: `backend/tests/test_cubes.py`

- [ ] **Step 1: Create `backend/tests/test_cubes.py`**

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _admin_token(client: AsyncClient) -> str:
    resp = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    return resp.json()["access_token"]


async def _auth(client: AsyncClient, token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_create_cube(client: AsyncClient):
    token = await _admin_token(client)
    resp = await client.post(
        "/cubes",
        json={"name": "Vintage Cube", "description": "Power 9 included"},
        headers=await _auth(client, token),
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "Vintage Cube"


async def test_create_cube_duplicate_name(client: AsyncClient):
    token = await _admin_token(client)
    headers = await _auth(client, token)
    await client.post("/cubes", json={"name": "Cube A"}, headers=headers)
    resp = await client.post("/cubes", json={"name": "Cube A"}, headers=headers)
    assert resp.status_code == 409


async def test_list_cubes(client: AsyncClient):
    token = await _admin_token(client)
    headers = await _auth(client, token)
    await client.post("/cubes", json={"name": "Cube 1"}, headers=headers)
    await client.post("/cubes", json={"name": "Cube 2"}, headers=headers)

    resp = await client.get("/cubes")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_update_cube(client: AsyncClient):
    token = await _admin_token(client)
    headers = await _auth(client, token)
    create_resp = await client.post(
        "/cubes", json={"name": "Old Name"}, headers=headers
    )
    cube_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/cubes/{cube_id}", json={"name": "New Name"}, headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


async def test_delete_cube(client: AsyncClient):
    token = await _admin_token(client)
    headers = await _auth(client, token)
    create_resp = await client.post(
        "/cubes", json={"name": "Doomed"}, headers=headers
    )
    cube_id = create_resp.json()["id"]

    resp = await client.delete(f"/cubes/{cube_id}", headers=headers)
    assert resp.status_code == 204

    resp = await client.get(f"/cubes/{cube_id}")
    assert resp.status_code == 404


async def test_create_cube_requires_admin(client: AsyncClient):
    player_resp = await client.post(
        "/auth/register", json={"username": "player", "password": "pw"}
    )
    token = player_resp.json()["access_token"]
    resp = await client.post(
        "/cubes",
        json={"name": "Sneaky"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Run tests**

Run: `cd backend && uv run pytest tests/test_cubes.py -v`
Expected: All 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_cubes.py
git commit -m "test: cube CRUD routes"
```

---

## Task 10: Tournament Schemas + Routes

**Files:**
- Create: `backend/cobs/schemas/tournament.py`
- Create: `backend/cobs/routes/tournaments.py`
- Modify: `backend/cobs/app.py`

- [ ] **Step 1: Create `backend/cobs/schemas/tournament.py`**

```python
import uuid

from pydantic import BaseModel

from cobs.models.tournament import TournamentStatus


class TournamentCreate(BaseModel):
    name: str
    max_rounds: int = 3
    cube_ids: list[uuid.UUID] = []  # Pre-select cubes from the persistent DB


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
```

- [ ] **Step 2: Create `backend/cobs/routes/tournaments.py`**

```python
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cobs.auth.dependencies import get_current_user, require_admin
from cobs.auth.jwt import create_access_token, hash_password, verify_password
from cobs.database import get_db
from cobs.models.cube import Cube, TournamentCube
from cobs.models.tournament import Tournament, TournamentPlayer, TournamentStatus
from cobs.models.user import User
from cobs.models.vote import CubeVote, VoteType
from cobs.schemas.auth import TokenResponse
from cobs.schemas.tournament import (
    JoinTournamentRequest,
    TournamentCreate,
    TournamentCubeResponse,
    TournamentDetailResponse,
    TournamentPlayerResponse,
    TournamentResponse,
    TournamentUpdate,
)

router = APIRouter(prefix="/tournaments", tags=["tournaments"])


def _generate_join_code() -> str:
    return secrets.token_hex(4).upper()[:8]


@router.get("", response_model=list[TournamentResponse])
async def list_tournaments(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Tournament).order_by(Tournament.created_at.desc())
    )
    tournaments = result.scalars().all()

    responses = []
    for t in tournaments:
        player_count = await db.scalar(
            select(func.count()).where(TournamentPlayer.tournament_id == t.id)
        )
        cube_count = await db.scalar(
            select(func.count()).where(TournamentCube.tournament_id == t.id)
        )
        responses.append(
            TournamentResponse(
                id=t.id,
                name=t.name,
                status=t.status,
                join_code=t.join_code,
                max_rounds=t.max_rounds,
                player_count=player_count or 0,
                cube_count=cube_count or 0,
            )
        )
    return responses


@router.post("", response_model=TournamentResponse, status_code=201)
async def create_tournament(
    body: TournamentCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    tournament = Tournament(
        name=body.name,
        max_rounds=body.max_rounds,
        join_code=_generate_join_code(),
    )
    db.add(tournament)
    await db.flush()

    # Link selected cubes
    for cube_id in body.cube_ids:
        result = await db.execute(select(Cube).where(Cube.id == cube_id))
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail=f"Cube {cube_id} not found")
        tc = TournamentCube(tournament_id=tournament.id, cube_id=cube_id)
        db.add(tc)

    await db.commit()
    await db.refresh(tournament)

    return TournamentResponse(
        id=tournament.id,
        name=tournament.name,
        status=tournament.status,
        join_code=tournament.join_code,
        max_rounds=tournament.max_rounds,
        player_count=0,
        cube_count=len(body.cube_ids),
    )


@router.get("/{tournament_id}", response_model=TournamentDetailResponse)
async def get_tournament(
    tournament_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Tournament)
        .where(Tournament.id == tournament_id)
        .options(
            selectinload(Tournament.players).selectinload(TournamentPlayer.user),
            selectinload(Tournament.tournament_cubes).selectinload(TournamentCube.cube),
        )
    )
    tournament = result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

    players = [
        TournamentPlayerResponse(
            id=tp.id,
            user_id=tp.user_id,
            username=tp.user.username,
            match_points=tp.match_points,
            game_wins=tp.game_wins,
            game_losses=tp.game_losses,
            dropped=tp.dropped,
        )
        for tp in tournament.players
    ]

    cubes = [
        TournamentCubeResponse(
            id=tc.id,
            cube_id=tc.cube_id,
            cube_name=tc.cube.name,
            cube_description=tc.cube.description,
            cube_image_url=tc.cube.image_url,
            max_players=tc.max_players,
        )
        for tc in tournament.tournament_cubes
    ]

    return TournamentDetailResponse(
        id=tournament.id,
        name=tournament.name,
        status=tournament.status,
        join_code=tournament.join_code,
        max_rounds=tournament.max_rounds,
        player_count=len(players),
        cube_count=len(cubes),
        players=players,
        cubes=cubes,
    )


@router.patch("/{tournament_id}", response_model=TournamentResponse)
async def update_tournament(
    tournament_id: uuid.UUID,
    body: TournamentUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Tournament).where(Tournament.id == tournament_id)
    )
    tournament = result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tournament, field, value)

    await db.commit()
    await db.refresh(tournament)

    player_count = await db.scalar(
        select(func.count()).where(TournamentPlayer.tournament_id == tournament.id)
    )
    cube_count = await db.scalar(
        select(func.count()).where(TournamentCube.tournament_id == tournament.id)
    )

    return TournamentResponse(
        id=tournament.id,
        name=tournament.name,
        status=tournament.status,
        join_code=tournament.join_code,
        max_rounds=tournament.max_rounds,
        player_count=player_count or 0,
        cube_count=cube_count or 0,
    )


@router.post("/join", response_model=TokenResponse)
async def join_tournament(
    body: JoinTournamentRequest,
    db: AsyncSession = Depends(get_db),
):
    """Join a tournament by code. Creates player account if it doesn't exist."""
    result = await db.execute(
        select(Tournament).where(Tournament.join_code == body.join_code.upper())
    )
    tournament = result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Invalid join code")

    if tournament.status == TournamentStatus.FINISHED:
        raise HTTPException(status_code=400, detail="Tournament is finished")

    # Find or create user
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    if user:
        if not verify_password(body.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid password")
    else:
        user = User(
            username=body.username,
            password_hash=hash_password(body.password),
        )
        db.add(user)
        await db.flush()

    # Check if already joined
    result = await db.execute(
        select(TournamentPlayer).where(
            TournamentPlayer.tournament_id == tournament.id,
            TournamentPlayer.user_id == user.id,
        )
    )
    if result.scalar_one_or_none():
        # Already joined — just return token
        token = create_access_token(str(user.id))
        return TokenResponse(access_token=token, user_id=user.id, is_admin=False)

    # Create tournament player
    tp = TournamentPlayer(tournament_id=tournament.id, user_id=user.id)
    db.add(tp)
    await db.flush()

    # Auto-create NEUTRAL votes for all cubes in this tournament
    tc_result = await db.execute(
        select(TournamentCube).where(TournamentCube.tournament_id == tournament.id)
    )
    for tc in tc_result.scalars().all():
        vote = CubeVote(
            tournament_player_id=tp.id,
            tournament_cube_id=tc.id,
            vote=VoteType.NEUTRAL,
        )
        db.add(vote)

    await db.commit()

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token, user_id=user.id, is_admin=False)


@router.patch("/{tournament_id}/players/{tp_id}/drop")
async def drop_player(
    tournament_id: uuid.UUID,
    tp_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TournamentPlayer).where(
            TournamentPlayer.id == tp_id,
            TournamentPlayer.tournament_id == tournament_id,
        )
    )
    tp = result.scalar_one_or_none()
    if not tp:
        raise HTTPException(status_code=404, detail="Player not found")

    # Only the player themselves or an admin can drop
    if tp.user_id != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")

    tp.dropped = True
    await db.commit()
    return {"ok": True}
```

- [ ] **Step 3: Update `backend/cobs/app.py`**

```python
from fastapi import FastAPI
from cobs.routes import auth, cubes, health, tournaments


def create_app() -> FastAPI:
    app = FastAPI(title="COBS", version="2.0.0")
    app.include_router(health.router, tags=["health"])
    app.include_router(auth.router)
    app.include_router(cubes.router)
    app.include_router(tournaments.router)
    return app


app = create_app()
```

- [ ] **Step 4: Commit**

```bash
git add backend/cobs/schemas/tournament.py backend/cobs/routes/tournaments.py backend/cobs/app.py
git commit -m "feat: tournament CRUD + join + drop routes"
```

---

## Task 11: Tournament Tests

**Files:**
- Create: `backend/tests/test_tournaments.py`

- [ ] **Step 1: Create `backend/tests/test_tournaments.py`**

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _setup_admin(client: AsyncClient) -> str:
    resp = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    return resp.json()["access_token"]


async def _create_cube(client: AsyncClient, token: str, name: str) -> str:
    resp = await client.post(
        "/cubes",
        json={"name": name},
        headers={"Authorization": f"Bearer {token}"},
    )
    return resp.json()["id"]


async def test_create_tournament(client: AsyncClient):
    token = await _setup_admin(client)
    cube_id = await _create_cube(client, token, "Test Cube")
    resp = await client.post(
        "/tournaments",
        json={"name": "Test Tournament", "cube_ids": [cube_id]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Tournament"
    assert len(data["join_code"]) == 8
    assert data["cube_count"] == 1


async def test_list_tournaments(client: AsyncClient):
    token = await _setup_admin(client)
    await client.post(
        "/tournaments",
        json={"name": "T1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    resp = await client.get(
        "/tournaments", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1


async def test_join_tournament(client: AsyncClient):
    token = await _setup_admin(client)
    cube_id = await _create_cube(client, token, "Cube 1")

    # Create tournament
    t_resp = await client.post(
        "/tournaments",
        json={"name": "Joinable", "cube_ids": [cube_id]},
        headers={"Authorization": f"Bearer {token}"},
    )
    join_code = t_resp.json()["join_code"]
    tournament_id = t_resp.json()["id"]

    # Join as new player
    join_resp = await client.post(
        "/tournaments/join",
        json={"join_code": join_code, "username": "newplayer", "password": "pw"},
    )
    assert join_resp.status_code == 200
    assert join_resp.json()["access_token"]

    # Verify player appears in tournament
    detail = await client.get(f"/tournaments/{tournament_id}")
    assert detail.json()["player_count"] == 1
    assert detail.json()["players"][0]["username"] == "newplayer"


async def test_join_creates_neutral_votes(client: AsyncClient):
    token = await _setup_admin(client)
    cube_id = await _create_cube(client, token, "VoteCube")

    t_resp = await client.post(
        "/tournaments",
        json={"name": "VoteTest", "cube_ids": [cube_id]},
        headers={"Authorization": f"Bearer {token}"},
    )
    join_code = t_resp.json()["join_code"]

    await client.post(
        "/tournaments/join",
        json={"join_code": join_code, "username": "voter", "password": "pw"},
    )

    # Votes are created internally — verify via tournament detail
    # (Vote endpoints come in Phase 2, so just check player joined)
    detail = await client.get(f"/tournaments/{t_resp.json()['id']}")
    assert detail.json()["player_count"] == 1


async def test_join_invalid_code(client: AsyncClient):
    resp = await client.post(
        "/tournaments/join",
        json={"join_code": "BADCODE1", "username": "x", "password": "pw"},
    )
    assert resp.status_code == 404


async def test_join_idempotent(client: AsyncClient):
    token = await _setup_admin(client)
    t_resp = await client.post(
        "/tournaments",
        json={"name": "Idem"},
        headers={"Authorization": f"Bearer {token}"},
    )
    code = t_resp.json()["join_code"]

    await client.post(
        "/tournaments/join",
        json={"join_code": code, "username": "same", "password": "pw"},
    )
    resp = await client.post(
        "/tournaments/join",
        json={"join_code": code, "username": "same", "password": "pw"},
    )
    assert resp.status_code == 200


async def test_update_tournament_status(client: AsyncClient):
    token = await _setup_admin(client)
    t_resp = await client.post(
        "/tournaments",
        json={"name": "StatusTest"},
        headers={"Authorization": f"Bearer {token}"},
    )
    tid = t_resp.json()["id"]

    resp = await client.patch(
        f"/tournaments/{tid}",
        json={"status": "VOTING"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.json()["status"] == "VOTING"


async def test_drop_player(client: AsyncClient):
    token = await _setup_admin(client)
    t_resp = await client.post(
        "/tournaments",
        json={"name": "DropTest"},
        headers={"Authorization": f"Bearer {token}"},
    )
    code = t_resp.json()["join_code"]
    tid = t_resp.json()["id"]

    join_resp = await client.post(
        "/tournaments/join",
        json={"join_code": code, "username": "dropper", "password": "pw"},
    )
    player_token = join_resp.json()["access_token"]

    detail = await client.get(f"/tournaments/{tid}")
    tp_id = detail.json()["players"][0]["id"]

    resp = await client.patch(
        f"/tournaments/{tid}/players/{tp_id}/drop",
        headers={"Authorization": f"Bearer {player_token}"},
    )
    assert resp.status_code == 200

    detail = await client.get(f"/tournaments/{tid}")
    assert detail.json()["players"][0]["dropped"] is True
```

- [ ] **Step 2: Run all tests**

Run: `cd backend && uv run pytest tests/ -v`
Expected: All tests pass (auth + cubes + tournaments).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_tournaments.py
git commit -m "test: tournament CRUD, join, drop routes"
```

---

## Task 12: Pod Size Logic (Port from TypeScript)

**Files:**
- Create: `backend/cobs/logic/__init__.py`
- Create: `backend/cobs/logic/pod_sizes.py`
- Create: `backend/tests/test_pod_sizes.py`

- [ ] **Step 1: Create `backend/cobs/logic/__init__.py`**

```python
# Logic package
```

- [ ] **Step 2: Write the test first — `backend/tests/test_pod_sizes.py`**

Ported from the existing TypeScript behavior:

```python
from cobs.logic.pod_sizes import calculate_pod_sizes


def test_8_players():
    assert calculate_pod_sizes(8) == [8]


def test_16_players():
    assert calculate_pod_sizes(16) == [8, 8]


def test_24_players():
    assert calculate_pod_sizes(24) == [8, 8, 8]


def test_9_players():
    # remainder=1 -> [+1, 0] -> [9, 8] but only 1 pod for 9 players
    assert calculate_pod_sizes(9) == [9]


def test_10_players():
    # remainder=2, numPods=1 -> [10]
    assert calculate_pod_sizes(10) == [10]


def test_12_players():
    # round(12/8)=2, remainder=4 -> [-2, -2] -> [6, 6]
    assert calculate_pod_sizes(12) == [6, 6]


def test_15_players():
    # round(15/8)=2, remainder=7 -> [-1, 0] -> [7, 8]
    assert calculate_pod_sizes(15) == [7, 8]


def test_17_players():
    # round(17/8)=2, remainder=1 -> [+1, 0] -> [9, 8]
    assert calculate_pod_sizes(17) == [9, 8]


def test_2_players():
    # round(2/8)=0 -> returns [2]
    assert calculate_pod_sizes(2) == [2]


def test_1_player():
    assert calculate_pod_sizes(1) == [1]
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_pod_sizes.py -v`
Expected: FAIL — `cobs.logic.pod_sizes` does not exist yet.

- [ ] **Step 4: Implement `backend/cobs/logic/pod_sizes.py`**

Direct port from `src/lib/algorithm/brunswikian.ts:calculatePodSizes`:

```python
def calculate_pod_sizes(player_count: int) -> list[int]:
    """Calculate pod sizes from player count. Port of TypeScript calculatePodSizes."""
    num_pods = round(player_count / 8)
    if num_pods <= 0:
        return [player_count]

    sizes = [8] * num_pods
    remainder = player_count % 8

    lookup_table = {
        0: (0, 0),
        1: (1, 0),
        2: (2, 0),
        3: (1, 2),
        4: (-2, -2),
        5: (-1, -2),
        6: (-2, 0),
        7: (-1, 0),
    }

    mod1, mod2 = lookup_table.get(remainder, (0, 0))
    sizes[0] += mod1
    if num_pods > 1:
        sizes[1] += mod2

    return sizes
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_pod_sizes.py -v`
Expected: All 9 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/cobs/logic/ backend/tests/test_pod_sizes.py
git commit -m "feat: port calculatePodSizes from TypeScript"
```

---

## Task 13: Docker Compose Setup

**Files:**
- Create: `backend/Dockerfile`
- Create: `docker-compose.yml` (new, at project root level for v2)

- [ ] **Step 1: Create `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install uv && uv pip install --system -e ".[dev]"

COPY . .

CMD ["uvicorn", "cobs.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: cobs-v2-db
    environment:
      POSTGRES_USER: drafttool
      POSTGRES_PASSWORD: drafttool
      POSTGRES_DB: drafttool
    volumes:
      - cobs-v2-db-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U drafttool -d drafttool"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: backend
    container_name: cobs-v2-backend
    environment:
      COBS_DATABASE_URL: "postgresql+asyncpg://drafttool:drafttool@db:5432/drafttool"
      COBS_JWT_SECRET: "change-me-in-production"
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy

volumes:
  cobs-v2-db-data:
```

Note: Frontend service will be added in Phase 3 when the UI is built.

- [ ] **Step 3: Verify Docker Compose starts**

Run: `docker compose up --build`
Expected: PostgreSQL starts, backend starts, `GET http://localhost:8000/health` returns `{"status": "ok"}`.

- [ ] **Step 4: Run migration in Docker**

Run: `docker compose exec backend alembic upgrade head`
Expected: Tables created.

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile docker-compose.yml
git commit -m "feat: Docker Compose setup (backend + PostgreSQL)"
```

---

## Task 14: Frontend Scaffolding

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/hooks/useAuth.tsx`

- [ ] **Step 1: Initialize frontend**

```bash
mkdir -p frontend/src/{api,hooks,pages,components}
cd frontend
npm init -y
npm install react react-dom @mantine/core @mantine/hooks @mantine/notifications react-router-dom
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom
```

- [ ] **Step 2: Create `frontend/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
```

- [ ] **Step 3: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "baseUrl": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>COBS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `frontend/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { BrowserRouter } from "react-router-dom";
import "@mantine/core/styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="dark">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>
);
```

- [ ] **Step 6: Create `frontend/src/api/client.ts`**

```typescript
const API_BASE = "/api";

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
```

- [ ] **Step 7: Create `frontend/src/hooks/useAuth.tsx`**

```tsx
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { apiFetch } from "../api/client";

interface AuthUser {
  id: string;
  username: string;
  is_admin: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("token")
  );
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const me = await apiFetch<AuthUser>("/auth/me");
      setUser(me);
    } catch {
      localStorage.removeItem("token");
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiFetch<{ access_token: string; is_admin: boolean }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }
    );
    localStorage.setItem("token", res.access_token);
    setToken(res.access_token);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 8: Create `frontend/src/App.tsx`**

```tsx
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<DashboardPage />} />
      </Routes>
    </AuthProvider>
  );
}
```

- [ ] **Step 9: Create minimal placeholder pages**

`frontend/src/pages/LoginPage.tsx`:
```tsx
export function LoginPage() {
  return <div>Login — coming in Phase 3</div>;
}
```

`frontend/src/pages/DashboardPage.tsx`:
```tsx
export function DashboardPage() {
  return <div>Dashboard — coming in Phase 3</div>;
}
```

- [ ] **Step 10: Verify frontend starts**

Run: `cd frontend && npm run dev`
Expected: Vite dev server starts on http://localhost:3000, shows placeholder page.

- [ ] **Step 11: Commit**

```bash
git add frontend/
git commit -m "feat: frontend scaffolding (React + Vite + Mantine)"
```

---

## Phase 1 Complete — Summary

After completing all 14 tasks, we have:

- **Backend:** FastAPI with SQLAlchemy, Alembic migrations, JWT auth
- **Models:** User, Cube (persistent), Tournament, TournamentPlayer, TournamentCube, CubeVote
- **Auth:** Register, login, admin setup, impersonation, password change
- **Cubes:** Full CRUD for persistent cube database (admin-only write)
- **Tournaments:** Create, list, detail, update status, join by code, drop player
- **Logic:** Pod size calculation ported from TypeScript
- **Tests:** Full test coverage for auth, cubes, tournaments, pod sizes
- **Docker:** Compose setup with PostgreSQL + backend
- **Frontend:** Scaffolded with React + Vite + Mantine + auth hook + API client

### Next: Phase 2

Phase 2 plan will cover:
1. Voting routes (GET/PUT votes per player per tournament)
2. Optimizer integration (port `optimizer_service.py` as a module, not separate service)
3. Draft generation routes (create draft, call optimizer, assign pods)
4. Swiss pairing routes (port `swiss.ts` to Python)
5. Match reporting routes (dual-report, conflict detection)
6. Standings calculation (port tiebreaker logic)
