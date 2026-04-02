# Batch Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a batch analysis system that runs Z full tournament simulations (with random votes, multiple drafts, and simulated match results) to statistically evaluate how well the optimizer assigns cubes to players under configurable conditions.

**Architecture:** New pure-logic module `batch_simulator.py` runs a single tournament simulation (random votes → multiple drafts with Swiss rounds → collect vote satisfaction stats). A new API endpoint accepts batch config (player/cube counts, vote distribution, player profiles, optimizer config, Z iterations) and runs all simulations, persisting aggregated results + per-simulation details to a new `BatchAnalysis` model. Frontend adds a "Batch-Analyse" tab to the Optimizer Playground with config form, results table, and detail drill-down. CSV export for raw data.

**Tech Stack:** FastAPI, SQLAlchemy (async), Python random (seeded), Mantine UI (React)

---

## File Structure

### Backend — New Files
- `backend/cobs/logic/batch_simulator.py` — Pure function: runs one full tournament simulation (votes → drafts → matches → stats)
- `backend/cobs/models/batch_analysis.py` — BatchAnalysis model
- `backend/cobs/schemas/batch_analysis.py` — Request/Response schemas
- `backend/cobs/routes/batch_analysis.py` — API endpoints
- `backend/tests/test_batch_analysis.py` — Tests

### Backend — Modified Files
- `backend/cobs/app.py` — Register new router
- `backend/alembic/versions/3dad6d21c1b8_initial_v2_schema.py` — Add batch_analyses table

### Frontend — Modified Files
- `frontend/src/api/types.ts` — Add BatchAnalysis types
- `frontend/src/pages/admin/OptimizerPlayground.tsx` — Add "Batch-Analyse" tab

---

### Task 1: Batch Simulator Pure Logic

**Files:**
- Create: `backend/cobs/logic/batch_simulator.py`
- Create: `backend/tests/test_batch_simulator.py`

This is the core logic — a pure function that simulates one complete tournament. No DB access, no FastAPI — just data in, data out.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_batch_simulator.py`:

```python
from cobs.logic.batch_simulator import simulate_tournament, TournamentConfig, PlayerProfile, VoteDistribution


def test_basic_simulation():
    config = TournamentConfig(
        num_players=8,
        num_cubes=2,
        max_rounds=1,
        swiss_rounds_per_draft=3,
        vote_distribution=VoteDistribution(desired=0.4, neutral=0.3, avoid=0.3),
        player_profiles=[],
        optimizer_config={},
    )
    result = simulate_tournament(config, seed=42)
    assert result["player_count"] == 8
    assert len(result["drafts"]) == 1
    assert result["drafts"][0]["desired_pct"] + result["drafts"][0]["neutral_pct"] + result["drafts"][0]["avoid_pct"] == 100


def test_multi_round():
    config = TournamentConfig(
        num_players=16,
        num_cubes=4,
        max_rounds=3,
        swiss_rounds_per_draft=3,
        vote_distribution=VoteDistribution(desired=0.4, neutral=0.3, avoid=0.3),
        player_profiles=[],
        optimizer_config={},
    )
    result = simulate_tournament(config, seed=42)
    assert len(result["drafts"]) == 3


def test_deterministic():
    config = TournamentConfig(
        num_players=8, num_cubes=2, max_rounds=1, swiss_rounds_per_draft=3,
        vote_distribution=VoteDistribution(desired=0.4, neutral=0.3, avoid=0.3),
        player_profiles=[], optimizer_config={},
    )
    r1 = simulate_tournament(config, seed=99)
    r2 = simulate_tournament(config, seed=99)
    assert r1 == r2


def test_player_profile():
    config = TournamentConfig(
        num_players=8, num_cubes=4, max_rounds=1, swiss_rounds_per_draft=1,
        vote_distribution=VoteDistribution(desired=0.4, neutral=0.3, avoid=0.3),
        player_profiles=[
            PlayerProfile(count=2, desired_pct=0.1, neutral_pct=0.0, avoid_pct=0.9),
        ],
        optimizer_config={},
    )
    result = simulate_tournament(config, seed=42)
    assert result["player_count"] == 8


