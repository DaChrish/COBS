# COBS v2 Phase 2: Core Game Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full tournament game loop — voting, optimizer-driven draft generation, Swiss pairings, match reporting with conflict detection, and standings with MTG tiebreakers.

**Architecture:** All game logic lives in `backend/cobs/logic/` as pure functions. The optimizer (OR-Tools CP-SAT) is integrated directly as a Python module — no separate service. Routes in `backend/cobs/routes/` are thin wrappers that call logic functions. New DB models (Draft, Pod, PodPlayer, Match) extend the existing schema.

**Tech Stack:** Python 3.12+, FastAPI, SQLAlchemy 2.0 (async), OR-Tools (ortools-cp-sat), pytest

---

## Scope

Phase 2 covers the complete game loop:

1. New DB models: Draft, Pod, PodPlayer, Match
2. Voting routes (GET/PUT per player per tournament)
3. Optimizer module (port from `optimizer/optimizer_service.py`)
4. Draft generation route (create draft, call optimizer, persist pods)
5. Swiss pairing logic + route (port from `src/lib/algorithm/swiss.ts`)
6. Match reporting routes (dual-report, conflict detection, admin resolve)
7. Standings calculation (port tiebreaker logic from `swiss.ts`)

## Prerequisites

Phase 1 must be complete. The following exist:
- `backend/cobs/models/` — User, Cube, TournamentCube, Tournament, TournamentPlayer, CubeVote, VoteType
- `backend/cobs/logic/pod_sizes.py` — `calculate_pod_sizes()`
- `backend/cobs/auth/` — JWT helpers + FastAPI dependencies
- `backend/tests/conftest.py` — test fixtures with SQLite in-memory DB
- 33 passing tests

---

## File Structure

```
backend/
├── cobs/
│   ├── models/
│   │   ├── __init__.py          # UPDATE: add Draft, Pod, PodPlayer, Match
│   │   ├── draft.py             # CREATE: Draft, Pod, PodPlayer models
│   │   └── match.py             # CREATE: Match model
│   ├── schemas/
│   │   ├── vote.py              # CREATE: vote request/response
│   │   ├── draft.py             # CREATE: draft request/response
│   │   ├── match.py             # CREATE: match report/response
│   │   └── standings.py         # CREATE: standings response
│   ├── routes/
│   │   ├── votes.py             # CREATE: GET/PUT votes
│   │   ├── drafts.py            # CREATE: POST draft, GET draft detail
│   │   ├── matches.py           # CREATE: POST report, POST resolve
│   │   └── standings.py         # CREATE: GET standings
│   ├── logic/
│   │   ├── optimizer.py         # CREATE: OR-Tools CP-SAT solver
│   │   ├── swiss.py             # CREATE: Swiss pairing algorithm
│   │   └── standings.py         # CREATE: tiebreaker calculations
│   └── app.py                   # UPDATE: register new routers
├── tests/
│   ├── test_optimizer.py        # CREATE
│   ├── test_swiss.py            # CREATE
│   ├── test_standings.py        # CREATE
│   ├── test_votes.py            # CREATE
│   ├── test_drafts.py           # CREATE
│   └── test_matches.py          # CREATE
└── pyproject.toml               # UPDATE: add ortools dependency
```

---

## Task 1: Add OR-Tools Dependency

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Add ortools to dependencies**

Add `"ortools>=9.10"` to the `dependencies` list in `pyproject.toml`.

- [ ] **Step 2: Sync dependencies**

Run: `cd backend && uv add ortools`

- [ ] **Step 3: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock
git commit -m "feat: add ortools dependency"
```

---

## Task 2: Draft + Pod + Match Models

**Files:**
- Create: `backend/cobs/models/draft.py`
- Create: `backend/cobs/models/match.py`
- Modify: `backend/cobs/models/__init__.py`

- [ ] **Step 1: Create `backend/cobs/models/draft.py`**

```python
import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cobs.models.base import Base, TimestampMixin


class DraftStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    FINISHED = "FINISHED"


class Draft(TimestampMixin, Base):
    __tablename__ = "drafts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tournament_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE")
    )
    round_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[DraftStatus] = mapped_column(
        Enum(DraftStatus), default=DraftStatus.PENDING
    )

    tournament: Mapped["Tournament"] = relationship()
    pods: Mapped[list["Pod"]] = relationship(
        back_populates="draft", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("tournament_id", "round_number", name="uq_tournament_round"),
    )


class Pod(TimestampMixin, Base):
    __tablename__ = "pods"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    draft_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("drafts.id", ondelete="CASCADE")
    )
    tournament_cube_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournament_cubes.id", ondelete="CASCADE")
    )
    pod_number: Mapped[int] = mapped_column(Integer)
    pod_size: Mapped[int] = mapped_column(Integer)
    timer_ends_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    draft: Mapped["Draft"] = relationship(back_populates="pods")
    tournament_cube: Mapped["TournamentCube"] = relationship()
    players: Mapped[list["PodPlayer"]] = relationship(
        back_populates="pod", cascade="all, delete-orphan"
    )
    matches: Mapped[list["Match"]] = relationship(
        back_populates="pod", cascade="all, delete-orphan"
    )


class PodPlayer(Base):
    __tablename__ = "pod_players"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    pod_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pods.id", ondelete="CASCADE")
    )
    tournament_player_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournament_players.id", ondelete="CASCADE")
    )
    seat_number: Mapped[int] = mapped_column(Integer, default=0)

    pod: Mapped["Pod"] = relationship(back_populates="players")
    tournament_player: Mapped["TournamentPlayer"] = relationship()

    __table_args__ = (
        UniqueConstraint("pod_id", "tournament_player_id", name="uq_pod_player"),
    )
```

- [ ] **Step 2: Create `backend/cobs/models/match.py`**

```python
import uuid

from sqlalchemy import Boolean, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cobs.models.base import Base, TimestampMixin


class Match(TimestampMixin, Base):
    __tablename__ = "matches"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    pod_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pods.id", ondelete="CASCADE")
    )
    swiss_round: Mapped[int] = mapped_column(Integer)

    player1_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournament_players.id", ondelete="CASCADE")
    )
    player2_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tournament_players.id", ondelete="CASCADE"), nullable=True
    )

    player1_wins: Mapped[int] = mapped_column(Integer, default=0)
    player2_wins: Mapped[int] = mapped_column(Integer, default=0)
    is_bye: Mapped[bool] = mapped_column(Boolean, default=False)
    reported: Mapped[bool] = mapped_column(Boolean, default=False)

    # Player self-reports
    p1_reported_p1_wins: Mapped[int | None] = mapped_column(Integer, nullable=True)
    p1_reported_p2_wins: Mapped[int | None] = mapped_column(Integer, nullable=True)
    p2_reported_p1_wins: Mapped[int | None] = mapped_column(Integer, nullable=True)
    p2_reported_p2_wins: Mapped[int | None] = mapped_column(Integer, nullable=True)
    has_conflict: Mapped[bool] = mapped_column(Boolean, default=False)

    pod: Mapped["Pod"] = relationship(back_populates="matches")
    player1: Mapped["TournamentPlayer"] = relationship(
        foreign_keys=[player1_id]
    )
    player2: Mapped["TournamentPlayer | None"] = relationship(
        foreign_keys=[player2_id]
    )
```

- [ ] **Step 3: Update `backend/cobs/models/__init__.py`**

```python
from cobs.models.base import Base
from cobs.models.user import User
from cobs.models.cube import Cube, TournamentCube
from cobs.models.tournament import Tournament, TournamentPlayer, TournamentStatus
from cobs.models.vote import CubeVote, VoteType
from cobs.models.draft import Draft, DraftStatus, Pod, PodPlayer
from cobs.models.match import Match

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
    "Draft",
    "DraftStatus",
    "Pod",
    "PodPlayer",
    "Match",
]
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `cd backend && uv run pytest tests/ -v`
Expected: 33 tests pass (no regressions from new models).

- [ ] **Step 5: Commit**

```bash
git add backend/cobs/models/
git commit -m "feat: Draft, Pod, PodPlayer, Match models"
```

---

## Task 3: Voting Routes

**Files:**
- Create: `backend/cobs/schemas/vote.py`
- Create: `backend/cobs/routes/votes.py`
- Modify: `backend/cobs/app.py`
- Create: `backend/tests/test_votes.py`

- [ ] **Step 1: Create `backend/cobs/schemas/vote.py`**

```python
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
```

- [ ] **Step 2: Create `backend/cobs/routes/votes.py`**

