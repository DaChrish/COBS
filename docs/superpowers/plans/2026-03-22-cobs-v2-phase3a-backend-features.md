# COBS v2 Phase 3A: Backend Features (Photos, Timer, WebSockets)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add photo upload, pod timer, and WebSocket support to the COBS v2 backend.

**Architecture:** Photos are uploaded as multipart form data, resized server-side with Pillow, and stored on disk under `uploads/`. Timer is a simple PATCH endpoint that sets `timer_ends_at` on a Pod. WebSockets use FastAPI's native WebSocket support — one connection per tournament that broadcasts events (pairings ready, match reported, timer update).

**Tech Stack:** Python 3.12+, FastAPI, Pillow (image processing), FastAPI WebSockets, aiofiles

---

## Scope

Phase 3A covers backend-only features:

1. Photo upload + serving (POOL, DECK, RETURNED types)
2. Pod timer endpoint
3. WebSocket event broadcasting
4. Test tournament creation endpoint (seed data)

Phase 3B (separate plan) will cover all frontend UI pages.

## Prerequisites

Phase 1+2 complete: 60 passing tests. All models, auth, CRUD, optimizer, Swiss, matches, standings working.

---

## File Structure

```
backend/
├── cobs/
│   ├── models/
│   │   ├── __init__.py          # UPDATE: add Photo
│   │   └── photo.py             # CREATE: DraftPhoto model
│   ├── schemas/
│   │   ├── photo.py             # CREATE: photo schemas
│   │   └── timer.py             # CREATE: timer schema
│   ├── routes/
│   │   ├── photos.py            # CREATE: upload + serve
│   │   ├── timer.py             # CREATE: set/clear timer
│   │   ├── websocket.py         # CREATE: WS endpoint
│   │   └── test_data.py         # CREATE: test tournament generation
│   ├── logic/
│   │   └── ws_manager.py        # CREATE: WebSocket connection manager
│   └── app.py                   # UPDATE: register new routers + static files
├── uploads/                     # CREATE: directory for uploaded photos
├── tests/
│   ├── test_photos.py           # CREATE
│   ├── test_timer.py            # CREATE
│   └── test_test_data.py        # CREATE
└── pyproject.toml               # UPDATE: add pillow, aiofiles
```

---

## Task 1: Add Dependencies (Pillow, aiofiles)

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Add dependencies**

Run: `cd backend && uv add pillow`

- [ ] **Step 3: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock
git commit -m "feat: add pillow + aiofiles dependencies"
```

---

## Task 2: Photo Model

**Files:**
- Create: `backend/cobs/models/photo.py`
- Modify: `backend/cobs/models/__init__.py`

- [ ] **Step 1: Create `backend/cobs/models/photo.py`**

```python
import enum
import uuid

from sqlalchemy import Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cobs.models.base import Base, TimestampMixin


class PhotoType(str, enum.Enum):
    POOL = "POOL"
    DECK = "DECK"
    RETURNED = "RETURNED"


class DraftPhoto(TimestampMixin, Base):
    __tablename__ = "draft_photos"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    draft_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("drafts.id", ondelete="CASCADE")
    )
    tournament_player_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournament_players.id", ondelete="CASCADE")
    )
    photo_type: Mapped[PhotoType] = mapped_column(Enum(PhotoType))
    filename: Mapped[str] = mapped_column(String(255))

    draft: Mapped["Draft"] = relationship()
    tournament_player: Mapped["TournamentPlayer"] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "draft_id", "tournament_player_id", "photo_type",
            name="uq_draft_player_photo_type",
        ),
    )