def test_custom_optimizer_config():
    config = TournamentConfig(
        num_players=8, num_cubes=2, max_rounds=1, swiss_rounds_per_draft=1,
        vote_distribution=VoteDistribution(desired=0.5, neutral=0.3, avoid=0.2),
        player_profiles=[],
        optimizer_config={"score_avoid": -500.0, "avoid_penalty_scaling": 2.0},
    )
    result = simulate_tournament(config, seed=42)
    assert result["player_count"] == 8
    assert result["config"]["score_avoid"] == -500.0
```

- [ ] **Step 2: Implement batch_simulator.py**

Create `backend/cobs/logic/batch_simulator.py`:

```python
"""Pure logic for simulating a full tournament with random votes and match results."""

import random
from dataclasses import dataclass, field

from cobs.logic.optimizer import CubeInput, OptimizerConfig, PlayerInput, optimize_pods
from cobs.logic.pod_sizes import calculate_pod_sizes
from cobs.logic.swiss import generate_swiss_pairings


@dataclass
class VoteDistribution:
    desired: float = 0.4
    neutral: float = 0.3
    avoid: float = 0.3


@dataclass
class PlayerProfile:
    """Override vote distribution for a subset of players."""
    count: int = 1
    desired_pct: float = 0.1
    neutral_pct: float = 0.0
    avoid_pct: float = 0.9


@dataclass
class TournamentConfig:
    num_players: int = 16
    num_cubes: int = 4
    max_rounds: int = 3
    swiss_rounds_per_draft: int = 3
    vote_distribution: VoteDistribution = field(default_factory=VoteDistribution)
    player_profiles: list[PlayerProfile] = field(default_factory=list)
    optimizer_config: dict = field(default_factory=dict)


def _generate_votes(
    rng: random.Random,
    num_players: int,
    cube_ids: list[str],
    distribution: VoteDistribution,
    profiles: list[PlayerProfile],
) -> dict[str, dict[str, str]]:
    """Generate random votes for all players.

    Returns: {player_id: {cube_id: "DESIRED"|"NEUTRAL"|"AVOID"}}
    """
    votes: dict[str, dict[str, str]] = {}
    vote_types = ["DESIRED", "NEUTRAL", "AVOID"]

    # Determine which players get special profiles
    profile_assignments: list[VoteDistribution | None] = [None] * num_players
    idx = 0
    for profile in profiles:
        for _ in range(profile.count):
            if idx < num_players:
                profile_assignments[idx] = VoteDistribution(
                    desired=profile.desired_pct,
                    neutral=profile.neutral_pct,
                    avoid=profile.avoid_pct,
                )
                idx += 1

    for p in range(num_players):
        pid = f"p{p}"
        dist = profile_assignments[p] or distribution
        weights = [dist.desired, dist.neutral, dist.avoid]
        player_votes = {}
        for cid in cube_ids:
            player_votes[cid] = rng.choices(vote_types, weights=weights, k=1)[0]
        votes[pid] = player_votes

    return votes


def _simulate_swiss_matches(
    rng: random.Random,
    pod_players: list[dict],
    num_rounds: int,
) -> dict[str, int]:
    """Simulate Swiss rounds within a pod. Returns {player_id: match_points}."""
    points = {p["id"]: 0 for p in pod_players}
    prev_matches: list[dict] = []
    prev_byes: list[str] = []

    for _ in range(num_rounds):
        players = [{"id": p["id"], "match_points": points[p["id"]], "seat_number": i + 1}
                   for i, p in enumerate(pod_players)]

        result = generate_swiss_pairings(players, prev_matches, prev_byes)

        for pairing in result.pairings:
            if pairing.is_bye:
                points[pairing.player1_id] += 3
                prev_byes.append(pairing.player1_id)
            else:
                prev_matches.append({
                    "player1_id": pairing.player1_id,
                    "player2_id": pairing.player2_id,
                })
                # Random match result
                outcomes = [(2, 0), (2, 1), (1, 2), (0, 2)]
                weights = [30, 40, 20, 10]
                p1w, p2w = rng.choices(outcomes, weights=weights, k=1)[0]
                if p1w > p2w:
                    points[pairing.player1_id] += 3
                elif p2w > p1w:
                    points[pairing.player2_id] += 3
                else:
                    points[pairing.player1_id] += 1
                    points[pairing.player2_id] += 1

    return points