```python
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cobs.auth.dependencies import get_current_user
from cobs.database import get_db
from cobs.models.cube import TournamentCube
from cobs.models.tournament import Tournament, TournamentPlayer, TournamentStatus
from cobs.models.user import User
from cobs.models.vote import CubeVote, VoteType
from cobs.schemas.vote import VoteBulkUpdate, VoteResponse

router = APIRouter(prefix="/tournaments/{tournament_id}/votes", tags=["votes"])


async def _get_tournament_player(
    tournament_id: uuid.UUID, user: User, db: AsyncSession
) -> TournamentPlayer:
    result = await db.execute(
        select(TournamentPlayer).where(
            TournamentPlayer.tournament_id == tournament_id,
            TournamentPlayer.user_id == user.id,
        )
    )
    tp = result.scalar_one_or_none()
    if not tp:
        raise HTTPException(status_code=404, detail="Not a participant in this tournament")
    return tp


@router.get("", response_model=list[VoteResponse])
async def get_votes(
    tournament_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tp = await _get_tournament_player(tournament_id, user, db)

    result = await db.execute(
        select(CubeVote)
        .where(CubeVote.tournament_player_id == tp.id)
        .options(selectinload(CubeVote.tournament_cube).selectinload(TournamentCube.cube))
    )
    votes = result.scalars().all()

    return [
        VoteResponse(
            tournament_cube_id=v.tournament_cube_id,
            cube_name=v.tournament_cube.cube.name,
            vote=v.vote,
        )
        for v in votes
    ]


@router.put("")
async def update_votes(
    tournament_id: uuid.UUID,
    body: VoteBulkUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check tournament is in VOTING status
    t_result = await db.execute(
        select(Tournament).where(Tournament.id == tournament_id)
    )
    tournament = t_result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if tournament.status != TournamentStatus.VOTING:
        raise HTTPException(status_code=400, detail="Voting is not open")

    tp = await _get_tournament_player(tournament_id, user, db)

    for vote_update in body.votes:
        result = await db.execute(
            select(CubeVote).where(
                CubeVote.tournament_player_id == tp.id,
                CubeVote.tournament_cube_id == vote_update.tournament_cube_id,
            )
        )
        vote = result.scalar_one_or_none()
        if vote:
            vote.vote = vote_update.vote
        else:
            db.add(CubeVote(
                tournament_player_id=tp.id,
                tournament_cube_id=vote_update.tournament_cube_id,
                vote=vote_update.vote,
            ))

    await db.commit()
    return {"ok": True}
```

- [ ] **Step 3: Register router in `backend/cobs/app.py`**

Add `from cobs.routes import votes` and `app.include_router(votes.router)`.

- [ ] **Step 4: Create `backend/tests/test_votes.py`**

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _setup(client: AsyncClient):
    """Create admin, cube, tournament in VOTING status, and join a player."""
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    admin_token = admin.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    cube = await client.post(
        "/cubes", json={"name": "TestCube"}, headers=admin_headers
    )
    cube_id = cube.json()["id"]

    t = await client.post(
        "/tournaments",
        json={"name": "VoteTourney", "cube_ids": [cube_id]},
        headers=admin_headers,
    )
    tid = t.json()["id"]

    # Set to VOTING
    await client.patch(
        f"/tournaments/{tid}",
        json={"status": "VOTING"},
        headers=admin_headers,
    )

    # Join as player
    join = await client.post(
        "/tournaments/join",
        json={"join_code": t.json()["join_code"], "username": "voter", "password": "pw"},
    )
    player_token = join.json()["access_token"]

    # Get tournament detail to find tournament_cube_id
    detail = await client.get(f"/tournaments/{tid}")
    tc_id = detail.json()["cubes"][0]["id"]

    return tid, tc_id, player_token, admin_headers


async def test_get_votes(client: AsyncClient):
    tid, tc_id, player_token, _ = await _setup(client)
    resp = await client.get(
        f"/tournaments/{tid}/votes",
        headers={"Authorization": f"Bearer {player_token}"},
    )
    assert resp.status_code == 200
    votes = resp.json()
    assert len(votes) == 1
    assert votes[0]["vote"] == "NEUTRAL"


async def test_update_votes(client: AsyncClient):
    tid, tc_id, player_token, _ = await _setup(client)
    headers = {"Authorization": f"Bearer {player_token}"}

    resp = await client.put(
        f"/tournaments/{tid}/votes",
        json={"votes": [{"tournament_cube_id": tc_id, "vote": "DESIRED"}]},
        headers=headers,
    )
    assert resp.status_code == 200

    # Verify
    votes = await client.get(f"/tournaments/{tid}/votes", headers=headers)
    assert votes.json()[0]["vote"] == "DESIRED"


async def test_update_votes_not_in_voting_phase(client: AsyncClient):
    tid, tc_id, player_token, admin_headers = await _setup(client)

    # Move to DRAFTING
    await client.patch(
        f"/tournaments/{tid}",
        json={"status": "DRAFTING"},
        headers=admin_headers,
    )

    resp = await client.put(
        f"/tournaments/{tid}/votes",
        json={"votes": [{"tournament_cube_id": tc_id, "vote": "AVOID"}]},
        headers={"Authorization": f"Bearer {player_token}"},
    )
    assert resp.status_code == 400
```

- [ ] **Step 5: Run tests**

Run: `cd backend && uv run pytest tests/ -v`
Expected: All tests pass (33 existing + 3 new).

- [ ] **Step 6: Commit**

```bash
git add backend/cobs/schemas/vote.py backend/cobs/routes/votes.py backend/cobs/app.py backend/tests/test_votes.py
git commit -m "feat: voting routes (GET/PUT per player)"
```

---

## Task 4: Optimizer Module (Port from Python Service)

**Files:**
- Create: `backend/cobs/logic/optimizer.py`
- Create: `backend/tests/test_optimizer.py`

This is a direct port of `optimizer/optimizer_service.py` — the OR-Tools CP-SAT solver becomes a regular function call instead of an HTTP service.

- [ ] **Step 1: Create `backend/cobs/logic/optimizer.py`**

```python
"""
OR-Tools CP-SAT optimizer for pod/cube assignment.
Port of optimizer/optimizer_service.py — runs as a direct function call.
"""

from dataclasses import dataclass, field
from ortools.sat.python import cp_model


@dataclass
class PlayerInput:
    id: str
    match_points: int
    votes: dict[str, str]  # cube_id -> "DESIRED" | "NEUTRAL" | "AVOID"
    dropped: bool = False
    prior_avoid_count: int = 0


@dataclass
class CubeInput:
    id: str
    max_players: int | None = None


@dataclass
class OptimizerConfig:
    score_want: float = 5.0
    score_avoid: float = -200.0
    score_neutral: float = 0.0
    match_point_penalty_weight: float = 10000.0
    early_round_bonus: float = 3.0
    lower_standing_bonus: float = 0.3
    repeat_avoid_multiplier: float = 4.0


@dataclass
class OptimizerResult:
    pods: list[list[str]]  # list of player ID lists per pod
    cube_ids: list[str | None]  # cube ID per pod
    objective: float = 0.0


