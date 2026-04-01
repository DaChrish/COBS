# Optimizer Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin "Optimizer Playground" page where admins can tune optimizer parameters, run simulations against real tournament data, persist results, and compare simulations side-by-side.

**Architecture:** New `Simulation` model stores each simulation run (config + results + metrics). A new `POST /tournaments/{id}/simulate-draft` endpoint runs the optimizer without creating a real draft and saves the result. The frontend gets a new `/admin/optimizer` page with tournament selector, parameter controls with defaults/reset, simulation list with key metrics, and a detail view showing pod assignments with vote colors.

**Tech Stack:** FastAPI, SQLAlchemy (async), Mantine UI (React — Slider, NumberInput, Accordion, Tabs)

---

## File Structure

### Backend — New Files
- `backend/cobs/models/simulation.py` — Simulation model (stores config, results, metrics)
- `backend/cobs/routes/simulate_draft.py` — Simulate endpoint (runs optimizer, persists result)
- `backend/cobs/schemas/simulation.py` — Request/Response schemas
- `backend/tests/test_simulate_draft.py` — Tests

### Backend — Modified Files
- `backend/cobs/app.py` — Register new router
- `backend/alembic/versions/3dad6d21c1b8_initial_v2_schema.py` — Add simulations table

### Frontend — New Files
- `frontend/src/pages/admin/OptimizerPlayground.tsx` — Main playground page

### Frontend — Modified Files
- `frontend/src/App.tsx` — Add route
- `frontend/src/pages/admin/AdminOverview.tsx` — Add navigation button
- `frontend/src/api/types.ts` — Add Simulation types

---

### Task 1: Simulation Model + Schema

**Files:**
- Create: `backend/cobs/models/simulation.py`
- Create: `backend/cobs/schemas/simulation.py`
- Modify: `backend/alembic/versions/3dad6d21c1b8_initial_v2_schema.py`

- [ ] **Step 1: Create Simulation model**

Create `backend/cobs/models/simulation.py`:

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cobs.models.base import Base, TimestampMixin


class Simulation(TimestampMixin, Base):
    """Persisted optimizer simulation run."""

    __tablename__ = "simulations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tournament_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE")
    )
    label: Mapped[str] = mapped_column(String(200), default="")

    # Optimizer config (stored as JSON)
    config: Mapped[dict] = mapped_column(JSON, default=dict)

    # Results (stored as JSON)
    # Format: { pods: [ { cube_id, cube_name, players: [ { id, username, vote, match_points } ] } ] }
    result: Mapped[dict] = mapped_column(JSON, default=dict)

    # Metrics for quick comparison
    total_desired: Mapped[int] = mapped_column(Integer, default=0)
    total_neutral: Mapped[int] = mapped_column(Integer, default=0)
    total_avoid: Mapped[int] = mapped_column(Integer, default=0)
    objective_score: Mapped[float] = mapped_column(Float, default=0.0)
    max_standings_diff: Mapped[int] = mapped_column(Integer, default=0)  # max points spread in any pod
    player_count: Mapped[int] = mapped_column(Integer, default=0)
    pod_count: Mapped[int] = mapped_column(Integer, default=0)
    solver_time_ms: Mapped[int] = mapped_column(Integer, default=0)

    tournament: Mapped["Tournament"] = relationship()
```

- [ ] **Step 2: Create schemas**

Create `backend/cobs/schemas/simulation.py`:

```python
import uuid
from pydantic import BaseModel


class SimulateDraftRequest(BaseModel):
    label: str = ""
    round_number: int = 1
    score_want: float = 5.0
    score_avoid: float = -200.0
    score_neutral: float = 0.0
    match_point_penalty_weight: float = 100000.0
    early_round_bonus: float = 3.0
    lower_standing_bonus: float = 0.3
    repeat_avoid_multiplier: float = 4.0
    avoid_penalty_scaling: float = 1.0


class SimulationPodPlayer(BaseModel):
    id: str
    username: str
    vote: str
    match_points: int


class SimulationPod(BaseModel):
    cube_id: str
    cube_name: str
    players: list[SimulationPodPlayer]
    desired: int
    neutral: int
    avoid: int
    standings_diff: int  # max - min match_points