def simulate_tournament(config: TournamentConfig, seed: int) -> dict:
    """Simulate a full tournament with random votes and match results.

    Returns a dict with:
    - player_count, cube_count, max_rounds
    - config: the optimizer config used
    - drafts: list of per-draft results
    - summary: aggregated stats across all drafts
    """
    rng = random.Random(seed)

    cube_ids = [f"cube_{i}" for i in range(config.num_cubes)]
    player_ids = [f"p{i}" for i in range(config.num_players)]

    # Generate votes
    all_votes = _generate_votes(rng, config.num_players, cube_ids, config.vote_distribution, config.player_profiles)

    # Build optimizer config
    opt_config_dict = {
        "score_want": 5.0, "score_avoid": -200.0, "score_neutral": 0.0,
        "match_point_penalty_weight": 100000.0, "early_round_bonus": 3.0,
        "lower_standing_bonus": 0.3, "repeat_avoid_multiplier": 4.0,
        "avoid_penalty_scaling": 1.0,
    }
    opt_config_dict.update(config.optimizer_config)
    opt_config = OptimizerConfig(**{k: v for k, v in opt_config_dict.items() if hasattr(OptimizerConfig, k)})

    # Track standings across drafts
    standings = {pid: 0 for pid in player_ids}
    used_cube_ids: set[str] = set()
    prior_avoid_counts = {pid: 0 for pid in player_ids}

    drafts_data = []
    total_desired = 0
    total_neutral = 0
    total_avoid = 0

    for round_num in range(1, config.max_rounds + 1):
        pod_sizes = calculate_pod_sizes(config.num_players)

        # Build optimizer inputs
        optimizer_players = [
            PlayerInput(
                id=pid,
                match_points=standings[pid],
                votes=all_votes[pid],
                prior_avoid_count=prior_avoid_counts[pid],
            )
            for pid in player_ids
        ]

        # Filter available cubes (rotation)
        available = [cid for cid in cube_ids if cid not in used_cube_ids]
        if len(available) < len(pod_sizes):
            available = available + [cid for cid in cube_ids if cid in used_cube_ids]
        optimizer_cubes = [CubeInput(id=cid) for cid in available]

        # Run optimizer
        opt_result = optimize_pods(
            optimizer_players, optimizer_cubes, pod_sizes, round_num, opt_config,
            seed=seed + round_num,
        )

        # Analyze results
        draft_desired = 0
        draft_neutral = 0
        draft_avoid = 0
        pods_data = []

        for k, (pod_player_ids, cube_id) in enumerate(zip(opt_result.pods, opt_result.cube_ids)):
            if cube_id:
                used_cube_ids.add(cube_id)

            pod_players_info = []
            for pid in pod_player_ids:
                vote = all_votes[pid].get(cube_id, "NEUTRAL") if cube_id else "NEUTRAL"
                if vote == "DESIRED":
                    draft_desired += 1
                elif vote == "AVOID":
                    draft_avoid += 1
                    prior_avoid_counts[pid] += 1
                else:
                    draft_neutral += 1
                pod_players_info.append({"id": pid, "vote": vote, "match_points": standings[pid]})

            pods_data.append({
                "cube_id": cube_id,
                "players": pod_players_info,
                "desired": sum(1 for p in pod_players_info if p["vote"] == "DESIRED"),
                "neutral": sum(1 for p in pod_players_info if p["vote"] == "NEUTRAL"),
                "avoid": sum(1 for p in pod_players_info if p["vote"] == "AVOID"),
            })

        total_desired += draft_desired
        total_neutral += draft_neutral
        total_avoid += draft_avoid
        total_assignments = draft_desired + draft_neutral + draft_avoid

        drafts_data.append({
            "round": round_num,
            "pods": pods_data,
            "desired_pct": round(draft_desired * 100 / total_assignments) if total_assignments else 0,
            "neutral_pct": round(draft_neutral * 100 / total_assignments) if total_assignments else 0,
            "avoid_pct": round(draft_avoid * 100 / total_assignments) if total_assignments else 0,
            "objective": opt_result.objective,
        })

        # Simulate Swiss matches to update standings for next draft
        for k, pod_player_ids in enumerate(opt_result.pods):
            pod_players = [{"id": pid} for pid in pod_player_ids]
            match_points = _simulate_swiss_matches(rng, pod_players, config.swiss_rounds_per_draft)
            for pid, pts in match_points.items():
                standings[pid] += pts

    grand_total = total_desired + total_neutral + total_avoid
    return {
        "player_count": config.num_players,
        "cube_count": config.num_cubes,
        "max_rounds": config.max_rounds,
        "config": opt_config_dict,
        "drafts": drafts_data,
        "summary": {
            "desired_pct": round(total_desired * 100 / grand_total, 1) if grand_total else 0,
            "neutral_pct": round(total_neutral * 100 / grand_total, 1) if grand_total else 0,
            "avoid_pct": round(total_avoid * 100 / grand_total, 1) if grand_total else 0,
            "total_desired": total_desired,
            "total_neutral": total_neutral,
            "total_avoid": total_avoid,
        },
    }
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/christoph/git/COBS/backend && uv run pytest tests/test_batch_simulator.py -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/cobs/logic/batch_simulator.py backend/tests/test_batch_simulator.py
git commit -m "feat: add pure batch tournament simulator with configurable votes and player profiles"
```

---

### Task 2: BatchAnalysis Model + Schema + Migration

**Files:**
- Create: `backend/cobs/models/batch_analysis.py`
- Create: `backend/cobs/schemas/batch_analysis.py`
- Modify: `backend/alembic/versions/3dad6d21c1b8_initial_v2_schema.py`

- [ ] **Step 1: Create model**

Create `backend/cobs/models/batch_analysis.py`:

```python
import uuid