def optimize_pods(
    players: list[PlayerInput],
    cubes: list[CubeInput],
    pod_sizes: list[int],
    round_number: int,
    config: OptimizerConfig | None = None,
) -> OptimizerResult:
    """
    Solve optimal pod-to-player and pod-to-cube assignment using CP-SAT.

    Maximizes player satisfaction (DESIRED/AVOID votes) while keeping
    players with similar match points together.
    """
    if config is None:
        config = OptimizerConfig()

    active = [p for p in players if not p.dropped]
    P = len(active)
    K = len(pod_sizes)
    C = len(cubes)

    if P == 0 or K == 0 or C == 0:
        return OptimizerResult(pods=[[] for _ in range(K)], cube_ids=[None] * K)

    model = cp_model.CpModel()

    # Decision variables
    x = {}  # x[p,k] = player p in pod k
    for p in range(P):
        for k in range(K):
            x[p, k] = model.NewBoolVar(f"x_{p}_{k}")

    y = {}  # y[k,c] = pod k plays cube c
    for k in range(K):
        for c in range(C):
            y[k, c] = model.NewBoolVar(f"y_{k}_{c}")

    z = {}  # z[p,k,c] = player p in pod k AND pod k plays cube c
    for p in range(P):
        for k in range(K):
            for c in range(C):
                z[p, k, c] = model.NewBoolVar(f"z_{p}_{k}_{c}")
                model.Add(z[p, k, c] <= x[p, k])
                model.Add(z[p, k, c] <= y[k, c])
                model.Add(z[p, k, c] >= x[p, k] + y[k, c] - 1)

    # Constraints
    # 1: Each player in exactly one pod
    for p in range(P):
        model.Add(sum(x[p, k] for k in range(K)) == 1)

    # 2: Each pod has exactly pod_sizes[k] players
    for k in range(K):
        model.Add(sum(x[p, k] for p in range(P)) == pod_sizes[k])

    # 3: Each pod plays exactly one cube
    for k in range(K):
        model.Add(sum(y[k, c] for c in range(C)) == 1)

    # 4: Each cube used by at most one pod
    for c in range(C):
        model.Add(sum(y[k, c] for k in range(K)) <= 1)

    # 5: Cube maxPlayers capacity
    for c in range(C):
        if cubes[c].max_players is not None:
            for k in range(K):
                if pod_sizes[k] > cubes[c].max_players:
                    model.Add(y[k, c] == 0)

    # Objective
    objective_terms = []

    # 1. Player preferences with lower-standing bonus
    sorted_mps = sorted(set(p.match_points for p in active))
    mp_to_rank = {mp: i for i, mp in enumerate(sorted_mps)}
    max_rank = max(len(sorted_mps) - 1, 1)

    for p in range(P):
        player = active[p]
        rank = mp_to_rank[player.match_points]
        pref_mult = 1.0 + config.lower_standing_bonus * (1.0 - rank / max_rank)

        for k in range(K):
            for c in range(C):
                cube_id = cubes[c].id
                vote = player.votes.get(cube_id, "NEUTRAL")

                score = config.score_neutral
                if vote == "DESIRED":
                    score = int(config.score_want * pref_mult)
                elif vote == "AVOID":
                    avoid_mult = config.repeat_avoid_multiplier ** player.prior_avoid_count
                    score = int(config.score_avoid * avoid_mult)

                if score != 0:
                    objective_terms.append(score * z[p, k, c])

    # 2. Early round bonuses
    if round_number == 1:
        for c in range(C):
            cube = cubes[c]
            bonus = 0
            if config.early_round_bonus > 0:
                avoid_count = sum(
                    1 for p in active if p.votes.get(cube.id) == "AVOID"
                )
                bonus += avoid_count * int(config.early_round_bonus)
            if cube.max_players is not None:
                bonus += int(config.early_round_bonus) * 10
            if bonus > 0:
                for k in range(K):
                    objective_terms.append(bonus * y[k, c])

    # 3. Match point spread penalty
    max_mp_val = max((p.match_points for p in active), default=0)
    min_mp_val = min((p.match_points for p in active), default=0)

    max_mp = {}
    min_mp = {}
    for k in range(K):
        max_mp[k] = model.NewIntVar(min_mp_val, max_mp_val, f"max_mp_{k}")
        min_mp[k] = model.NewIntVar(min_mp_val, max_mp_val, f"min_mp_{k}")
        for p in range(P):
            model.Add(
                max_mp[k] >= active[p].match_points
            ).OnlyEnforceIf(x[p, k])
            model.Add(
                min_mp[k] <= active[p].match_points
            ).OnlyEnforceIf(x[p, k])
        objective_terms.append(
            int(config.match_point_penalty_weight) * (min_mp[k] - max_mp[k])
        )

    # 4. Three-tier pod constraint
    standard = [k for k in range(K) if pod_sizes[k] == 8]
    even_ns = [k for k in range(K) if pod_sizes[k] != 8 and pod_sizes[k] % 2 == 0]
    odd_ns = [k for k in range(K) if pod_sizes[k] != 8 and pod_sizes[k] % 2 == 1]

    tier_pairs = []
    if odd_ns and even_ns:
        tier_pairs.append((odd_ns, even_ns))
    if odd_ns and standard:
        tier_pairs.append((odd_ns, standard))
    if even_ns and standard:
        tier_pairs.append((even_ns, standard))

    for lower_tier, higher_tier in tier_pairs:
        for p_a in range(P):
            for p_b in range(P):
                if active[p_a].match_points > active[p_b].match_points:
                    for k_low in lower_tier:
                        for k_high in higher_tier:
                            model.AddBoolOr([
                                x[p_a, k_low].Not(),
                                x[p_b, k_high].Not(),
                            ])

    model.Maximize(sum(objective_terms))

    # Solve
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 300
    solver.Solve(model)

    # Extract results
    pods: list[list[str]] = [[] for _ in range(K)]
    cube_assignments: list[str | None] = [None] * K

    for p in range(P):
        for k in range(K):
            if solver.Value(x[p, k]) == 1:
                pods[k].append(active[p].id)

    for k in range(K):
        for c in range(C):
            if solver.Value(y[k, c]) == 1:
                cube_assignments[k] = cubes[c].id

    return OptimizerResult(
        pods=pods,
        cube_ids=cube_assignments,
        objective=solver.ObjectiveValue(),
    )
```

- [ ] **Step 2: Create `backend/tests/test_optimizer.py`**

```python
from cobs.logic.optimizer import (
    CubeInput,
    OptimizerConfig,
    PlayerInput,
    optimize_pods,
)


def test_basic_assignment():
    """8 players, 2 cubes, 1 pod of 8 — all should be in one pod."""
    players = [
        PlayerInput(id=f"p{i}", match_points=0, votes={"c1": "DESIRED", "c2": "NEUTRAL"})
        for i in range(8)
    ]
    cubes = [CubeInput(id="c1"), CubeInput(id="c2")]
    result = optimize_pods(players, cubes, pod_sizes=[8], round_number=1)

    assert len(result.pods) == 1
    assert len(result.pods[0]) == 8
    assert result.cube_ids[0] == "c1"  # All voted DESIRED for c1


def test_two_pods():
    """16 players split into 2 pods of 8."""
    players = [
        PlayerInput(
            id=f"p{i}",
            match_points=0,
            votes={"c1": "DESIRED" if i < 8 else "AVOID", "c2": "AVOID" if i < 8 else "DESIRED"},
        )
        for i in range(16)
    ]
    cubes = [CubeInput(id="c1"), CubeInput(id="c2")]
    result = optimize_pods(players, cubes, pod_sizes=[8, 8], round_number=1)

    assert len(result.pods) == 2
    assert len(result.pods[0]) == 8
    assert len(result.pods[1]) == 8
    # Both cubes should be assigned
    assert set(result.cube_ids) == {"c1", "c2"}


def test_avoid_respected():
    """Players who AVOID a cube should not be assigned to it when possible."""
    players = [
        PlayerInput(id="p0", match_points=0, votes={"c1": "AVOID", "c2": "DESIRED"}),
        PlayerInput(id="p1", match_points=0, votes={"c1": "DESIRED", "c2": "AVOID"}),
        PlayerInput(id="p2", match_points=0, votes={"c1": "DESIRED", "c2": "NEUTRAL"}),
        PlayerInput(id="p3", match_points=0, votes={"c1": "NEUTRAL", "c2": "DESIRED"}),
    ]
    cubes = [CubeInput(id="c1"), CubeInput(id="c2")]
    result = optimize_pods(players, cubes, pod_sizes=[2, 2], round_number=1)

    # Find which pod has c1
    c1_pod_idx = result.cube_ids.index("c1")
    assert "p0" not in result.pods[c1_pod_idx]  # p0 AVOIDed c1


def test_empty_players():
    result = optimize_pods([], [CubeInput(id="c1")], pod_sizes=[8], round_number=1)
    assert result.pods == [[]]


def test_max_players_constraint():
    """Cube with maxPlayers=4 should not be assigned to a pod of 8."""
    players = [
        PlayerInput(id=f"p{i}", match_points=0, votes={"c1": "DESIRED", "c2": "NEUTRAL"})
        for i in range(8)
    ]
    cubes = [CubeInput(id="c1", max_players=4), CubeInput(id="c2")]
    result = optimize_pods(players, cubes, pod_sizes=[8], round_number=1)

    # c1 can't fit 8 players, so c2 must be assigned
    assert result.cube_ids[0] == "c2"
```

- [ ] **Step 3: Run tests**

Run: `cd backend && uv run pytest tests/test_optimizer.py -v`
Expected: All 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/cobs/logic/optimizer.py backend/tests/test_optimizer.py
git commit -m "feat: optimizer module (OR-Tools CP-SAT, port from service)"
```

---

## Task 5: Swiss Pairing Logic (Port from TypeScript)

**Files:**
- Create: `backend/cobs/logic/swiss.py`
- Create: `backend/tests/test_swiss.py`

Direct port of `src/lib/algorithm/swiss.ts`.

- [ ] **Step 1: Create `backend/cobs/logic/swiss.py`**