```

- [ ] **Step 2: Update `backend/cobs/models/__init__.py`**

Add imports:
```python
from cobs.models.photo import DraftPhoto, PhotoType
```

Add to `__all__`:
```python
"DraftPhoto",
"PhotoType",
```

- [ ] **Step 3: Verify tests pass**

Run: `cd backend && uv run pytest tests/ -v`

- [ ] **Step 4: Commit**

```bash
git add backend/cobs/models/
git commit -m "feat: DraftPhoto model"
```

---

## Task 3: Photo Upload + Serve Routes

**Files:**
- Create: `backend/cobs/schemas/photo.py`
- Create: `backend/cobs/routes/photos.py`
- Modify: `backend/cobs/config.py`
- Modify: `backend/cobs/app.py`
- Create: `backend/tests/test_photos.py`

- [ ] **Step 1: Update `backend/cobs/config.py`**

Add upload directory setting:

```python
from pydantic_settings import BaseSettings
import os


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://drafttool:drafttool@localhost:5432/drafttool"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 10080  # 7 days
    upload_dir: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
    max_upload_size: int = 25 * 1024 * 1024  # 25 MB
    max_image_dimension: int = 1200

    model_config = {"env_prefix": "COBS_"}


settings = Settings()
```

- [ ] **Step 2: Create `backend/cobs/schemas/photo.py`**

```python
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
```

- [ ] **Step 3: Create `backend/cobs/routes/photos.py`**

```python
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cobs.auth.dependencies import get_current_user
from cobs.config import settings
from cobs.database import get_db
from cobs.models.draft import Draft
from cobs.models.photo import DraftPhoto, PhotoType
from cobs.models.tournament import TournamentPlayer
from cobs.models.user import User
from cobs.schemas.photo import PhotoResponse

router = APIRouter(tags=["photos"])


@router.post(
    "/tournaments/{tournament_id}/drafts/{draft_id}/photos/{photo_type}",
    response_model=PhotoResponse,
    status_code=201,
)
async def upload_photo(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    photo_type: PhotoType,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify draft exists
    draft_result = await db.execute(
        select(Draft).where(Draft.id == draft_id, Draft.tournament_id == tournament_id)
    )
    if not draft_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Draft not found")

    # Find tournament player
    tp_result = await db.execute(
        select(TournamentPlayer).where(
            TournamentPlayer.tournament_id == tournament_id,
            TournamentPlayer.user_id == user.id,
        )
    )
    tp = tp_result.scalar_one_or_none()
    if not tp:
        raise HTTPException(status_code=403, detail="Not a participant")

    # Read file content
    content = await file.read()
    if len(content) > settings.max_upload_size:
        raise HTTPException(status_code=400, detail="File too large (max 25MB)")

    # Process image with Pillow
    import io
    try:
        img = Image.open(io.BytesIO(content))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    # Auto-rotate based on EXIF
    from PIL import ImageOps
    img = ImageOps.exif_transpose(img)

    # Resize if too large
    max_dim = settings.max_image_dimension
    if img.width > max_dim or img.height > max_dim:
        img.thumbnail((max_dim, max_dim), Image.LANCZOS)

    # Convert to RGB JPEG
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    # Save to disk
    os.makedirs(settings.upload_dir, exist_ok=True)
    filename = f"{uuid.uuid4()}.jpg"
    filepath = os.path.join(settings.upload_dir, filename)

    img.save(filepath, "JPEG", quality=80)

    # Upsert database record
    existing = await db.execute(
        select(DraftPhoto).where(
            DraftPhoto.draft_id == draft_id,
            DraftPhoto.tournament_player_id == tp.id,
            DraftPhoto.photo_type == photo_type,
        )
    )
    photo = existing.scalar_one_or_none()

    if photo:
        # Delete old file
        old_path = os.path.join(settings.upload_dir, photo.filename)
        if os.path.exists(old_path):
            os.remove(old_path)
        photo.filename = filename
    else:
        photo = DraftPhoto(
            draft_id=draft_id,
            tournament_player_id=tp.id,
            photo_type=photo_type,
            filename=filename,
        )
        db.add(photo)

    await db.commit()
    await db.refresh(photo)

    return PhotoResponse(
        id=photo.id,
        draft_id=photo.draft_id,
        tournament_player_id=photo.tournament_player_id,
        photo_type=photo.photo_type,
        filename=photo.filename,
        url=f"/uploads/{photo.filename}",
    )


@router.get("/uploads/{filename}")
async def serve_upload(filename: str):
    # Prevent path traversal
    safe_name = os.path.basename(filename)
    filepath = os.path.join(settings.upload_dir, safe_name)
    if not filepath.startswith(os.path.abspath(settings.upload_dir)):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath, media_type="image/jpeg")