from sqlalchemy import Float, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from cobs.models.base import Base, TimestampMixin


class BatchAnalysis(TimestampMixin, Base):
    __tablename__ = "batch_analyses"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    label: Mapped[str] = mapped_column(String(200), default="")

    # Config
    num_players: Mapped[int] = mapped_column(Integer)
    num_cubes: Mapped[int] = mapped_column(Integer)
    max_rounds: Mapped[int] = mapped_column(Integer)
    swiss_rounds_per_draft: Mapped[int] = mapped_column(Integer, default=3)
    num_simulations: Mapped[int] = mapped_column(Integer)
    vote_distribution: Mapped[dict] = mapped_column(JSON, default=dict)
    player_profiles: Mapped[list] = mapped_column(JSON, default=list)
    optimizer_config: Mapped[dict] = mapped_column(JSON, default=dict)

    # Aggregated results
    avg_desired_pct: Mapped[float] = mapped_column(Float, default=0.0)
    avg_neutral_pct: Mapped[float] = mapped_column(Float, default=0.0)
    avg_avoid_pct: Mapped[float] = mapped_column(Float, default=0.0)
    min_desired_pct: Mapped[float] = mapped_column(Float, default=0.0)
    max_desired_pct: Mapped[float] = mapped_column(Float, default=0.0)
    min_avoid_pct: Mapped[float] = mapped_column(Float, default=0.0)
    max_avoid_pct: Mapped[float] = mapped_column(Float, default=0.0)

    # Per-simulation details (JSON array)
    simulations: Mapped[list] = mapped_column(JSON, default=list)

    total_time_ms: Mapped[int] = mapped_column(Integer, default=0)
```

- [ ] **Step 2: Create schemas**

Create `backend/cobs/schemas/batch_analysis.py`:

```python
import uuid
from pydantic import BaseModel


class VoteDistributionConfig(BaseModel):
    desired: float = 0.4
    neutral: float = 0.3
    avoid: float = 0.3


class PlayerProfileConfig(BaseModel):
    count: int = 1
    desired_pct: float = 0.1
    neutral_pct: float = 0.0
    avoid_pct: float = 0.9


class BatchAnalysisRequest(BaseModel):
    label: str = ""
    num_players: int = 16
    num_cubes: int = 4
    max_rounds: int = 3
    swiss_rounds_per_draft: int = 3
    num_simulations: int = 10
    vote_distribution: VoteDistributionConfig = VoteDistributionConfig()
    player_profiles: list[PlayerProfileConfig] = []
    optimizer_config: dict = {}