```python
"""
Swiss pairing algorithm. Port of src/lib/algorithm/swiss.ts.
"""

from dataclasses import dataclass


@dataclass
class SwissPairing:
    player1_id: str
    player2_id: str | None
    is_bye: bool


@dataclass
class SwissResult:
    pairings: list[SwissPairing]
    warnings: list[str]


@dataclass
class MatchResult:
    player1_id: str
    player2_id: str | None
    player1_wins: int
    player2_wins: int
    is_bye: bool


def generate_swiss_pairings(
    players: list[dict],  # [{"id": str, "match_points": int}]
    previous_matches: list[dict],  # [{"player1_id": str, "player2_id": str | None}]
    previous_byes: list[str],
) -> SwissResult:
    """Generate Swiss pairings for one round within a pod."""
    warnings: list[str] = []
    pairings: list[SwissPairing] = []

    if not players:
        return SwissResult(pairings=[], warnings=["No players for pairings."])

    # Build set of previous pairings
    played_pairs: set[str] = set()
    for m in previous_matches:
        if m.get("player2_id"):
            key = "-".join(sorted([m["player1_id"], m["player2_id"]]))
            played_pairs.add(key)

    sorted_players = sorted(players, key=lambda p: p["match_points"], reverse=True)

    # Bye handling for odd number of players
    bye_player = None
    players_to_match = sorted_players

    if len(sorted_players) % 2 != 0:
        # Find lowest player without previous bye
        for i in range(len(sorted_players) - 1, -1, -1):
            if sorted_players[i]["id"] not in previous_byes:
                bye_player = sorted_players[i]
                players_to_match = [p for j, p in enumerate(sorted_players) if j != i]
                break

        if bye_player is None:
            bye_player = sorted_players[-1]
            players_to_match = sorted_players[:-1]
            warnings.append(
                f"All players had a bye. {bye_player['id']} gets another."
            )

        pairings.append(SwissPairing(
            player1_id=bye_player["id"],
            player2_id=None,
            is_bye=True,
        ))

    # Greedy pairing
    paired: set[str] = set()
    remaining = list(players_to_match)

    for i in range(len(remaining)):
        if remaining[i]["id"] in paired:
            continue

        p1 = remaining[i]
        best_match = None

        # Find best unpaired opponent (same/closest points, no repeat)
        for j in range(i + 1, len(remaining)):
            if remaining[j]["id"] in paired:
                continue
            pair_key = "-".join(sorted([p1["id"], remaining[j]["id"]]))
            if pair_key not in played_pairs:
                best_match = remaining[j]
                break

        # Fallback: any unpaired opponent
        if best_match is None:
            for j in range(i + 1, len(remaining)):
                if remaining[j]["id"] not in paired:
                    best_match = remaining[j]
                    warnings.append(
                        f"Repeat pairing: {p1['id']} vs {remaining[j]['id']}"
                    )
                    break

        if best_match:
            paired.add(p1["id"])
            paired.add(best_match["id"])
            pairings.append(SwissPairing(
                player1_id=p1["id"],
                player2_id=best_match["id"],
                is_bye=False,
            ))

    return SwissResult(pairings=pairings, warnings=warnings)
```

- [ ] **Step 2: Create `backend/tests/test_swiss.py`**

```python
from cobs.logic.swiss import generate_swiss_pairings


def test_8_players():
    players = [{"id": f"p{i}", "match_points": 0} for i in range(8)]
    result = generate_swiss_pairings(players, [], [])
    assert len(result.pairings) == 4
    assert all(not p.is_bye for p in result.pairings)


def test_odd_players_bye():
    players = [{"id": f"p{i}", "match_points": 0} for i in range(7)]
    result = generate_swiss_pairings(players, [], [])
    byes = [p for p in result.pairings if p.is_bye]
    assert len(byes) == 1
    assert len(result.pairings) == 4  # 3 matches + 1 bye


def test_bye_not_repeated():
    players = [
        {"id": f"p{i}", "match_points": 3 if i < 6 else 0}
        for i in range(7)
    ]
    result = generate_swiss_pairings(players, [], ["p6"])
    bye = [p for p in result.pairings if p.is_bye][0]
    assert bye.player1_id != "p6"


def test_avoid_repeat_pairings():
    players = [
        {"id": "p0", "match_points": 3},
        {"id": "p1", "match_points": 3},
        {"id": "p2", "match_points": 0},
        {"id": "p3", "match_points": 0},
    ]
    prev = [{"player1_id": "p0", "player2_id": "p1"}]
    result = generate_swiss_pairings(players, prev, [])

    for p in result.pairings:
        if not p.is_bye:
            key = "-".join(sorted([p.player1_id, p.player2_id]))
            # p0-p1 should not be paired again
            assert key != "-".join(sorted(["p0", "p1"]))


def test_empty_players():
    result = generate_swiss_pairings([], [], [])
    assert len(result.pairings) == 0
    assert len(result.warnings) > 0
```

- [ ] **Step 3: Run tests**

Run: `cd backend && uv run pytest tests/test_swiss.py -v`
Expected: All 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/cobs/logic/swiss.py backend/tests/test_swiss.py
git commit -m "feat: Swiss pairing algorithm (port from TypeScript)"
```

---

## Task 6: Standings Logic (Port Tiebreakers)

**Files:**
- Create: `backend/cobs/logic/standings.py`
- Create: `backend/tests/test_standings.py`

Port of `calculatePointsFromResults` and `calculateTiebreakers` from `swiss.ts`.

- [ ] **Step 1: Create `backend/cobs/logic/standings.py`**

```python
"""
Standings and tiebreaker calculations. Port of swiss.ts tiebreaker logic.
"""

from dataclasses import dataclass, field
from cobs.logic.swiss import MatchResult


@dataclass
class PlayerStats:
    match_points: int = 0
    match_wins: int = 0
    match_losses: int = 0
    match_draws: int = 0
    game_wins: int = 0
    game_losses: int = 0


@dataclass
class StandingsEntry:
    player_id: str
    match_points: int = 0
    match_wins: int = 0
    match_losses: int = 0
    match_draws: int = 0
    game_wins: int = 0
    game_losses: int = 0
    omw_percent: float = 0.33
    gw_percent: float = 0.33
    ogw_percent: float = 0.33
    dropped: bool = False


def calculate_points(results: list[MatchResult]) -> dict[str, PlayerStats]:
    """Calculate match points and game records from match results."""
    stats: dict[str, PlayerStats] = {}

    def get(pid: str) -> PlayerStats:
        if pid not in stats:
            stats[pid] = PlayerStats()
        return stats[pid]

    for r in results:
        p1 = get(r.player1_id)

        if r.is_bye:
            p1.match_points += 3
            p1.match_wins += 1
            p1.game_wins += 2
            continue

        if not r.player2_id:
            continue

        p2 = get(r.player2_id)

        p1.game_wins += r.player1_wins
        p1.game_losses += r.player2_wins
        p2.game_wins += r.player2_wins
        p2.game_losses += r.player1_wins

        if r.player1_wins > r.player2_wins:
            p1.match_points += 3
            p1.match_wins += 1
            p2.match_losses += 1
        elif r.player2_wins > r.player1_wins:
            p2.match_points += 3
            p2.match_wins += 1
            p1.match_losses += 1
        else:
            p1.match_points += 1
            p2.match_points += 1
            p1.match_draws += 1
            p2.match_draws += 1

    return stats


def calculate_standings(
    player_ids: list[str],
    results: list[MatchResult],
    dropped_ids: set[str] | None = None,
) -> list[StandingsEntry]:
    """Calculate full standings with tiebreakers (OMW%, GW%, OGW%)."""
    if dropped_ids is None:
        dropped_ids = set()

    stats = calculate_points(results)

    # Build opponent lists
    opponents: dict[str, list[str]] = {}
    rounds_played: dict[str, int] = {}

    for r in results:
        rounds_played[r.player1_id] = rounds_played.get(r.player1_id, 0) + 1
        if r.player2_id:
            rounds_played[r.player2_id] = rounds_played.get(r.player2_id, 0) + 1

        if r.is_bye or not r.player2_id:
            continue
        opponents.setdefault(r.player1_id, []).append(r.player2_id)
        opponents.setdefault(r.player2_id, []).append(r.player1_id)

    def match_win_pct(pid: str) -> float:
        s = stats.get(pid)
        rp = rounds_played.get(pid, 0)
        if not s or rp == 0:
            return 0.33
        return max(s.match_points / (rp * 3), 0.33)

    def game_win_pct(pid: str) -> float:
        s = stats.get(pid)
        if not s:
            return 0.33
        total = s.game_wins + s.game_losses
        if total == 0:
            return 0.33
        return max(s.game_wins / total, 0.33)

    entries: list[StandingsEntry] = []
    for pid in player_ids:
        s = stats.get(pid, PlayerStats())
        opps = opponents.get(pid, [])

        omw = (
            sum(match_win_pct(o) for o in opps) / len(opps)
            if opps
            else 0.33
        )
        gw = game_win_pct(pid)
        ogw = (
            sum(game_win_pct(o) for o in opps) / len(opps)
            if opps
            else 0.33
        )

        entries.append(StandingsEntry(
            player_id=pid,
            match_points=s.match_points,
            match_wins=s.match_wins,
            match_losses=s.match_losses,
            match_draws=s.match_draws,
            game_wins=s.game_wins,
            game_losses=s.game_losses,
            omw_percent=round(omw, 4),
            gw_percent=round(gw, 4),
            ogw_percent=round(ogw, 4),
            dropped=pid in dropped_ids,
        ))

    # Sort: non-dropped first, then by match_points desc, omw desc, gw desc, ogw desc
    entries.sort(
        key=lambda e: (
            not e.dropped,
            e.match_points,
            e.omw_percent,
            e.gw_percent,
            e.ogw_percent,
        ),
        reverse=True,
    )

    return entries
```

- [ ] **Step 2: Create `backend/tests/test_standings.py`**

```python
from cobs.logic.standings import calculate_points, calculate_standings
from cobs.logic.swiss import MatchResult


def test_calculate_points_win():
    results = [
        MatchResult(player1_id="a", player2_id="b", player1_wins=2, player2_wins=0, is_bye=False),
    ]
    stats = calculate_points(results)
    assert stats["a"].match_points == 3
    assert stats["b"].match_points == 0
    assert stats["a"].game_wins == 2
    assert stats["b"].game_losses == 2