class SimulationResponse(BaseModel):
    id: uuid.UUID
    tournament_id: uuid.UUID
    label: str
    config: dict
    result: dict
    total_desired: int
    total_neutral: int
    total_avoid: int
    objective_score: float
    max_standings_diff: int
    player_count: int
    pod_count: int
    solver_time_ms: int
    created_at: str | None = None

    model_config = {"from_attributes": True}
```

- [ ] **Step 3: Add simulations table to migration**

In `backend/alembic/versions/3dad6d21c1b8_initial_v2_schema.py`, add the table creation:

```python
op.create_table(
    "simulations",
    sa.Column("id", sa.UUID(), primary_key=True),
    sa.Column("tournament_id", sa.UUID(), sa.ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False),
    sa.Column("label", sa.String(200), server_default=""),
    sa.Column("config", sa.JSON(), server_default="{}"),
    sa.Column("result", sa.JSON(), server_default="{}"),
    sa.Column("total_desired", sa.Integer(), server_default="0"),
    sa.Column("total_neutral", sa.Integer(), server_default="0"),
    sa.Column("total_avoid", sa.Integer(), server_default="0"),
    sa.Column("objective_score", sa.Float(), server_default="0"),
    sa.Column("max_standings_diff", sa.Integer(), server_default="0"),
    sa.Column("player_count", sa.Integer(), server_default="0"),
    sa.Column("pod_count", sa.Integer(), server_default="0"),
    sa.Column("solver_time_ms", sa.Integer(), server_default="0"),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
)
```

- [ ] **Step 4: Commit**

```bash
git add backend/cobs/models/simulation.py backend/cobs/schemas/simulation.py backend/alembic/versions/
git commit -m "feat: add Simulation model and schemas for optimizer playground"
```

---

### Task 2: Simulate Draft Endpoint

**Files:**
- Create: `backend/cobs/routes/simulate_draft.py`
- Modify: `backend/cobs/app.py`
- Create: `backend/tests/test_simulate_draft.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_simulate_draft.py`:

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _setup(client: AsyncClient):
    admin = await client.post("/auth/admin/setup", json={"username": "admin", "password": "pw"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    resp = await client.post("/test/tournament", json={"num_players": 8, "num_cubes": 2, "seed": 42}, headers=ah)
    tid = resp.json()["tournament_id"]
    return ah, tid


class TestSimulateDraft:
    async def test_simulate_returns_result(self, client: AsyncClient):
        ah, tid = await _setup(client)
        resp = await client.post(f"/tournaments/{tid}/simulate-draft", json={}, headers=ah)
        assert resp.status_code == 201
        data = resp.json()
        assert data["player_count"] == 8
        assert data["pod_count"] >= 1
        assert data["total_desired"] + data["total_neutral"] + data["total_avoid"] == 8
        assert "pods" in data["result"]

    async def test_simulate_with_custom_config(self, client: AsyncClient):
        ah, tid = await _setup(client)
        resp = await client.post(f"/tournaments/{tid}/simulate-draft", json={
            "label": "Test config",
            "score_avoid": -500.0,
            "avoid_penalty_scaling": 2.0,
        }, headers=ah)
        assert resp.status_code == 201
        assert resp.json()["config"]["score_avoid"] == -500.0
        assert resp.json()["label"] == "Test config"

    async def test_list_simulations(self, client: AsyncClient):
        ah, tid = await _setup(client)
        await client.post(f"/tournaments/{tid}/simulate-draft", json={"label": "Sim 1"}, headers=ah)
        await client.post(f"/tournaments/{tid}/simulate-draft", json={"label": "Sim 2"}, headers=ah)
        resp = await client.get(f"/tournaments/{tid}/simulations", headers=ah)
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    async def test_delete_simulation(self, client: AsyncClient):
        ah, tid = await _setup(client)
        sim = await client.post(f"/tournaments/{tid}/simulate-draft", json={}, headers=ah)
        sim_id = sim.json()["id"]
        resp = await client.delete(f"/tournaments/{tid}/simulations/{sim_id}", headers=ah)
        assert resp.status_code == 204

    async def test_simulate_deterministic_with_seed(self, client: AsyncClient):
        ah, tid = await _setup(client)
        r1 = await client.post(f"/tournaments/{tid}/simulate-draft", json={}, headers=ah)
        r2 = await client.post(f"/tournaments/{tid}/simulate-draft", json={}, headers=ah)
        # Same tournament with same seed should give same result
        assert r1.json()["result"] == r2.json()["result"]
```