class BatchAnalysisResponse(BaseModel):
    id: uuid.UUID
    label: str
    num_players: int
    num_cubes: int
    max_rounds: int
    swiss_rounds_per_draft: int
    num_simulations: int
    vote_distribution: dict
    player_profiles: list
    optimizer_config: dict
    avg_desired_pct: float
    avg_neutral_pct: float
    avg_avoid_pct: float
    min_desired_pct: float
    max_desired_pct: float
    min_avoid_pct: float
    max_avoid_pct: float
    simulations: list
    total_time_ms: int
    created_at: str | None = None

    model_config = {"from_attributes": True}
```

- [ ] **Step 3: Add migration table**

In `backend/alembic/versions/3dad6d21c1b8_initial_v2_schema.py`, add:

```python
op.create_table(
    "batch_analyses",
    sa.Column("id", sa.UUID(), primary_key=True),
    sa.Column("label", sa.String(200), server_default=""),
    sa.Column("num_players", sa.Integer(), nullable=False),
    sa.Column("num_cubes", sa.Integer(), nullable=False),
    sa.Column("max_rounds", sa.Integer(), nullable=False),
    sa.Column("swiss_rounds_per_draft", sa.Integer(), server_default="3"),
    sa.Column("num_simulations", sa.Integer(), nullable=False),
    sa.Column("vote_distribution", sa.JSON(), server_default="{}"),
    sa.Column("player_profiles", sa.JSON(), server_default="[]"),
    sa.Column("optimizer_config", sa.JSON(), server_default="{}"),
    sa.Column("avg_desired_pct", sa.Float(), server_default="0"),
    sa.Column("avg_neutral_pct", sa.Float(), server_default="0"),
    sa.Column("avg_avoid_pct", sa.Float(), server_default="0"),
    sa.Column("min_desired_pct", sa.Float(), server_default="0"),
    sa.Column("max_desired_pct", sa.Float(), server_default="0"),
    sa.Column("min_avoid_pct", sa.Float(), server_default="0"),
    sa.Column("max_avoid_pct", sa.Float(), server_default="0"),
    sa.Column("simulations", sa.JSON(), server_default="[]"),
    sa.Column("total_time_ms", sa.Integer(), server_default="0"),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
)
```

- [ ] **Step 4: Commit**

```bash
git add backend/cobs/models/batch_analysis.py backend/cobs/schemas/batch_analysis.py backend/alembic/versions/
git commit -m "feat: add BatchAnalysis model and schemas"
```

---

### Task 3: Batch Analysis API Endpoint

**Files:**
- Create: `backend/cobs/routes/batch_analysis.py`
- Modify: `backend/cobs/app.py`
- Create: `backend/tests/test_batch_analysis.py`

- [ ] **Step 1: Write tests**

Create `backend/tests/test_batch_analysis.py`:

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _admin(client: AsyncClient):
    admin = await client.post("/auth/admin/setup", json={"username": "admin", "password": "pw"})
    return {"Authorization": f"Bearer {admin.json()['access_token']}"}


class TestBatchAnalysis:
    async def test_run_batch(self, client: AsyncClient):
        ah = await _admin(client)
        resp = await client.post("/batch-analysis", json={
            "num_players": 8, "num_cubes": 2, "max_rounds": 1,
            "num_simulations": 3, "swiss_rounds_per_draft": 1,
        }, headers=ah)
        assert resp.status_code == 201
        data = resp.json()
        assert data["num_simulations"] == 3
        assert len(data["simulations"]) == 3
        assert 0 <= data["avg_desired_pct"] <= 100
        assert 0 <= data["avg_avoid_pct"] <= 100

    async def test_with_player_profiles(self, client: AsyncClient):
        ah = await _admin(client)
        resp = await client.post("/batch-analysis", json={
            "num_players": 8, "num_cubes": 4, "max_rounds": 1,
            "num_simulations": 2, "swiss_rounds_per_draft": 1,
            "player_profiles": [{"count": 2, "desired_pct": 0.1, "neutral_pct": 0.0, "avoid_pct": 0.9}],
        }, headers=ah)
        assert resp.status_code == 201

    async def test_list_analyses(self, client: AsyncClient):
        ah = await _admin(client)
        await client.post("/batch-analysis", json={
            "num_players": 8, "num_cubes": 2, "max_rounds": 1,
            "num_simulations": 2, "swiss_rounds_per_draft": 1,
            "label": "Test A",
        }, headers=ah)
        resp = await client.get("/batch-analysis", headers=ah)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_delete_analysis(self, client: AsyncClient):
        ah = await _admin(client)
        created = await client.post("/batch-analysis", json={
            "num_players": 8, "num_cubes": 2, "max_rounds": 1,
            "num_simulations": 1, "swiss_rounds_per_draft": 1,
        }, headers=ah)
        resp = await client.delete(f"/batch-analysis/{created.json()['id']}", headers=ah)
        assert resp.status_code == 204

    async def test_csv_export(self, client: AsyncClient):
        ah = await _admin(client)
        created = await client.post("/batch-analysis", json={
            "num_players": 8, "num_cubes": 2, "max_rounds": 1,
            "num_simulations": 3, "swiss_rounds_per_draft": 1,
        }, headers=ah)
        resp = await client.get(f"/batch-analysis/{created.json()['id']}/csv", headers=ah)
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/csv")
        lines = resp.text.strip().split("\n")
        assert len(lines) == 4  # header + 3 simulations
```