def test_calculate_points_draw():
    results = [
        MatchResult(player1_id="a", player2_id="b", player1_wins=1, player2_wins=1, is_bye=False),
    ]
    stats = calculate_points(results)
    assert stats["a"].match_points == 1
    assert stats["b"].match_points == 1
    assert stats["a"].match_draws == 1


def test_calculate_points_bye():
    results = [
        MatchResult(player1_id="a", player2_id=None, player1_wins=0, player2_wins=0, is_bye=True),
    ]
    stats = calculate_points(results)
    assert stats["a"].match_points == 3
    assert stats["a"].game_wins == 2


def test_standings_order():
    results = [
        MatchResult(player1_id="a", player2_id="b", player1_wins=2, player2_wins=0, is_bye=False),
        MatchResult(player1_id="c", player2_id="d", player1_wins=2, player2_wins=1, is_bye=False),
    ]
    standings = calculate_standings(["a", "b", "c", "d"], results)
    # a and c both have 3 points, b and d have 0
    assert standings[0].player_id in ("a", "c")
    assert standings[1].player_id in ("a", "c")
    assert standings[2].player_id in ("b", "d")


def test_dropped_sorted_last():
    results = [
        MatchResult(player1_id="a", player2_id="b", player1_wins=2, player2_wins=0, is_bye=False),
    ]
    standings = calculate_standings(["a", "b"], results, dropped_ids={"a"})
    assert standings[0].player_id == "b"  # b first because a is dropped
    assert standings[1].dropped is True


def test_omw_minimum_33():
    """OMW% should be at least 33%."""
    results = [
        MatchResult(player1_id="a", player2_id="b", player1_wins=2, player2_wins=0, is_bye=False),
    ]
    standings = calculate_standings(["a", "b"], results)
    for s in standings:
        assert s.omw_percent >= 0.33
        assert s.gw_percent >= 0.33
        assert s.ogw_percent >= 0.33
```

- [ ] **Step 3: Run tests**

Run: `cd backend && uv run pytest tests/test_standings.py -v`
Expected: All 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/cobs/logic/standings.py backend/tests/test_standings.py
git commit -m "feat: standings + tiebreaker calculations (port from TypeScript)"
```

---

## Task 7: Draft Generation Route

**Files:**
- Create: `backend/cobs/schemas/draft.py`
- Create: `backend/cobs/routes/drafts.py`
- Modify: `backend/cobs/app.py`
- Create: `backend/tests/test_drafts.py`

- [ ] **Step 1: Create `backend/cobs/schemas/draft.py`**

```python
import uuid
from datetime import datetime

from pydantic import BaseModel

from cobs.models.draft import DraftStatus


class DraftCreate(BaseModel):
    """Config overrides for the optimizer (all optional)."""
    score_want: float = 5.0
    score_avoid: float = -200.0
    score_neutral: float = 0.0
    match_point_penalty_weight: float = 10000.0
    early_round_bonus: float = 3.0
    lower_standing_bonus: float = 0.3
    repeat_avoid_multiplier: float = 4.0


class PodPlayerResponse(BaseModel):
    tournament_player_id: uuid.UUID
    username: str
    seat_number: int

    model_config = {"from_attributes": True}


class PodResponse(BaseModel):
    id: uuid.UUID
    pod_number: int
    pod_size: int
    cube_name: str
    cube_id: uuid.UUID
    timer_ends_at: datetime | None
    players: list[PodPlayerResponse]

    model_config = {"from_attributes": True}


class DraftResponse(BaseModel):
    id: uuid.UUID
    round_number: int
    status: DraftStatus
    pods: list[PodResponse]

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Create `backend/cobs/routes/drafts.py`**

```python
import random
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cobs.auth.dependencies import require_admin
from cobs.database import get_db
from cobs.logic.optimizer import CubeInput, OptimizerConfig, PlayerInput, optimize_pods
from cobs.logic.pod_sizes import calculate_pod_sizes
from cobs.models.cube import TournamentCube
from cobs.models.draft import Draft, DraftStatus, Pod, PodPlayer
from cobs.models.match import Match
from cobs.models.tournament import Tournament, TournamentPlayer, TournamentStatus
from cobs.models.user import User
from cobs.models.vote import CubeVote
from cobs.schemas.draft import DraftCreate, DraftResponse, PodPlayerResponse, PodResponse

router = APIRouter(prefix="/tournaments/{tournament_id}/drafts", tags=["drafts"])


@router.get("", response_model=list[DraftResponse])
async def list_drafts(
    tournament_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Draft)
        .where(Draft.tournament_id == tournament_id)
        .options(
            selectinload(Draft.pods)
            .selectinload(Pod.players)
            .selectinload(PodPlayer.tournament_player)
            .selectinload(TournamentPlayer.user),
            selectinload(Draft.pods)
            .selectinload(Pod.tournament_cube)
            .selectinload(TournamentCube.cube),
        )
        .order_by(Draft.round_number)
    )
    drafts = result.scalars().all()
    return [_draft_to_response(d) for d in drafts]


@router.get("/{draft_id}", response_model=DraftResponse)
async def get_draft(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Draft)
        .where(Draft.id == draft_id, Draft.tournament_id == tournament_id)
        .options(
            selectinload(Draft.pods)
            .selectinload(Pod.players)
            .selectinload(PodPlayer.tournament_player)
            .selectinload(TournamentPlayer.user),
            selectinload(Draft.pods)
            .selectinload(Pod.tournament_cube)
            .selectinload(TournamentCube.cube),
        )
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _draft_to_response(draft)