- [ ] **Step 2: Implement simulate endpoint**

Create `backend/cobs/routes/simulate_draft.py`:

```python
import uuid
import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cobs.auth.dependencies import require_admin
from cobs.database import get_db
from cobs.logic.optimizer import CubeInput, OptimizerConfig, PlayerInput, optimize_pods
from cobs.logic.pod_sizes import calculate_pod_sizes
from cobs.models.cube import TournamentCube
from cobs.models.simulation import Simulation
from cobs.models.tournament import Tournament, TournamentPlayer, TournamentStatus
from cobs.models.user import User
from cobs.models.vote import CubeVote
from cobs.schemas.simulation import SimulateDraftRequest, SimulationResponse

router = APIRouter(prefix="/tournaments/{tournament_id}", tags=["optimizer"])


@router.post("/simulate-draft", response_model=SimulationResponse, status_code=201)
async def simulate_draft(
    tournament_id: uuid.UUID,
    body: SimulateDraftRequest = SimulateDraftRequest(),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Run the optimizer without creating a real draft. Persists the result."""
    # Load tournament
    t_result = await db.execute(select(Tournament).where(Tournament.id == tournament_id))
    tournament = t_result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

    # Load players with votes
    tp_result = await db.execute(
        select(TournamentPlayer)
        .where(TournamentPlayer.tournament_id == tournament_id, TournamentPlayer.dropped.is_(False))
        .options(
            selectinload(TournamentPlayer.votes).selectinload(CubeVote.tournament_cube),
            selectinload(TournamentPlayer.user),
        )
    )
    tournament_players = tp_result.scalars().all()
    if len(tournament_players) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 players")

    # Load cubes
    tc_result = await db.execute(
        select(TournamentCube)
        .where(TournamentCube.tournament_id == tournament_id)
        .options(selectinload(TournamentCube.cube))
    )
    tournament_cubes = tc_result.scalars().all()
    if not tournament_cubes:
        raise HTTPException(status_code=400, detail="No cubes in tournament")

    tc_by_cube_id = {str(tc.cube_id): tc for tc in tournament_cubes}

    # Build optimizer inputs
    pod_sizes = calculate_pod_sizes(len(tournament_players))

    optimizer_players = []
    tp_map: dict[str, TournamentPlayer] = {}
    for tp in tournament_players:
        votes_dict: dict[str, str] = {}
        for v in tp.votes:
            votes_dict[str(v.tournament_cube.cube_id)] = v.vote.value
        optimizer_players.append(PlayerInput(
            id=str(tp.id),
            match_points=tp.match_points,
            votes=votes_dict,
        ))
        tp_map[str(tp.id)] = tp

    optimizer_cubes = [
        CubeInput(id=str(tc.cube_id), max_players=tc.max_players)
        for tc in tournament_cubes
    ]

    config = OptimizerConfig(
        score_want=body.score_want,
        score_avoid=body.score_avoid,
        score_neutral=body.score_neutral,
        match_point_penalty_weight=body.match_point_penalty_weight,
        early_round_bonus=body.early_round_bonus,
        lower_standing_bonus=body.lower_standing_bonus,
        repeat_avoid_multiplier=body.repeat_avoid_multiplier,
        avoid_penalty_scaling=body.avoid_penalty_scaling,
    )

    tournament_seed = tournament.seed or 0
    start_time = time.monotonic()
    opt_result = optimize_pods(
        optimizer_players, optimizer_cubes, pod_sizes, body.round_number, config,
        seed=tournament_seed + body.round_number,
    )
    solver_time_ms = int((time.monotonic() - start_time) * 1000)

    # Build result with enriched data
    pods_data = []
    total_desired = 0
    total_neutral = 0
    total_avoid = 0
    max_standings_diff = 0

    for k, (player_ids, cube_id) in enumerate(zip(opt_result.pods, opt_result.cube_ids)):
        tc = tc_by_cube_id.get(cube_id) if cube_id else None
        cube_name = tc.cube.name if tc else "?"

        players_data = []
        points = []
        for pid in player_ids:
            tp = tp_map[pid]
            vote = tp_map[pid].votes
            vote_str = "NEUTRAL"
            for v in tp.votes:
                if cube_id and str(v.tournament_cube.cube_id) == cube_id:
                    vote_str = v.vote.value
                    break

            if vote_str == "DESIRED":
                total_desired += 1
            elif vote_str == "AVOID":
                total_avoid += 1
            else:
                total_neutral += 1

            players_data.append({
                "id": pid,
                "username": tp.user.username,
                "vote": vote_str,
                "match_points": tp.match_points,
            })
            points.append(tp.match_points)

        pod_desired = sum(1 for p in players_data if p["vote"] == "DESIRED")
        pod_neutral = sum(1 for p in players_data if p["vote"] == "NEUTRAL")
        pod_avoid = sum(1 for p in players_data if p["vote"] == "AVOID")
        diff = max(points) - min(points) if points else 0
        max_standings_diff = max(max_standings_diff, diff)

        pods_data.append({
            "cube_id": cube_id,
            "cube_name": cube_name,
            "players": players_data,
            "desired": pod_desired,
            "neutral": pod_neutral,
            "avoid": pod_avoid,
            "standings_diff": diff,
        })

    config_dict = {
        "score_want": body.score_want,
        "score_avoid": body.score_avoid,
        "score_neutral": body.score_neutral,
        "match_point_penalty_weight": body.match_point_penalty_weight,
        "early_round_bonus": body.early_round_bonus,
        "lower_standing_bonus": body.lower_standing_bonus,
        "repeat_avoid_multiplier": body.repeat_avoid_multiplier,
        "avoid_penalty_scaling": body.avoid_penalty_scaling,
    }

    sim = Simulation(
        tournament_id=tournament_id,
        label=body.label,
        config=config_dict,
        result={"pods": pods_data},
        total_desired=total_desired,
        total_neutral=total_neutral,
        total_avoid=total_avoid,
        objective_score=opt_result.objective,
        max_standings_diff=max_standings_diff,
        player_count=len(tournament_players),
        pod_count=len(pod_sizes),
        solver_time_ms=solver_time_ms,
    )
    db.add(sim)
    await db.commit()
    await db.refresh(sim)

    return SimulationResponse(
        id=sim.id,
        tournament_id=sim.tournament_id,
        label=sim.label,
        config=sim.config,
        result=sim.result,
        total_desired=sim.total_desired,
        total_neutral=sim.total_neutral,
        total_avoid=sim.total_avoid,
        objective_score=sim.objective_score,
        max_standings_diff=sim.max_standings_diff,
        player_count=sim.player_count,
        pod_count=sim.pod_count,
        solver_time_ms=sim.solver_time_ms,
        created_at=sim.created_at.isoformat() if sim.created_at else None,
    )


@router.get("/simulations", response_model=list[SimulationResponse])
async def list_simulations(
    tournament_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Simulation)
        .where(Simulation.tournament_id == tournament_id)
        .order_by(Simulation.created_at.desc())
    )
    sims = result.scalars().all()
    return [
        SimulationResponse(
            id=s.id, tournament_id=s.tournament_id, label=s.label,
            config=s.config, result=s.result,
            total_desired=s.total_desired, total_neutral=s.total_neutral, total_avoid=s.total_avoid,
            objective_score=s.objective_score, max_standings_diff=s.max_standings_diff,
            player_count=s.player_count, pod_count=s.pod_count, solver_time_ms=s.solver_time_ms,
            created_at=s.created_at.isoformat() if s.created_at else None,
        )
        for s in sims
    ]


@router.delete("/simulations/{simulation_id}", status_code=204)
async def delete_simulation(
    tournament_id: uuid.UUID,
    simulation_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Simulation).where(Simulation.id == simulation_id, Simulation.tournament_id == tournament_id)
    )
    sim = result.scalar_one_or_none()
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")
    await db.delete(sim)
    await db.commit()
```