- [ ] **Step 2: Implement endpoint**

Create `backend/cobs/routes/batch_analysis.py`:

```python
import csv
import io
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cobs.auth.dependencies import require_admin
from cobs.database import get_db
from cobs.logic.batch_simulator import TournamentConfig, VoteDistribution, PlayerProfile, simulate_tournament
from cobs.models.batch_analysis import BatchAnalysis
from cobs.models.user import User
from cobs.schemas.batch_analysis import BatchAnalysisRequest, BatchAnalysisResponse

router = APIRouter(prefix="/batch-analysis", tags=["batch-analysis"])


@router.post("", response_model=BatchAnalysisResponse, status_code=201)
async def run_batch_analysis(
    body: BatchAnalysisRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    config = TournamentConfig(
        num_players=body.num_players,
        num_cubes=body.num_cubes,
        max_rounds=body.max_rounds,
        swiss_rounds_per_draft=body.swiss_rounds_per_draft,
        vote_distribution=VoteDistribution(
            desired=body.vote_distribution.desired,
            neutral=body.vote_distribution.neutral,
            avoid=body.vote_distribution.avoid,
        ),
        player_profiles=[
            PlayerProfile(count=p.count, desired_pct=p.desired_pct, neutral_pct=p.neutral_pct, avoid_pct=p.avoid_pct)
            for p in body.player_profiles
        ],
        optimizer_config=body.optimizer_config,
    )

    start = time.monotonic()
    sim_results = []
    desired_pcts = []
    neutral_pcts = []
    avoid_pcts = []

    for i in range(body.num_simulations):
        result = simulate_tournament(config, seed=i * 1000 + 1)
        sim_results.append(result["summary"])
        desired_pcts.append(result["summary"]["desired_pct"])
        neutral_pcts.append(result["summary"]["neutral_pct"])
        avoid_pcts.append(result["summary"]["avoid_pct"])

        # Also store per-draft breakdown
        sim_results[-1]["drafts"] = [
            {"round": d["round"], "desired_pct": d["desired_pct"], "neutral_pct": d["neutral_pct"], "avoid_pct": d["avoid_pct"]}
            for d in result["drafts"]
        ]

    total_time_ms = int((time.monotonic() - start) * 1000)

    analysis = BatchAnalysis(
        label=body.label,
        num_players=body.num_players,
        num_cubes=body.num_cubes,
        max_rounds=body.max_rounds,
        swiss_rounds_per_draft=body.swiss_rounds_per_draft,
        num_simulations=body.num_simulations,
        vote_distribution={"desired": body.vote_distribution.desired, "neutral": body.vote_distribution.neutral, "avoid": body.vote_distribution.avoid},
        player_profiles=[{"count": p.count, "desired_pct": p.desired_pct, "neutral_pct": p.neutral_pct, "avoid_pct": p.avoid_pct} for p in body.player_profiles],
        optimizer_config=body.optimizer_config,
        avg_desired_pct=round(sum(desired_pcts) / len(desired_pcts), 1),
        avg_neutral_pct=round(sum(neutral_pcts) / len(neutral_pcts), 1),
        avg_avoid_pct=round(sum(avoid_pcts) / len(avoid_pcts), 1),
        min_desired_pct=round(min(desired_pcts), 1),
        max_desired_pct=round(max(desired_pcts), 1),
        min_avoid_pct=round(min(avoid_pcts), 1),
        max_avoid_pct=round(max(avoid_pcts), 1),
        simulations=sim_results,
        total_time_ms=total_time_ms,
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    return _to_response(analysis)


@router.get("", response_model=list[BatchAnalysisResponse])
async def list_batch_analyses(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(BatchAnalysis).order_by(BatchAnalysis.created_at.desc()))
    return [_to_response(a) for a in result.scalars().all()]


@router.delete("/{analysis_id}", status_code=204)
async def delete_batch_analysis(
    analysis_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(BatchAnalysis).where(BatchAnalysis.id == analysis_id))
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    await db.delete(analysis)
    await db.commit()


@router.get("/{analysis_id}/csv")
async def export_batch_csv(
    analysis_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(BatchAnalysis).where(BatchAnalysis.id == analysis_id))
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["simulation", "desired_pct", "neutral_pct", "avoid_pct", "total_desired", "total_neutral", "total_avoid"])
    for i, sim in enumerate(analysis.simulations):
        writer.writerow([
            i + 1,
            sim.get("desired_pct", 0),
            sim.get("neutral_pct", 0),
            sim.get("avoid_pct", 0),
            sim.get("total_desired", 0),
            sim.get("total_neutral", 0),
            sim.get("total_avoid", 0),
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="batch-{analysis_id}.csv"'},
    )


def _to_response(a: BatchAnalysis) -> BatchAnalysisResponse:
    return BatchAnalysisResponse(
        id=a.id, label=a.label,
        num_players=a.num_players, num_cubes=a.num_cubes, max_rounds=a.max_rounds,
        swiss_rounds_per_draft=a.swiss_rounds_per_draft, num_simulations=a.num_simulations,
        vote_distribution=a.vote_distribution, player_profiles=a.player_profiles,
        optimizer_config=a.optimizer_config,
        avg_desired_pct=a.avg_desired_pct, avg_neutral_pct=a.avg_neutral_pct, avg_avoid_pct=a.avg_avoid_pct,
        min_desired_pct=a.min_desired_pct, max_desired_pct=a.max_desired_pct,
        min_avoid_pct=a.min_avoid_pct, max_avoid_pct=a.max_avoid_pct,
        simulations=a.simulations, total_time_ms=a.total_time_ms,
        created_at=a.created_at.isoformat() if a.created_at else None,
    )
```