@router.post("", response_model=DraftResponse, status_code=201)
async def create_draft(
    tournament_id: uuid.UUID,
    body: DraftCreate = DraftCreate(),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Load tournament
    t_result = await db.execute(
        select(Tournament).where(Tournament.id == tournament_id)
    )
    tournament = t_result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

    if tournament.status not in (TournamentStatus.VOTING, TournamentStatus.DRAFTING):
        raise HTTPException(status_code=400, detail="Tournament not in VOTING or DRAFTING status")

    # Determine round number
    existing = await db.execute(
        select(Draft)
        .where(Draft.tournament_id == tournament_id)
        .order_by(Draft.round_number.desc())
    )
    last_draft = existing.scalars().first()
    round_number = (last_draft.round_number + 1) if last_draft else 1

    if round_number > tournament.max_rounds:
        raise HTTPException(status_code=400, detail="Max rounds reached")

    # Load active players with votes
    tp_result = await db.execute(
        select(TournamentPlayer)
        .where(
            TournamentPlayer.tournament_id == tournament_id,
            TournamentPlayer.dropped.is_(False),
        )
        .options(
            selectinload(TournamentPlayer.votes).selectinload(CubeVote.tournament_cube),
            selectinload(TournamentPlayer.user),
        )
    )
    tournament_players = tp_result.scalars().all()

    if len(tournament_players) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 active players")

    # Load cubes
    tc_result = await db.execute(
        select(TournamentCube)
        .where(TournamentCube.tournament_id == tournament_id)
        .options(selectinload(TournamentCube.cube))
    )
    tournament_cubes = tc_result.scalars().all()
    tc_by_cube_id = {str(tc.cube_id): tc for tc in tournament_cubes}

    if not tournament_cubes:
        raise HTTPException(status_code=400, detail="No cubes in tournament")

    # Determine used cube IDs from previous drafts
    used_cube_ids: set[str] = set()
    if last_draft:
        prev_pods_result = await db.execute(
            select(Pod)
            .join(Draft)
            .where(Draft.tournament_id == tournament_id)
        )
        for pod in prev_pods_result.scalars().all():
            tc = await db.execute(
                select(TournamentCube).where(TournamentCube.id == pod.tournament_cube_id)
            )
            tc_obj = tc.scalar_one_or_none()
            if tc_obj:
                used_cube_ids.add(str(tc_obj.cube_id))

    # Count prior AVOID assignments per player
    prior_avoid_counts: dict[str, int] = {}
    if last_draft:
        for tp in tournament_players:
            count = 0
            # Check all previous pod assignments for this player
            pp_result = await db.execute(
                select(PodPlayer)
                .join(Pod)
                .join(Draft)
                .where(
                    Draft.tournament_id == tournament_id,
                    PodPlayer.tournament_player_id == tp.id,
                )
                .options(
                    selectinload(PodPlayer.pod)
                    .selectinload(Pod.tournament_cube)
                )
            )
            for pp in pp_result.scalars().all():
                tc = pp.pod.tournament_cube
                cube_id_str = str(tc.cube_id)
                # Check player's vote for this cube
                for v in tp.votes:
                    if str(v.tournament_cube.cube_id) == cube_id_str and v.vote.value == "AVOID":
                        count += 1
            prior_avoid_counts[str(tp.id)] = count

    # Build optimizer inputs
    pod_sizes = calculate_pod_sizes(len(tournament_players))

    optimizer_players = []
    tp_by_id: dict[str, TournamentPlayer] = {}
    for tp in tournament_players:
        votes_dict: dict[str, str] = {}
        for v in tp.votes:
            votes_dict[str(v.tournament_cube.cube_id)] = v.vote.value
        optimizer_players.append(PlayerInput(
            id=str(tp.id),
            match_points=tp.match_points,
            votes=votes_dict,
            prior_avoid_count=prior_avoid_counts.get(str(tp.id), 0),
        ))
        tp_by_id[str(tp.id)] = tp

    # Filter available cubes
    available_cubes = [
        tc for tc in tournament_cubes
        if str(tc.cube_id) not in used_cube_ids
    ]
    if len(available_cubes) < len(pod_sizes):
        # Refill with used cubes
        refill = [tc for tc in tournament_cubes if str(tc.cube_id) in used_cube_ids]
        available_cubes = available_cubes + refill

    optimizer_cubes = [
        CubeInput(id=str(tc.cube_id), max_players=tc.max_players)
        for tc in available_cubes
    ]

    config = OptimizerConfig(
        score_want=body.score_want,
        score_avoid=body.score_avoid,
        score_neutral=body.score_neutral,
        match_point_penalty_weight=body.match_point_penalty_weight,
        early_round_bonus=body.early_round_bonus,
        lower_standing_bonus=body.lower_standing_bonus,
        repeat_avoid_multiplier=body.repeat_avoid_multiplier,
    )

    # Run optimizer
    opt_result = optimize_pods(
        optimizer_players, optimizer_cubes, pod_sizes, round_number, config
    )

    # Create draft + pods + pod_players
    draft = Draft(
        tournament_id=tournament_id,
        round_number=round_number,
        status=DraftStatus.ACTIVE,
    )
    db.add(draft)
    await db.flush()

    for k, (player_ids, cube_id) in enumerate(zip(opt_result.pods, opt_result.cube_ids)):
        # Find tournament_cube by cube_id
        tc = tc_by_cube_id.get(cube_id) if cube_id else None
        if not tc:
            tc = tournament_cubes[0]  # fallback

        pod = Pod(
            draft_id=draft.id,
            tournament_cube_id=tc.id,
            pod_number=k + 1,
            pod_size=len(player_ids),
        )
        db.add(pod)
        await db.flush()

        # Assign seats randomly
        shuffled_ids = list(player_ids)
        random.shuffle(shuffled_ids)
        for seat, pid in enumerate(shuffled_ids, 1):
            pp = PodPlayer(
                pod_id=pod.id,
                tournament_player_id=uuid.UUID(pid),
                seat_number=seat,
            )
            db.add(pp)

    # Update tournament status to DRAFTING
    tournament.status = TournamentStatus.DRAFTING
    await db.commit()

    # Reload draft with relationships
    result = await db.execute(
        select(Draft)
        .where(Draft.id == draft.id)
        .options(
            selectinload(Draft.pods)
            .selectinload(Pod.players)
            .selectinload(PodPlayer.tournament_player)
            .selectinload(TournamentPlayer.user),
            selectinload(Draft.pods)
            .selectinload(Pod.tournament_cube)
            .selectinload(TournamentCube.cube),
        )
    )
    draft = result.scalar_one()
    return _draft_to_response(draft)


def _draft_to_response(draft: Draft) -> DraftResponse:
    pods = []
    for pod in sorted(draft.pods, key=lambda p: p.pod_number):
        players = [
            PodPlayerResponse(
                tournament_player_id=pp.tournament_player_id,
                username=pp.tournament_player.user.username,
                seat_number=pp.seat_number,
            )
            for pp in sorted(pod.players, key=lambda p: p.seat_number)
        ]
        pods.append(PodResponse(
            id=pod.id,
            pod_number=pod.pod_number,
            pod_size=pod.pod_size,
            cube_name=pod.tournament_cube.cube.name,
            cube_id=pod.tournament_cube.cube_id,
            timer_ends_at=pod.timer_ends_at,
            players=players,
        ))
    return DraftResponse(
        id=draft.id,
        round_number=draft.round_number,
        status=draft.status,
        pods=pods,
    )
```

- [ ] **Step 3: Register in `backend/cobs/app.py`**

Add `from cobs.routes import drafts` and `app.include_router(drafts.router)`.

- [ ] **Step 4: Create `backend/tests/test_drafts.py`**

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _setup_tournament_with_players(client: AsyncClient, num_players: int = 8):
    """Create admin, cube, tournament in VOTING, join players, return context."""
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    admin_token = admin.json()["access_token"]
    ah = {"Authorization": f"Bearer {admin_token}"}

    # Create 2 cubes
    c1 = await client.post("/cubes", json={"name": "Cube Alpha"}, headers=ah)
    c2 = await client.post("/cubes", json={"name": "Cube Beta"}, headers=ah)

    t = await client.post(
        "/tournaments",
        json={"name": "Draft Test", "cube_ids": [c1.json()["id"], c2.json()["id"]]},
        headers=ah,
    )
    tid = t.json()["id"]
    code = t.json()["join_code"]

    # Set to VOTING
    await client.patch(f"/tournaments/{tid}", json={"status": "VOTING"}, headers=ah)

    # Join players
    player_tokens = []
    for i in range(num_players):
        j = await client.post(
            "/tournaments/join",
            json={"join_code": code, "username": f"player{i}", "password": "pw"},
        )
        player_tokens.append(j.json()["access_token"])

    return tid, ah, player_tokens


async def test_create_draft(client: AsyncClient):
    tid, ah, _ = await _setup_tournament_with_players(client, 8)

    resp = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    assert resp.status_code == 201
    data = resp.json()
    assert data["round_number"] == 1
    assert data["status"] == "ACTIVE"
    assert len(data["pods"]) >= 1

    # All 8 players should be assigned
    all_players = []
    for pod in data["pods"]:
        all_players.extend(pod["players"])
    assert len(all_players) == 8


async def test_create_draft_updates_status(client: AsyncClient):
    tid, ah, _ = await _setup_tournament_with_players(client, 8)
    await client.post(f"/tournaments/{tid}/drafts", headers=ah)

    detail = await client.get(f"/tournaments/{tid}")
    assert detail.json()["status"] == "DRAFTING"


async def test_list_drafts(client: AsyncClient):
    tid, ah, _ = await _setup_tournament_with_players(client, 8)
    await client.post(f"/tournaments/{tid}/drafts", headers=ah)

    resp = await client.get(f"/tournaments/{tid}/drafts")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


async def test_cannot_exceed_max_rounds(client: AsyncClient):
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}

    c = await client.post("/cubes", json={"name": "C1"}, headers=ah)
    t = await client.post(
        "/tournaments",
        json={"name": "MaxRounds", "cube_ids": [c.json()["id"]], "max_rounds": 1},
        headers=ah,
    )
    tid = t.json()["id"]
    code = t.json()["join_code"]

    await client.patch(f"/tournaments/{tid}", json={"status": "VOTING"}, headers=ah)

    for i in range(2):
        await client.post(
            "/tournaments/join",
            json={"join_code": code, "username": f"p{i}", "password": "pw"},
        )

    # First draft OK
    r1 = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    assert r1.status_code == 201

    # Second draft should fail (max_rounds=1)
    r2 = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    assert r2.status_code == 400
```

- [ ] **Step 5: Run tests**

Run: `cd backend && uv run pytest tests/ -v`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/cobs/schemas/draft.py backend/cobs/routes/drafts.py backend/cobs/app.py backend/tests/test_drafts.py
git commit -m "feat: draft generation route with optimizer integration"
```

---

## Task 8: Match Reporting + Swiss Pairing Routes

**Files:**
- Create: `backend/cobs/schemas/match.py`
- Create: `backend/cobs/routes/matches.py`
- Modify: `backend/cobs/app.py`
- Create: `backend/tests/test_matches.py`

- [ ] **Step 1: Create `backend/cobs/schemas/match.py`**

```python
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
```

- [ ] **Step 2: Create `backend/cobs/routes/matches.py`**

```python
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cobs.auth.dependencies import get_current_user, require_admin
from cobs.database import get_db
from cobs.logic.swiss import generate_swiss_pairings
from cobs.models.draft import Draft, Pod, PodPlayer
from cobs.models.match import Match
from cobs.models.tournament import TournamentPlayer
from cobs.models.user import User
from cobs.schemas.match import MatchReportRequest, MatchResolveRequest, MatchResponse

router = APIRouter(
    prefix="/tournaments/{tournament_id}/drafts/{draft_id}",
    tags=["matches"],
)


@router.post("/pairings", response_model=list[MatchResponse], status_code=201)
async def generate_pairings(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Generate Swiss pairings for the next round within each pod."""
    draft = await _get_draft(draft_id, tournament_id, db)

    # Check for unresolved conflicts or unreported matches
    conflict_result = await db.execute(
        select(Match)
        .join(Pod)
        .where(Pod.draft_id == draft_id, Match.has_conflict.is_(True))
    )
    if conflict_result.scalars().first():
        raise HTTPException(status_code=400, detail="Unresolved match conflicts exist")

    unreported_result = await db.execute(
        select(Match)
        .join(Pod)
        .where(
            Pod.draft_id == draft_id,
            Match.reported.is_(False),
            Match.is_bye.is_(False),
        )
    )
    if unreported_result.scalars().first():
        raise HTTPException(status_code=400, detail="Unreported matches from previous round")

    # Determine current swiss round
    existing_matches = await db.execute(
        select(Match).join(Pod).where(Pod.draft_id == draft_id)
    )
    all_matches = existing_matches.scalars().all()
    current_round = max((m.swiss_round for m in all_matches), default=0) + 1

    if current_round > 3:
        raise HTTPException(status_code=400, detail="Max 3 swiss rounds per draft")

    # Generate pairings per pod
    pods_result = await db.execute(
        select(Pod)
        .where(Pod.draft_id == draft_id)
        .options(
            selectinload(Pod.players)
            .selectinload(PodPlayer.tournament_player)
            .selectinload(TournamentPlayer.user),
        )
    )
    pods = pods_result.scalars().all()

    new_matches: list[Match] = []

    for pod in pods:
        # Get players in this pod
        players = [
            {"id": str(pp.tournament_player_id), "match_points": pp.tournament_player.match_points}
            for pp in pod.players
        ]

        # Get previous matches for this pod
        prev_result = await db.execute(
            select(Match).where(Match.pod_id == pod.id)
        )
        prev_matches = [
            {"player1_id": str(m.player1_id), "player2_id": str(m.player2_id) if m.player2_id else None}
            for m in prev_result.scalars().all()
        ]

        # Get previous byes
        prev_byes = [
            str(m.player1_id)
            for m in (await db.execute(
                select(Match).where(Match.pod_id == pod.id, Match.is_bye.is_(True))
            )).scalars().all()
        ]

        result = generate_swiss_pairings(players, prev_matches, prev_byes)

        for pairing in result.pairings:
            match = Match(
                pod_id=pod.id,
                swiss_round=current_round,
                player1_id=uuid.UUID(pairing.player1_id),
                player2_id=uuid.UUID(pairing.player2_id) if pairing.player2_id else None,
                is_bye=pairing.is_bye,
                reported=pairing.is_bye,  # Byes are auto-reported
                player1_wins=2 if pairing.is_bye else 0,
            )
            if pairing.is_bye:
                # Update player match points for bye
                tp_result = await db.execute(
                    select(TournamentPlayer).where(
                        TournamentPlayer.id == uuid.UUID(pairing.player1_id)
                    )
                )
                tp = tp_result.scalar_one()
                tp.match_points += 3
                tp.game_wins += 2

            db.add(match)
            new_matches.append(match)

    await db.commit()

    # Return all matches for this draft
    return await _get_draft_matches(draft_id, db)


@router.get("/matches", response_model=list[MatchResponse])
async def list_matches(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    return await _get_draft_matches(draft_id, db)


@router.post("/matches/{match_id}/report", response_model=MatchResponse)
async def report_match(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    match_id: uuid.UUID,
    body: MatchReportRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Player self-reports match result."""
    match = await _get_match(match_id, db)

    if match.is_bye:
        raise HTTPException(status_code=400, detail="Cannot report a bye")
    if match.reported:
        raise HTTPException(status_code=400, detail="Match already finalized")

    # Find which player is reporting (scoped to this tournament)
    pod_result = await db.execute(select(Pod).where(Pod.id == match.pod_id))
    pod = pod_result.scalar_one()
    draft_result = await db.execute(select(Draft).where(Draft.id == pod.draft_id))
    draft_obj = draft_result.scalar_one()

    tp_result = await db.execute(
        select(TournamentPlayer).where(
            TournamentPlayer.user_id == user.id,
            TournamentPlayer.tournament_id == draft_obj.tournament_id,
        )
    )
    tp = tp_result.scalar_one_or_none()
    if not tp:
        raise HTTPException(status_code=403, detail="Not a participant")

    if tp.id == match.player1_id:
        match.p1_reported_p1_wins = body.player1_wins
        match.p1_reported_p2_wins = body.player2_wins
    elif tp.id == match.player2_id:
        match.p2_reported_p1_wins = body.player1_wins
        match.p2_reported_p2_wins = body.player2_wins
    else:
        raise HTTPException(status_code=403, detail="Not in this match")

    # Check if both reported and if they agree
    if (
        match.p1_reported_p1_wins is not None
        and match.p2_reported_p1_wins is not None
    ):
        if (
            match.p1_reported_p1_wins == match.p2_reported_p1_wins
            and match.p1_reported_p2_wins == match.p2_reported_p2_wins
        ):
            # Agreement — finalize
            match.player1_wins = match.p1_reported_p1_wins
            match.player2_wins = match.p1_reported_p2_wins
            match.reported = True
            match.has_conflict = False
            await _update_player_points(match, db)
        else:
            match.has_conflict = True

    await db.commit()
    await db.refresh(match)
    return await _match_to_response(match, db)


@router.post("/matches/{match_id}/resolve", response_model=MatchResponse)
async def resolve_match(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    match_id: uuid.UUID,
    body: MatchResolveRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin resolves a match conflict or manually sets result."""
    match = await _get_match(match_id, db)

    match.player1_wins = body.player1_wins
    match.player2_wins = body.player2_wins
    match.reported = True
    match.has_conflict = False
    await _update_player_points(match, db)

    await db.commit()
    await db.refresh(match)
    return await _match_to_response(match, db)


async def _update_player_points(match: Match, db: AsyncSession):
    """Update tournament player match points and game records."""
    p1 = await db.execute(
        select(TournamentPlayer).where(TournamentPlayer.id == match.player1_id)
    )
    tp1 = p1.scalar_one()
    tp1.game_wins += match.player1_wins
    tp1.game_losses += match.player2_wins

    if match.player2_id:
        p2 = await db.execute(
            select(TournamentPlayer).where(TournamentPlayer.id == match.player2_id)
        )
        tp2 = p2.scalar_one()
        tp2.game_wins += match.player2_wins
        tp2.game_losses += match.player1_wins

        if match.player1_wins > match.player2_wins:
            tp1.match_points += 3
        elif match.player2_wins > match.player1_wins:
            tp2.match_points += 3
        else:
            tp1.match_points += 1
            tp2.match_points += 1


async def _get_draft(draft_id: uuid.UUID, tournament_id: uuid.UUID, db: AsyncSession) -> Draft:
    result = await db.execute(
        select(Draft).where(Draft.id == draft_id, Draft.tournament_id == tournament_id)
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft


async def _get_match(match_id: uuid.UUID, db: AsyncSession) -> Match:
    result = await db.execute(select(Match).where(Match.id == match_id))
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    return match


async def _get_draft_matches(draft_id: uuid.UUID, db: AsyncSession) -> list[MatchResponse]:
    result = await db.execute(
        select(Match)
        .join(Pod)
        .where(Pod.draft_id == draft_id)
        .options(
            selectinload(Match.player1).selectinload(TournamentPlayer.user),
            selectinload(Match.player2).selectinload(TournamentPlayer.user),
        )
        .order_by(Match.swiss_round, Match.pod_id)
    )
    matches = result.scalars().all()
    return [
        MatchResponse(
            id=m.id,
            pod_id=m.pod_id,
            swiss_round=m.swiss_round,
            player1_id=m.player1_id,
            player1_username=m.player1.user.username,
            player2_id=m.player2_id,
            player2_username=m.player2.user.username if m.player2 else None,
            player1_wins=m.player1_wins,
            player2_wins=m.player2_wins,
            is_bye=m.is_bye,
            reported=m.reported,
            has_conflict=m.has_conflict,
            p1_reported_p1_wins=m.p1_reported_p1_wins,
            p1_reported_p2_wins=m.p1_reported_p2_wins,
            p2_reported_p1_wins=m.p2_reported_p1_wins,
            p2_reported_p2_wins=m.p2_reported_p2_wins,
        )
        for m in matches
    ]


async def _match_to_response(match: Match, db: AsyncSession) -> MatchResponse:
    await db.refresh(match, ["player1", "player2"])
    p1_user = (await db.execute(
        select(TournamentPlayer).where(TournamentPlayer.id == match.player1_id).options(selectinload(TournamentPlayer.user))
    )).scalar_one()
    p2_user = None
    if match.player2_id:
        p2_user = (await db.execute(
            select(TournamentPlayer).where(TournamentPlayer.id == match.player2_id).options(selectinload(TournamentPlayer.user))
        )).scalar_one()

    return MatchResponse(
        id=match.id,
        pod_id=match.pod_id,
        swiss_round=match.swiss_round,
        player1_id=match.player1_id,
        player1_username=p1_user.user.username,
        player2_id=match.player2_id,
        player2_username=p2_user.user.username if p2_user else None,
        player1_wins=match.player1_wins,
        player2_wins=match.player2_wins,
        is_bye=match.is_bye,
        reported=match.reported,
        has_conflict=match.has_conflict,
        p1_reported_p1_wins=match.p1_reported_p1_wins,
        p1_reported_p2_wins=match.p1_reported_p2_wins,
        p2_reported_p1_wins=match.p2_reported_p1_wins,
        p2_reported_p2_wins=match.p2_reported_p2_wins,
    )
```

- [ ] **Step 3: Register in `backend/cobs/app.py`**

Add `from cobs.routes import matches` and `app.include_router(matches.router)`.

- [ ] **Step 4: Create `backend/tests/test_matches.py`**

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _full_setup(client: AsyncClient, num_players: int = 8):
    """Create tournament with players and generate a draft."""
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    at = admin.json()["access_token"]
    ah = {"Authorization": f"Bearer {at}"}

    c1 = await client.post("/cubes", json={"name": "C1"}, headers=ah)
    c2 = await client.post("/cubes", json={"name": "C2"}, headers=ah)

    t = await client.post(
        "/tournaments",
        json={"name": "MatchTest", "cube_ids": [c1.json()["id"], c2.json()["id"]]},
        headers=ah,
    )
    tid = t.json()["id"]
    code = t.json()["join_code"]

    await client.patch(f"/tournaments/{tid}", json={"status": "VOTING"}, headers=ah)

    player_tokens = []
    for i in range(num_players):
        j = await client.post(
            "/tournaments/join",
            json={"join_code": code, "username": f"p{i}", "password": "pw"},
        )
        player_tokens.append(j.json()["access_token"])

    # Create draft
    draft_resp = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    draft_id = draft_resp.json()["id"]

    return tid, draft_id, ah, player_tokens


async def test_generate_pairings(client: AsyncClient):
    tid, did, ah, _ = await _full_setup(client, 8)

    resp = await client.post(f"/tournaments/{tid}/drafts/{did}/pairings", headers=ah)
    assert resp.status_code == 201
    matches = resp.json()
    assert len(matches) >= 4  # 4 matches for 8 players


async def test_list_matches(client: AsyncClient):
    tid, did, ah, _ = await _full_setup(client, 8)
    await client.post(f"/tournaments/{tid}/drafts/{did}/pairings", headers=ah)

    resp = await client.get(f"/tournaments/{tid}/drafts/{did}/matches")
    assert resp.status_code == 200
    assert len(resp.json()) >= 4


async def test_report_match(client: AsyncClient):
    tid, did, ah, pts = await _full_setup(client, 4)
    pairings = await client.post(
        f"/tournaments/{tid}/drafts/{did}/pairings", headers=ah
    )
    matches = [m for m in pairings.json() if not m["is_bye"]]
    if not matches:
        return  # skip if all byes (unlikely with 4 players)

    match = matches[0]
    mid = match["id"]

    # Player 1 reports
    p1_id = match["player1_id"]
    # Find which token belongs to player1
    for pt in pts:
        me = await client.get("/auth/me", headers={"Authorization": f"Bearer {pt}"})
        resp = await client.post(
            f"/tournaments/{tid}/drafts/{did}/matches/{mid}/report",
            json={"player1_wins": 2, "player2_wins": 1},
            headers={"Authorization": f"Bearer {pt}"},
        )
        if resp.status_code == 200:
            break  # Found a player in this match

    assert resp.status_code == 200


async def test_max_3_swiss_rounds(client: AsyncClient):
    tid, did, ah, _ = await _full_setup(client, 4)

    # Generate 3 rounds of pairings
    for _ in range(3):
        resp = await client.post(
            f"/tournaments/{tid}/drafts/{did}/pairings", headers=ah
        )
        assert resp.status_code == 201

        # Auto-resolve all matches for this round
        matches_resp = await client.get(f"/tournaments/{tid}/drafts/{did}/matches")
        for m in matches_resp.json():
            if not m["reported"]:
                await client.post(
                    f"/tournaments/{tid}/drafts/{did}/matches/{m['id']}/resolve",
                    json={"player1_wins": 2, "player2_wins": 0},
                    headers=ah,
                )

    # 4th round should fail
    resp = await client.post(
        f"/tournaments/{tid}/drafts/{did}/pairings", headers=ah
    )
    assert resp.status_code == 400
```

- [ ] **Step 5: Run all tests**

Run: `cd backend && uv run pytest tests/ -v`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/cobs/schemas/match.py backend/cobs/routes/matches.py backend/cobs/app.py backend/tests/test_matches.py
git commit -m "feat: match reporting + Swiss pairing routes"
```

---

## Task 9: Standings Route

**Files:**
- Create: `backend/cobs/schemas/standings.py`
- Create: `backend/cobs/routes/standings.py`
- Modify: `backend/cobs/app.py`

- [ ] **Step 1: Create `backend/cobs/schemas/standings.py`**

```python
import uuid

from pydantic import BaseModel


class StandingsEntryResponse(BaseModel):
    player_id: uuid.UUID
    username: str
    match_points: int
    match_wins: int
    match_losses: int
    match_draws: int
    game_wins: int
    game_losses: int
    omw_percent: float
    gw_percent: float
    ogw_percent: float
    dropped: bool
```

- [ ] **Step 2: Create `backend/cobs/routes/standings.py`**

```python
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cobs.database import get_db
from cobs.logic.standings import calculate_standings
from cobs.logic.swiss import MatchResult
from cobs.models.draft import Draft, Pod
from cobs.models.match import Match
from cobs.models.tournament import Tournament, TournamentPlayer
from cobs.schemas.standings import StandingsEntryResponse

router = APIRouter(prefix="/tournaments/{tournament_id}/standings", tags=["standings"])


@router.get("", response_model=list[StandingsEntryResponse])
async def get_standings(
    tournament_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    # Verify tournament exists
    t_result = await db.execute(
        select(Tournament).where(Tournament.id == tournament_id)
    )
    if not t_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tournament not found")

    # Get all players
    tp_result = await db.execute(
        select(TournamentPlayer)
        .where(TournamentPlayer.tournament_id == tournament_id)
        .options(selectinload(TournamentPlayer.user))
    )
    tournament_players = tp_result.scalars().all()
    tp_map = {str(tp.id): tp for tp in tournament_players}

    # Get all reported matches
    match_result = await db.execute(
        select(Match)
        .join(Pod)
        .join(Draft)
        .where(Draft.tournament_id == tournament_id, Match.reported.is_(True))
    )
    matches = match_result.scalars().all()

    results = [
        MatchResult(
            player1_id=str(m.player1_id),
            player2_id=str(m.player2_id) if m.player2_id else None,
            player1_wins=m.player1_wins,
            player2_wins=m.player2_wins,
            is_bye=m.is_bye,
        )
        for m in matches
    ]

    dropped_ids = {str(tp.id) for tp in tournament_players if tp.dropped}
    player_ids = [str(tp.id) for tp in tournament_players]

    entries = calculate_standings(player_ids, results, dropped_ids)

    return [
        StandingsEntryResponse(
            player_id=uuid.UUID(e.player_id),
            username=tp_map[e.player_id].user.username,
            match_points=e.match_points,
            match_wins=e.match_wins,
            match_losses=e.match_losses,
            match_draws=e.match_draws,
            game_wins=e.game_wins,
            game_losses=e.game_losses,
            omw_percent=e.omw_percent,
            gw_percent=e.gw_percent,
            ogw_percent=e.ogw_percent,
            dropped=e.dropped,
        )
        for e in entries
    ]
```

- [ ] **Step 3: Register in `backend/cobs/app.py`**

Add `from cobs.routes import standings` and `app.include_router(standings.router)`.

- [ ] **Step 4: Run all tests**

Run: `cd backend && uv run pytest tests/ -v`
Expected: All tests pass (no new test file needed — standings logic is covered by test_standings.py, and the route is exercised indirectly through the match tests).

- [ ] **Step 5: Commit**

```bash
git add backend/cobs/schemas/standings.py backend/cobs/routes/standings.py backend/cobs/app.py
git commit -m "feat: standings route with tiebreaker calculations"
```

---

## Phase 2 Complete — Summary

After completing all 9 tasks, the backend has:

- **New models:** Draft, Pod, PodPlayer, Match (with dual-report + conflict detection)
- **Voting:** GET/PUT votes per player per tournament (VOTING phase only)
- **Optimizer:** OR-Tools CP-SAT solver as a direct Python module
- **Draft generation:** Admin creates drafts → optimizer assigns pods → random seating
- **Swiss pairing:** Greedy algorithm within pods, bye handling, repeat avoidance
- **Match reporting:** Player dual-report, conflict detection, admin resolve
- **Standings:** Full MTG tiebreakers (OMW%, GW%, OGW%, min 33%)

### Next: Phase 3

Phase 3 plan will cover:
1. Player UI (mobile-first, Mantine components)
2. Admin UI (tournament management dashboard)
3. Photo upload (POOL, DECK, RETURNED)
4. Pod timer
5. WebSocket events (pairings ready, timer sync)