- [ ] **Step 3: Register router in app.py**

In `backend/cobs/app.py`, add:
```python
from cobs.routes import ..., simulate_draft
```
And:
```python
app.include_router(simulate_draft.router)
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/christoph/git/COBS/backend && uv run pytest tests/test_simulate_draft.py -v
cd /Users/christoph/git/COBS/backend && uv run pytest tests/ -x -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/cobs/routes/simulate_draft.py backend/cobs/app.py backend/tests/test_simulate_draft.py
git commit -m "feat: add simulate-draft endpoint with persisted results and metrics"
```

---

### Task 3: Frontend Types + Route

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/admin/AdminOverview.tsx`

- [ ] **Step 1: Add Simulation types**

In `frontend/src/api/types.ts`, add:

```typescript
export interface SimulationPodPlayer {
  id: string;
  username: string;
  vote: string;
  match_points: number;
}

export interface SimulationPod {
  cube_id: string;
  cube_name: string;
  players: SimulationPodPlayer[];
  desired: number;
  neutral: number;
  avoid: number;
  standings_diff: number;
}

export interface Simulation {
  id: string;
  tournament_id: string;
  label: string;
  config: Record<string, number>;
  result: { pods: SimulationPod[] };
  total_desired: number;
  total_neutral: number;
  total_avoid: number;
  objective_score: number;
  max_standings_diff: number;
  player_count: number;
  pod_count: number;
  solver_time_ms: number;
  created_at: string | null;
}
```

- [ ] **Step 2: Add route and navigation**

In `frontend/src/App.tsx`, add import and route:
```tsx
import { OptimizerPlayground } from "./pages/admin/OptimizerPlayground";
```
Route:
```tsx
<Route path="/admin/optimizer" element={<AdminGuard><OptimizerPlayground /></AdminGuard>} />
```

In `frontend/src/pages/admin/AdminOverview.tsx`, add a button. Import `IconAdjustments` from tabler. Add before the "Cubes" button:
```tsx
<Button variant="subtle" leftSection={<IconAdjustments size={16} />}
  onClick={() => navigate("/admin/optimizer")}>
  Optimizer