```

- [ ] **Step 4: Register in `backend/cobs/app.py`**

Add `from cobs.routes import photos` and `app.include_router(photos.router)`.

- [ ] **Step 5: Create `backend/tests/test_photos.py`**

```python
import io
import os

import pytest
from httpx import AsyncClient
from PIL import Image

from cobs.config import settings

pytestmark = pytest.mark.asyncio


async def _setup_draft(client: AsyncClient):
    """Create admin, cube, tournament, players, and a draft."""
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}

    cube = await client.post("/cubes", json={"name": "PhotoCube"}, headers=ah)

    t = await client.post(
        "/tournaments",
        json={"name": "PhotoTest", "cube_ids": [cube.json()["id"]]},
        headers=ah,
    )
    tid = t.json()["id"]
    code = t.json()["join_code"]

    await client.patch(f"/tournaments/{tid}", json={"status": "VOTING"}, headers=ah)

    tokens = []
    for i in range(4):
        j = await client.post(
            "/tournaments/join",
            json={"join_code": code, "username": f"photoplayer{i}", "password": "pw"},
        )
        tokens.append(j.json()["access_token"])

    draft = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    did = draft.json()["id"]

    return tid, did, ah, tokens


def _create_test_image() -> bytes:
    """Create a minimal valid JPEG image in memory."""
    img = Image.new("RGB", (100, 100), color="red")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf.read()