- [ ] **Step 3: Register router in app.py**

Add `batch_analysis` to imports and `app.include_router(batch_analysis.router)`.

- [ ] **Step 4: Run tests**

```bash
cd /Users/christoph/git/COBS/backend && uv run pytest tests/test_batch_analysis.py -v
cd /Users/christoph/git/COBS/backend && uv run pytest tests/ -x -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/cobs/routes/batch_analysis.py backend/cobs/app.py backend/tests/test_batch_analysis.py
git commit -m "feat: add batch analysis API with CSV export"
```

---

### Task 4: Frontend — Batch-Analyse Tab

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/pages/admin/OptimizerPlayground.tsx`

- [ ] **Step 1: Add types**

In `frontend/src/api/types.ts`, add:

```typescript
export interface BatchAnalysis {
  id: string;
  label: string;
  num_players: number;
  num_cubes: number;
  max_rounds: number;
  swiss_rounds_per_draft: number;
  num_simulations: number;
  vote_distribution: { desired: number; neutral: number; avoid: number };
  player_profiles: { count: number; desired_pct: number; neutral_pct: number; avoid_pct: number }[];
  optimizer_config: Record<string, number>;
  avg_desired_pct: number;
  avg_neutral_pct: number;
  avg_avoid_pct: number;
  min_desired_pct: number;
  max_desired_pct: number;
  min_avoid_pct: number;
  max_avoid_pct: number;
  simulations: { desired_pct: number; neutral_pct: number; avoid_pct: number; total_desired: number; total_neutral: number; total_avoid: number; drafts: { round: number; desired_pct: number; neutral_pct: number; avoid_pct: number }[] }[];
  total_time_ms: number;
  created_at: string | null;
}
```

- [ ] **Step 2: Add Batch-Analyse tab to OptimizerPlayground**

Read the file. The page currently has tournament selector, parameter controls, and simulation results. Wrap everything in a `Tabs` component with two tabs:

1. **"Einzelsimulation"** — everything that's there now
2. **"Batch-Analyse"** — new tab

The Batch-Analyse tab needs:

**Config form:**
- num_players, num_cubes, max_rounds, swiss_rounds_per_draft, num_simulations (NumberInputs)
- Vote distribution: desired%, neutral%, avoid% (3 NumberInputs, should sum to ~1.0)
- Player profiles: dynamic list. Each has count, desired_pct, neutral_pct, avoid_pct. "Profil hinzufügen" / remove button.
- Optimizer config: same 8 params as the Einzelsimulation tab (reuse the same component or just duplicate the NumberInputs)
- Label TextInput
- "Analyse starten" button

**Results:**
- Table of saved analyses: Label, Players, Cubes, Rounds, Sims, Ø Desired%, Ø Avoid%, Min/Max, Time, Delete
- Click → detail view showing:
  - Aggregated metrics (big numbers)
  - Per-simulation table: Sim#, Desired%, Neutral%, Avoid%
  - Per-draft breakdown when expanding a simulation row
  - Config accordion
  - CSV export button

**Key state:**
```tsx
// Batch tab state
const [batchLabel, setBatchLabel] = useState("");
const [batchPlayers, setBatchPlayers] = useState(16);
const [batchCubes, setBatchCubes] = useState(4);
const [batchRounds, setBatchRounds] = useState(3);
const [batchSwissRounds, setBatchSwissRounds] = useState(3);
const [batchSimulations, setBatchSimulations] = useState(10);
const [batchVoteDist, setBatchVoteDist] = useState({ desired: 0.4, neutral: 0.3, avoid: 0.3 });
const [batchProfiles, setBatchProfiles] = useState<{ count: number; desired_pct: number; neutral_pct: number; avoid_pct: number }[]>([]);
const [batchOptimizerConfig, setBatchOptimizerConfig] = useState<Record<string, number>>({});
const [batchAnalyses, setBatchAnalyses] = useState<BatchAnalysis[]>([]);
const [selectedBatch, setSelectedBatch] = useState<BatchAnalysis | null>(null);
const [batchRunning, setBatchRunning] = useState(false);
```

The batch optimizer config can default to the same values as the single simulation. Optionally: a "Kopieren von Einzelsimulation" button that copies the current single-sim params.

**CSV export:** Use `downloadPdf`-like pattern but with CSV content type:
```tsx
const exportCsv = (analysisId: string) => {
  const token = localStorage.getItem("token");
  fetch(`/api/batch-analysis/${analysisId}/csv`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((r) => r.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `batch-${analysisId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
};
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/christoph/git/COBS/frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/pages/admin/OptimizerPlayground.tsx
git commit -m "feat: add Batch-Analyse tab to optimizer playground with config, results, and CSV export"
```

---

### Task 5: Verification

- [ ] **Step 1: Run all backend tests**

```bash
cd /Users/christoph/git/COBS/backend && uv run pytest tests/ -v
```

- [ ] **Step 2: Rebuild and test**

```bash
docker compose down -v && docker compose up -d --build
```

1. Go to `/admin/optimizer`
2. Switch to "Batch-Analyse" tab
3. Set: 16 players, 4 cubes, 3 rounds, 10 simulations
4. Add a player profile: 2 extreme avoiders (90% avoid)
5. Click "Analyse starten"
6. See results in table: Ø Desired%, Ø Avoid%, Min/Max
7. Click result → see per-simulation details
8. Click CSV export → download
9. Run another analysis with different optimizer config → compare