</Button>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/App.tsx frontend/src/pages/admin/AdminOverview.tsx
git commit -m "feat: add Simulation types, route, and navigation for optimizer playground"
```

---

### Task 4: Optimizer Playground Page

**Files:**
- Create: `frontend/src/pages/admin/OptimizerPlayground.tsx`

This is the main UI. It has three sections:
1. **Tournament selector** + "Test-Turnier erstellen" button
2. **Parameter controls** with all 8 params, default values shown, reset button
3. **Simulation list** with metrics, click for detail view

- [ ] **Step 1: Create the page**

Create `frontend/src/pages/admin/OptimizerPlayground.tsx`:

The component should:

**State:**
- `selectedTournament: string | null` — tournament ID
- `label: string` — simulation label
- All 8 optimizer params as individual state (with defaults from OptimizerConfig)
- `simulations: Simulation[]` — loaded from API
- `selectedSim: Simulation | null` — detail view
- `simulating: boolean` — loading state

**Tournament selector:**
- Load tournaments via `useApi<Tournament[]>("/tournaments")`
- `Select` dropdown with tournament names
- "Test-Turnier erstellen" button (same modal as AdminOverview)

**Parameter controls:**
- All parameters with `NumberInput` (not Slider — more precise)
- Each shows: Label, Input, Default value as placeholder/hint
- "Zurücksetzen" button that resets all to defaults
- "Simulieren" button

**Default values (shown next to each input):**
```
score_want: 5.0
score_avoid: -200.0
score_neutral: 0.0
match_point_penalty_weight: 100000.0
early_round_bonus: 3.0
lower_standing_bonus: 0.3
repeat_avoid_multiplier: 4.0
avoid_penalty_scaling: 1.0
```

**Simulation list:**
- Table with columns: Label, Desired, Neutral, Avoid, Objective, Max Diff, Time, Actions
- Click row → show detail
- Delete button per row

**Detail view (selected simulation):**
- Show pods as cards (similar to admin Runden tab)
- Each pod shows: cube name, players with vote color (green/gray/red), D/N/A counts, standings diff
- Close/back button

The full component is large but straightforward. Key Mantine imports: Container, Title, Select, NumberInput, Button, Group, Stack, Table, Card, Badge, Text, Paper, ActionIcon, Modal, Loader, Alert, Accordion, ScrollArea, Divider.

Key tabler imports: IconArrowLeft, IconPlayerPlay, IconTrash, IconRefresh, IconAdjustments, IconPlus.

**Simulate function:**
```tsx
const simulate = async () => {
  if (!selectedTournament) return;
  setSimulating(true);
  try {
    await apiFetch(`/tournaments/${selectedTournament}/simulate-draft`, {
      method: "POST",
      body: JSON.stringify({
        label,
        score_want: scoreWant,
        score_avoid: scoreAvoid,
        score_neutral: scoreNeutral,
        match_point_penalty_weight: matchPointPenalty,
        early_round_bonus: earlyRoundBonus,
        lower_standing_bonus: lowerStandingBonus,
        repeat_avoid_multiplier: repeatAvoidMult,
        avoid_penalty_scaling: avoidPenaltyScaling,
      }),
    });
    loadSimulations();
  } catch (e) {
    setError(e instanceof Error ? e.message : "Error");
  } finally {
    setSimulating(false);
  }
};
```

**Load simulations:**
```tsx
const loadSimulations = async () => {
  if (!selectedTournament) return;
  try {
    const sims = await apiFetch<Simulation[]>(`/tournaments/${selectedTournament}/simulations`);
    setSimulations(sims);
  } catch { /* ignore */ }
};
```

**Pod detail card in selected simulation:**
```tsx
{selectedSim && (
  <Stack gap="md">
    <Group justify="space-between">
      <Title order={4}>{selectedSim.label || "Simulation"}</Title>
      <Button variant="light" size="xs" onClick={() => setSelectedSim(null)}>Zurück</Button>
    </Group>
    <Group gap="md">
      <Badge color="green" variant="light">D: {selectedSim.total_desired}</Badge>
      <Badge color="gray" variant="light">N: {selectedSim.total_neutral}</Badge>
      <Badge color="red" variant="light">A: {selectedSim.total_avoid}</Badge>
      <Text size="sm" c="dimmed">Objective: {selectedSim.objective_score.toFixed(1)}</Text>
      <Text size="sm" c="dimmed">{selectedSim.solver_time_ms}ms</Text>
    </Group>
    <Stack gap="sm">
      {selectedSim.result.pods.map((pod, i) => (
        <Paper key={i} withBorder p="md" radius="md">
          <Group justify="space-between" mb="xs">
            <Text fw={600}>Pod {i + 1} · {pod.cube_name}</Text>
            <Group gap="xs">
              <Badge size="xs" color="green" variant="light">{pod.desired}D</Badge>
              <Badge size="xs" color="gray" variant="light">{pod.neutral}N</Badge>
              <Badge size="xs" color="red" variant="light">{pod.avoid}A</Badge>
              {pod.standings_diff > 0 && <Badge size="xs" color="orange" variant="light">Δ{pod.standings_diff}</Badge>}
            </Group>
          </Group>
          <Group gap={6} wrap="wrap">
            {pod.players.map((p) => (
              <Badge key={p.id} size="sm"
                variant={p.vote === "DESIRED" ? "light" : p.vote === "AVOID" ? "light" : "outline"}
                color={p.vote === "DESIRED" ? "green" : p.vote === "AVOID" ? "red" : "gray"}>
                {p.username}{p.match_points > 0 ? ` (${p.match_points})` : ""}
              </Badge>
            ))}
          </Group>
        </Paper>
      ))}
    </Stack>
  </Stack>
)}
```

**Config display in detail view (shows what params were used):**
```tsx
<Accordion variant="separated">
  <Accordion.Item value="config">
    <Accordion.Control>
      <Text size="sm" fw={500}>Konfiguration</Text>
    </Accordion.Control>
    <Accordion.Panel>
      <Stack gap={2}>
        {Object.entries(selectedSim.config).map(([key, value]) => (
          <Group key={key} justify="space-between">
            <Text size="xs" c="dimmed">{key}</Text>
            <Text size="xs" fw={500}>{value}</Text>
          </Group>
        ))}
      </Stack>
    </Accordion.Panel>
  </Accordion.Item>
</Accordion>
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/christoph/git/COBS/frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/OptimizerPlayground.tsx
git commit -m "feat: add Optimizer Playground page with parameter controls, simulation list, and detail view"
```

---

### Task 5: Verification

- [ ] **Step 1: Run all backend tests**

```bash
cd /Users/christoph/git/COBS/backend && uv run pytest tests/ -v
```

- [ ] **Step 2: Rebuild and test in browser**

```bash
docker compose down -v && docker compose up -d --build
```

1. Create admin, go to `/admin/optimizer`
2. Create test tournament (8 players, 3 cubes)
3. Adjust parameters, click "Simulieren"
4. See result in simulation list
5. Click simulation → see pod details with vote colors
6. Change parameters, simulate again
7. Compare metrics in the list
8. Delete a simulation