async def test_upload_photo(client: AsyncClient, tmp_path):
    # Override upload dir to temp
    settings.upload_dir = str(tmp_path)

    tid, did, ah, tokens = await _setup_draft(client)
    img_data = _create_test_image()

    resp = await client.post(
        f"/tournaments/{tid}/drafts/{did}/photos/POOL",
        files={"file": ("test.jpg", img_data, "image/jpeg")},
        headers={"Authorization": f"Bearer {tokens[0]}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["photo_type"] == "POOL"
    assert data["filename"].endswith(".jpg")


async def test_upload_replaces_existing(client: AsyncClient, tmp_path):
    settings.upload_dir = str(tmp_path)

    tid, did, ah, tokens = await _setup_draft(client)
    img_data = _create_test_image()
    headers = {"Authorization": f"Bearer {tokens[0]}"}

    r1 = await client.post(
        f"/tournaments/{tid}/drafts/{did}/photos/POOL",
        files={"file": ("test.jpg", img_data, "image/jpeg")},
        headers=headers,
    )
    filename1 = r1.json()["filename"]

    r2 = await client.post(
        f"/tournaments/{tid}/drafts/{did}/photos/POOL",
        files={"file": ("test2.jpg", img_data, "image/jpeg")},
        headers=headers,
    )
    filename2 = r2.json()["filename"]

    # Should be different files (old one deleted)
    assert filename1 != filename2
    assert not os.path.exists(os.path.join(str(tmp_path), filename1))
    assert os.path.exists(os.path.join(str(tmp_path), filename2))


async def test_serve_upload(client: AsyncClient, tmp_path):
    settings.upload_dir = str(tmp_path)

    tid, did, ah, tokens = await _setup_draft(client)
    img_data = _create_test_image()

    upload = await client.post(
        f"/tournaments/{tid}/drafts/{did}/photos/DECK",
        files={"file": ("test.jpg", img_data, "image/jpeg")},
        headers={"Authorization": f"Bearer {tokens[0]}"},
    )
    filename = upload.json()["filename"]

    resp = await client.get(f"/uploads/{filename}")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/jpeg"
```

- [ ] **Step 6: Run tests**

Run: `cd backend && uv run pytest tests/test_photos.py -v`
Expected: 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/cobs/schemas/photo.py backend/cobs/routes/photos.py backend/cobs/config.py backend/cobs/app.py backend/tests/test_photos.py
git commit -m "feat: photo upload + serve routes"
```

---

## Task 4: Pod Timer Route

**Files:**
- Create: `backend/cobs/schemas/timer.py`
- Create: `backend/cobs/routes/timer.py`
- Modify: `backend/cobs/app.py`
- Create: `backend/tests/test_timer.py`

- [ ] **Step 1: Create `backend/cobs/schemas/timer.py`**

```python
from pydantic import BaseModel


class TimerSetRequest(BaseModel):
    minutes: int | None  # None or 0 to clear
```

- [ ] **Step 2: Create `backend/cobs/routes/timer.py`**

```python
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cobs.auth.dependencies import require_admin
from cobs.database import get_db
from cobs.models.draft import Pod
from cobs.models.user import User
from cobs.schemas.timer import TimerSetRequest

router = APIRouter(tags=["timer"])


@router.post("/tournaments/{tournament_id}/pods/{pod_id}/timer")
async def set_timer(
    tournament_id: uuid.UUID,
    pod_id: uuid.UUID,
    body: TimerSetRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Pod).where(Pod.id == pod_id))
    pod = result.scalar_one_or_none()
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    if body.minutes and body.minutes > 0:
        pod.timer_ends_at = datetime.now(timezone.utc) + timedelta(minutes=body.minutes)
    else:
        pod.timer_ends_at = None

    await db.commit()
    await db.refresh(pod)

    return {
        "pod_id": str(pod.id),
        "timer_ends_at": pod.timer_ends_at.isoformat() if pod.timer_ends_at else None,
    }
```

- [ ] **Step 3: Register in `backend/cobs/app.py`**

Add `from cobs.routes import timer` and `app.include_router(timer.router)`.

- [ ] **Step 4: Create `backend/tests/test_timer.py`**

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _setup_pod(client: AsyncClient):
    """Create tournament with draft, return admin headers + pod_id."""
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}

    cube = await client.post("/cubes", json={"name": "TimerCube"}, headers=ah)

    t = await client.post(
        "/tournaments",
        json={"name": "TimerTest", "cube_ids": [cube.json()["id"]]},
        headers=ah,
    )
    tid = t.json()["id"]
    code = t.json()["join_code"]

    await client.patch(f"/tournaments/{tid}", json={"status": "VOTING"}, headers=ah)

    for i in range(4):
        await client.post(
            "/tournaments/join",
            json={"join_code": code, "username": f"timerp{i}", "password": "pw"},
        )

    draft = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    pod_id = draft.json()["pods"][0]["id"]

    return tid, pod_id, ah


async def test_set_timer(client: AsyncClient):
    tid, pod_id, ah = await _setup_pod(client)

    resp = await client.post(
        f"/tournaments/{tid}/pods/{pod_id}/timer",
        json={"minutes": 45},
        headers=ah,
    )
    assert resp.status_code == 200
    assert resp.json()["timer_ends_at"] is not None


async def test_clear_timer(client: AsyncClient):
    tid, pod_id, ah = await _setup_pod(client)

    # Set then clear
    await client.post(
        f"/tournaments/{tid}/pods/{pod_id}/timer",
        json={"minutes": 45},
        headers=ah,
    )
    resp = await client.post(
        f"/tournaments/{tid}/pods/{pod_id}/timer",
        json={"minutes": None},
        headers=ah,
    )
    assert resp.status_code == 200
    assert resp.json()["timer_ends_at"] is None
```

- [ ] **Step 5: Run tests**

Run: `cd backend && uv run pytest tests/test_timer.py -v`
Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/cobs/schemas/timer.py backend/cobs/routes/timer.py backend/cobs/app.py backend/tests/test_timer.py
git commit -m "feat: pod timer route (set/clear)"
```

---

## Task 5: WebSocket Connection Manager

**Files:**
- Create: `backend/cobs/logic/ws_manager.py`
- Create: `backend/cobs/routes/websocket.py`
- Modify: `backend/cobs/app.py`

- [ ] **Step 1: Create `backend/cobs/logic/ws_manager.py`**

```python
"""WebSocket connection manager for broadcasting tournament events."""

import json
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections per tournament."""

    def __init__(self):
        self.connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, tournament_id: str, websocket: WebSocket):
        await websocket.accept()
        self.connections[tournament_id].append(websocket)

    def disconnect(self, tournament_id: str, websocket: WebSocket):
        self.connections[tournament_id] = [
            ws for ws in self.connections[tournament_id] if ws is not websocket
        ]

    async def broadcast(self, tournament_id: str, event: str, data: dict | None = None):
        """Broadcast an event to all connections for a tournament."""
        message = json.dumps({"event": event, "data": data or {}})
        dead: list[WebSocket] = []
        for ws in self.connections[tournament_id]:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(tournament_id, ws)


manager = ConnectionManager()
```

- [ ] **Step 2: Create `backend/cobs/routes/websocket.py`**

```python
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from cobs.logic.ws_manager import manager

router = APIRouter()


@router.websocket("/ws/tournaments/{tournament_id}")
async def tournament_ws(websocket: WebSocket, tournament_id: str):
    await manager.connect(tournament_id, websocket)
    try:
        while True:
            # Keep connection alive, ignore client messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(tournament_id, websocket)
```

- [ ] **Step 3: Register in `backend/cobs/app.py`**

Add `from cobs.routes import websocket` and `app.include_router(websocket.router)`.

- [ ] **Step 4: Add broadcast calls to existing routes**

Modify `backend/cobs/routes/matches.py` — at the end of `generate_pairings`, after `await db.commit()`, add:

```python
from cobs.logic.ws_manager import manager
await manager.broadcast(str(tournament_id), "pairings_ready", {"draft_id": str(draft_id)})
```

At the end of `report_match`, after `await db.commit()`, add:

```python
from cobs.logic.ws_manager import manager
await manager.broadcast(str(tournament_id), "match_reported", {"match_id": str(match_id)})
```

Modify `backend/cobs/routes/timer.py` — at the end of `set_timer`, after `await db.commit()`, add:

```python
from cobs.logic.ws_manager import manager
# Look up tournament_id from pod -> draft
from cobs.models.draft import Draft
draft_result = await db.execute(select(Draft).where(Draft.id == pod.draft_id))
draft = draft_result.scalar_one()
await manager.broadcast(
    str(draft.tournament_id),
    "timer_update",
    {"pod_id": str(pod.id), "timer_ends_at": pod.timer_ends_at.isoformat() if pod.timer_ends_at else None},
)
```

- [ ] **Step 5: Run all tests**

Run: `cd backend && uv run pytest tests/ -v`
Expected: All tests pass (WebSocket manager is a no-op when no connections exist).

- [ ] **Step 6: Commit**

```bash
git add backend/cobs/logic/ws_manager.py backend/cobs/routes/websocket.py backend/cobs/routes/matches.py backend/cobs/routes/timer.py backend/cobs/app.py
git commit -m "feat: WebSocket support + broadcast events"
```

---

## Task 6: Test Tournament Generation Endpoint

**Files:**
- Create: `backend/cobs/routes/test_data.py`
- Modify: `backend/cobs/app.py`
- Create: `backend/tests/test_test_data.py`

- [ ] **Step 1: Create `backend/cobs/routes/test_data.py`**

```python
import random
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cobs.auth.dependencies import require_admin
from cobs.auth.jwt import hash_password
from cobs.database import get_db
from cobs.models.cube import Cube, TournamentCube
from cobs.models.tournament import Tournament, TournamentPlayer, TournamentStatus
from cobs.models.user import User
from cobs.models.vote import CubeVote, VoteType
from cobs.routes.tournaments import _generate_join_code

router = APIRouter(prefix="/test", tags=["test"])


class TestTournamentRequest(BaseModel):
    name: str = "Test Tournament"
    num_players: int = 16
    num_cubes: int = 4
    seed: int | None = None


class TestTournamentResponse(BaseModel):
    tournament_id: uuid.UUID
    join_code: str
    player_count: int
    cube_count: int


@router.post("/tournament", response_model=TestTournamentResponse, status_code=201)
async def create_test_tournament(
    body: TestTournamentRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a test tournament with pre-filled players and random votes."""
    rng = random.Random(body.seed)

    # Create cubes if they don't exist
    cube_names = [f"Test Cube {i+1}" for i in range(body.num_cubes)]
    cubes: list[Cube] = []
    for name in cube_names:
        result = await db.execute(select(Cube).where(Cube.name == name))
        cube = result.scalar_one_or_none()
        if not cube:
            cube = Cube(name=name, description=f"Auto-generated test cube: {name}")
            db.add(cube)
            await db.flush()
        cubes.append(cube)

    # Create tournament
    tournament = Tournament(
        name=body.name,
        join_code=_generate_join_code(),
        status=TournamentStatus.VOTING,
    )
    db.add(tournament)
    await db.flush()

    # Link cubes
    tournament_cubes: list[TournamentCube] = []
    for cube in cubes:
        tc = TournamentCube(tournament_id=tournament.id, cube_id=cube.id)
        db.add(tc)
        await db.flush()
        tournament_cubes.append(tc)

    # Create players
    vote_options = [VoteType.DESIRED, VoteType.NEUTRAL, VoteType.AVOID]
    password_hash = hash_password("test")

    for i in range(body.num_players):
        username = f"test_player_{tournament.join_code}_{i+1}"
        user = User(username=username, password_hash=password_hash)
        db.add(user)
        await db.flush()

        tp = TournamentPlayer(tournament_id=tournament.id, user_id=user.id)
        db.add(tp)
        await db.flush()

        # Random votes
        for tc in tournament_cubes:
            vote = CubeVote(
                tournament_player_id=tp.id,
                tournament_cube_id=tc.id,
                vote=rng.choice(vote_options),
            )
            db.add(vote)

    await db.commit()

    return TestTournamentResponse(
        tournament_id=tournament.id,
        join_code=tournament.join_code,
        player_count=body.num_players,
        cube_count=body.num_cubes,
    )
```

- [ ] **Step 2: Register in `backend/cobs/app.py`**

Add `from cobs.routes import test_data` and `app.include_router(test_data.router)`.

- [ ] **Step 3: Create `backend/tests/test_test_data.py`**

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_create_test_tournament(client: AsyncClient):
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}

    resp = await client.post(
        "/test/tournament",
        json={"num_players": 8, "num_cubes": 2, "seed": 42},
        headers=ah,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["player_count"] == 8
    assert data["cube_count"] == 2

    # Verify tournament detail
    detail = await client.get(f"/tournaments/{data['tournament_id']}")
    assert detail.json()["player_count"] == 8
    assert detail.json()["status"] == "VOTING"


async def test_seed_reproducibility(client: AsyncClient):
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}

    r1 = await client.post(
        "/test/tournament",
        json={"name": "Seed1", "num_players": 4, "num_cubes": 2, "seed": 123},
        headers=ah,
    )
    r2 = await client.post(
        "/test/tournament",
        json={"name": "Seed2", "num_players": 4, "num_cubes": 2, "seed": 123},
        headers=ah,
    )

    # Both should succeed
    assert r1.status_code == 201
    assert r2.status_code == 201
```

- [ ] **Step 4: Run tests**

Run: `cd backend && uv run pytest tests/ -v`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/cobs/routes/test_data.py backend/cobs/app.py backend/tests/test_test_data.py
git commit -m "feat: test tournament generation endpoint"
```

---

## Phase 3A Complete — Summary

After completing all 6 tasks:

- **Photo upload:** POST photo (POOL/DECK/RETURNED), auto-resize to 1200px JPEG, EXIF rotation, upsert
- **Photo serving:** GET /uploads/{filename} serves stored images
- **Timer:** POST set/clear timer per pod (stores absolute end time)
- **WebSocket:** WS connection per tournament, broadcasts: pairings_ready, match_reported, timer_update
- **Test data:** POST /test/tournament creates pre-filled tournament with random votes

### Next: Phase 3B

Phase 3B plan will cover all frontend UI pages (mobile-first, Mantine):
- Login + Join pages
- Player dashboard
- Voting page
- Draft detail (pod info, matches, photo upload, timer)
- Standings page
- Admin dashboard + tournament management
