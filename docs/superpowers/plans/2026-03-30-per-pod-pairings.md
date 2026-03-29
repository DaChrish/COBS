# Per-Pod Pairings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change Swiss pairings generation from all-pods-at-once to per-pod, so faster pods can advance independently without waiting for slower ones.

**Architecture:** Add a new per-pod pairings endpoint (`POST /pods/{pod_id}/pairings`) while keeping the old global endpoint for backwards compatibility (it calls the per-pod logic in a loop). Swiss round numbers become per-pod — Pod A can be on Swiss 2 while Pod B is still on Swiss 1. Frontend moves pairings/progress controls into each pod card. Photo check, conflict check, unreported check, timer clear, and max-rounds check all become pod-scoped.

**Tech Stack:** FastAPI, SQLAlchemy (async), Mantine UI (React)

---

## Side Effects Analysis

| Concern | Current (global) | New (per-pod) | Impact |
|---------|-----------------|---------------|--------|
| Swiss round number | `max(swiss_round)` across all pods in draft | `max(swiss_round)` for THIS pod's matches only | Pod A can be Swiss 2, Pod B Swiss 1 |
| Conflict check | Blocks if ANY pod has conflicts | Only blocks for THIS pod | Other pods unaffected |
| Unreported check | Blocks if ANY pod has unreported | Only blocks for THIS pod | Other pods unaffected |
| Photo check (POOL+DECK) | Checks ALL players on first pairings | Checks THIS pod's players on first pairings | Per-pod photo enforcement |
| Timer clear | Clears ALL pod timers | Clears only THIS pod's timer | Other pods keep timer |
| Max 3 swiss rounds | Global check | Per-pod check | Pods can have different round counts |
| WebSocket broadcast | `pairings_ready` with draft_id | `pairings_ready` with draft_id + pod_id | Frontend can react per-pod |
| Simulate results | Fills ALL open matches | Unchanged — still fills all open matches | No impact |
| Pairings PDF | Shows current round for all pods | Shows latest round per pod (may differ) | PDF shows mixed rounds |
| Existing tests | Call global endpoint | Update to call per-pod endpoint | All tests need updating |

## File Structure

### Backend — Modified Files
- `backend/cobs/routes/matches.py` — Add per-pod pairings endpoint, refactor global endpoint to use it
- `backend/tests/test_matches.py` — Update pairings tests for per-pod
- `backend/tests/test_photo_enforcement.py` — Update photo enforcement tests
- `backend/tests/test_full_simulation.py` — Update integration test
- `backend/tests/test_simulate_endpoints.py` — Update helper
- `backend/tests/test_pdf.py` — Update PDF test helper

### Frontend — Modified Files
- `frontend/src/pages/admin/AdminTournament.tsx` — Move pairings controls into pod cards, per-pod progress

---

### Task 1: Add per-pod pairings endpoint

**Files:**
- Modify: `backend/cobs/routes/matches.py`
- Create: `backend/tests/test_per_pod_pairings.py`

- [ ] **Step 1: Write failing tests for per-pod pairings**

Create `backend/tests/test_per_pod_pairings.py`:

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _setup_draft(client: AsyncClient):
    """Create test tournament with draft. Returns (headers, tid, draft, pods)."""
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    resp = await client.post(
        "/test/tournament",
        json={"num_players": 13, "num_cubes": 4, "seed": 42},
        headers=ah,
    )
    tid = resp.json()["tournament_id"]

    # Simulate photos so pairings aren't blocked
    draft_resp = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    draft = draft_resp.json()
    await client.post(
        f"/test/tournaments/{tid}/simulate-photos",
        json={"incomplete": False},
        headers=ah,
    )
    return ah, tid, draft


class TestPerPodPairings:
    async def test_generate_pairings_for_single_pod(self, client: AsyncClient):
        ah, tid, draft = await _setup_draft(client)
        pod = draft["pods"][0]

        resp = await client.post(
            f"/tournaments/{tid}/drafts/{draft['id']}/pods/{pod['id']}/pairings",
            json={},
            headers=ah,
        )
        assert resp.status_code == 201
        matches = resp.json()
        assert len(matches) > 0
        # All matches should be for this pod
        assert all(m["pod_id"] == pod["id"] for m in matches)

    async def test_other_pod_unaffected(self, client: AsyncClient):
        ah, tid, draft = await _setup_draft(client)
        pod1 = draft["pods"][0]
        pod2 = draft["pods"][1]

        # Generate pairings for pod 1 only
        await client.post(
            f"/tournaments/{tid}/drafts/{draft['id']}/pods/{pod1['id']}/pairings",
            json={},
            headers=ah,
        )

        # Pod 2 should have no matches yet
        matches_resp = await client.get(
            f"/tournaments/{tid}/drafts/{draft['id']}/matches",
            headers=ah,
        )
        pod2_matches = [m for m in matches_resp.json() if m["pod_id"] == pod2["id"]]
        assert len(pod2_matches) == 0

    async def test_pods_can_be_on_different_swiss_rounds(self, client: AsyncClient):
        ah, tid, draft = await _setup_draft(client)
        pod1 = draft["pods"][0]
        pod2 = draft["pods"][1]

        # Generate round 1 for both pods
        await client.post(
            f"/tournaments/{tid}/drafts/{draft['id']}/pods/{pod1['id']}/pairings",
            json={},
            headers=ah,
        )
        await client.post(
            f"/tournaments/{tid}/drafts/{draft['id']}/pods/{pod2['id']}/pairings",
            json={},
            headers=ah,
        )

        # Simulate results for all
        await client.post(
            f"/test/tournaments/{tid}/simulate-results",
            json={"with_conflicts": False},
            headers=ah,
        )

        # Generate round 2 for pod 1 only
        resp = await client.post(
            f"/tournaments/{tid}/drafts/{draft['id']}/pods/{pod1['id']}/pairings",
            json={},
            headers=ah,
        )
        assert resp.status_code == 201

        # Pod 1 should have swiss round 2 matches, pod 2 should not
        matches_resp = await client.get(
            f"/tournaments/{tid}/drafts/{draft['id']}/matches",
            headers=ah,
        )
        all_matches = matches_resp.json()
        pod1_rounds = set(m["swiss_round"] for m in all_matches if m["pod_id"] == pod1["id"])
        pod2_rounds = set(m["swiss_round"] for m in all_matches if m["pod_id"] == pod2["id"])
        assert 2 in pod1_rounds
        assert 2 not in pod2_rounds

    async def test_blocks_on_unreported_matches_in_pod(self, client: AsyncClient):
        ah, tid, draft = await _setup_draft(client)
        pod1 = draft["pods"][0]

        # Generate round 1
        await client.post(
            f"/tournaments/{tid}/drafts/{draft['id']}/pods/{pod1['id']}/pairings",
            json={},
            headers=ah,
        )

        # Try round 2 without reporting — should fail
        resp = await client.post(
            f"/tournaments/{tid}/drafts/{draft['id']}/pods/{pod1['id']}/pairings",
            json={},
            headers=ah,
        )
        assert resp.status_code == 400
        assert "unreported" in resp.json()["detail"].lower()

    async def test_only_clears_this_pods_timer(self, client: AsyncClient):
        ah, tid, draft = await _setup_draft(client)
        pod1 = draft["pods"][0]
        pod2 = draft["pods"][1]

        # Set timer on both pods
        await client.post(
            f"/tournaments/{tid}/pods/{pod1['id']}/timer",
            json={"minutes": 50},
            headers=ah,
        )
        await client.post(
            f"/tournaments/{tid}/pods/{pod2['id']}/timer",
            json={"minutes": 50},
            headers=ah,
        )

        # Generate pairings for pod 1 — should clear pod 1 timer only
        await client.post(
            f"/tournaments/{tid}/drafts/{draft['id']}/pods/{pod1['id']}/pairings",
            json={},
            headers=ah,
        )

        # Check pod 2 still has timer
        drafts_resp = await client.get(
            f"/tournaments/{tid}/drafts",
            headers=ah,
        )
        pods = drafts_resp.json()[0]["pods"]
        pod2_data = next(p for p in pods if p["id"] == pod2["id"])
        assert pod2_data["timer_ends_at"] is not None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/christoph/git/COBS/backend && uv run pytest tests/test_per_pod_pairings.py -v`
Expected: FAIL (404)

- [ ] **Step 3: Implement per-pod pairings endpoint**

In `backend/cobs/routes/matches.py`, add the new endpoint AFTER the existing `generate_pairings` function. The route prefix is already `/tournaments/{tournament_id}/drafts/{draft_id}`, so the new path is `/pods/{pod_id}/pairings`.

```python
@router.post("/pods/{pod_id}/pairings", response_model=list[MatchResponse], status_code=201)
async def generate_pod_pairings(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    pod_id: uuid.UUID,
    body: PairingsRequest = PairingsRequest(),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Generate Swiss pairings for the next round in a single pod."""
    draft = await _get_draft(draft_id, tournament_id, db)

    # Load the specific pod
    pod_result = await db.execute(
        select(Pod)
        .where(Pod.id == pod_id, Pod.draft_id == draft_id)
        .options(
            selectinload(Pod.players)
            .selectinload(PodPlayer.tournament_player)
            .selectinload(TournamentPlayer.user),
        )
    )
    pod = pod_result.scalar_one_or_none()
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    # Check for unresolved conflicts in THIS pod
    conflict_result = await db.execute(
        select(Match).where(Match.pod_id == pod_id, Match.has_conflict.is_(True))
    )
    if conflict_result.scalars().first():
        raise HTTPException(status_code=400, detail="Unresolved match conflicts in this pod")

    # Check for unreported non-bye matches in THIS pod
    unreported_result = await db.execute(
        select(Match).where(
            Match.pod_id == pod_id,
            Match.reported.is_(False),
            Match.is_bye.is_(False),
        )
    )
    if unreported_result.scalars().first():
        raise HTTPException(status_code=400, detail="Unreported matches in this pod")

    # Check for POOL+DECK photos (only before first pairings in this pod)
    if not body.skip_photo_check:
        existing_pod_matches = await db.execute(
            select(Match).where(Match.pod_id == pod_id)
        )
        if not existing_pod_matches.scalars().first():
            player_ids = [pp.tournament_player_id for pp in pod.players]
            if player_ids:
                photo_result = await db.execute(
                    select(DraftPhoto).where(
                        DraftPhoto.draft_id == draft_id,
                        DraftPhoto.tournament_player_id.in_(player_ids),
                        DraftPhoto.photo_type.in_([PhotoType.POOL, PhotoType.DECK]),
                    )
                )
                photos = photo_result.scalars().all()
                photo_set = {(p.tournament_player_id, p.photo_type) for p in photos}
                missing = [
                    str(pid) for pid in player_ids
                    if (pid, PhotoType.POOL) not in photo_set or (pid, PhotoType.DECK) not in photo_set
                ]
                if missing:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Missing POOL/DECK photos for {len(missing)} player(s). Use skip_photo_check to override.",
                    )

    # Determine current swiss round for THIS pod
    pod_matches_result = await db.execute(
        select(Match).where(Match.pod_id == pod_id)
    )
    pod_matches = pod_matches_result.scalars().all()
    current_round = max((m.swiss_round for m in pod_matches), default=0) + 1

    if current_round > 3:
        raise HTTPException(status_code=400, detail="Max 3 swiss rounds per pod")

    # Generate pairings for this pod
    players = [
        {"id": str(pp.tournament_player_id), "match_points": pp.tournament_player.match_points}
        for pp in pod.players
    ]

    prev_matches = [
        {"player1_id": str(m.player1_id), "player2_id": str(m.player2_id) if m.player2_id else None}
        for m in pod_matches
    ]

    prev_byes = [str(m.player1_id) for m in pod_matches if m.is_bye]

    result = generate_swiss_pairings(players, prev_matches, prev_byes)

    new_matches: list[Match] = []
    for pairing in result.pairings:
        match = Match(
            pod_id=pod.id,
            swiss_round=current_round,
            player1_id=uuid.UUID(pairing.player1_id),
            player2_id=uuid.UUID(pairing.player2_id) if pairing.player2_id else None,
            is_bye=pairing.is_bye,
            reported=pairing.is_bye,
            player1_wins=2 if pairing.is_bye else 0,
        )
        if pairing.is_bye:
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

    # Clear only THIS pod's timer
    pod.timer_ends_at = None

    await db.commit()
    await manager.broadcast(
        str(tournament_id), "pairings_ready",
        {"draft_id": str(draft_id), "pod_id": str(pod_id)}
    )

    # Return matches for this pod only
    match_result = await db.execute(
        select(Match).where(Match.pod_id == pod_id)
        .options(
            selectinload(Match.player1).selectinload(TournamentPlayer.user),
            selectinload(Match.player2).selectinload(TournamentPlayer.user),
        )
        .order_by(Match.swiss_round)
    )
    matches = match_result.scalars().all()
    return [
        MatchResponse(
            id=m.id, pod_id=m.pod_id, swiss_round=m.swiss_round,
            player1_id=m.player1_id, player1_username=m.player1.user.username,
            player2_id=m.player2_id,
            player2_username=m.player2.user.username if m.player2 else None,
            player1_wins=m.player1_wins, player2_wins=m.player2_wins,
            is_bye=m.is_bye, reported=m.reported, has_conflict=m.has_conflict,
            p1_reported_p1_wins=m.p1_reported_p1_wins, p1_reported_p2_wins=m.p1_reported_p2_wins,
            p2_reported_p1_wins=m.p2_reported_p1_wins, p2_reported_p2_wins=m.p2_reported_p2_wins,
        )
        for m in matches
    ]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/christoph/git/COBS/backend && uv run pytest tests/test_per_pod_pairings.py -v`
Expected: All PASS

- [ ] **Step 5: Run full test suite to verify nothing broke**

Run: `cd /Users/christoph/git/COBS/backend && uv run pytest tests/ -x -v`
Expected: All PASS (the old global endpoint still works)

- [ ] **Step 6: Commit**

```bash
git add backend/cobs/routes/matches.py backend/tests/test_per_pod_pairings.py
git commit -m "feat: add per-pod pairings endpoint with pod-scoped checks"
```

---

### Task 2: Update existing tests to use per-pod endpoint

**Files:**
- Modify: `backend/tests/test_matches.py`
- Modify: `backend/tests/test_simulate_endpoints.py`
- Modify: `backend/tests/test_full_simulation.py`
- Modify: `backend/tests/test_photo_enforcement.py`
- Modify: `backend/tests/test_pdf.py`

The old global endpoint still works, so existing tests won't break. But we should update the helpers and key tests to use the per-pod endpoint to ensure it's well-tested.

- [ ] **Step 1: Update `_setup_tournament_with_matches` in test_simulate_endpoints.py**

The helper generates pairings via the global endpoint. Update it to use per-pod. Read the file first. Change the pairings call from:

```python
await client.post(
    f"/tournaments/{tid}/drafts/{draft_id}/pairings", json={"skip_photo_check": True}, headers=ah
)
```

To:

```python
# Generate pairings per pod
drafts_resp = await client.get(f"/tournaments/{tid}/drafts", headers=ah)
for pod in drafts_resp.json()[0]["pods"]:
    await client.post(
        f"/tournaments/{tid}/drafts/{draft_id}/pods/{pod['id']}/pairings",
        json={"skip_photo_check": True}, headers=ah,
    )
```

- [ ] **Step 2: Update `_setup_tournament_with_results` in test_pdf.py**

Same pattern — read file first, update the pairings call to use per-pod.

- [ ] **Step 3: Update test_full_simulation.py**

Read the file. Update all pairings generation calls to use per-pod. The test creates 13 players (2 pods), so iterate over pods. For each `POST .../pairings` call, replace with a loop over the draft's pods calling `POST .../pods/{pod_id}/pairings`.

- [ ] **Step 4: Run full test suite**

Run: `cd /Users/christoph/git/COBS/backend && uv run pytest tests/ -x -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add backend/tests/
git commit -m "test: update test helpers to use per-pod pairings endpoint"
```

---

### Task 3: Frontend — Move pairings controls into pod cards

**Files:**
- Modify: `frontend/src/pages/admin/AdminTournament.tsx`

- [ ] **Step 1: Update `generatePairings` to accept pod_id**

Change the function signature and API call:

```tsx
const generatePairings = async (draftId: string, podId: string, skipPhotoCheck = false) => {
  setPairingFor(podId);
  setError(null);
  try {
    await apiFetch(
      `/tournaments/${tournamentId}/drafts/${draftId}/pods/${podId}/pairings`,
      {
        method: "POST",
        body: JSON.stringify({ skip_photo_check: skipPhotoCheck }),
      }
    );
    refetch();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg.toLowerCase().includes("photo") && !skipPhotoCheck) {
      setError(msg);
      setForceOverride({ type: "pairings", draftId, podId });
    } else {
      setError(msg);
    }
  } finally {
    setPairingFor(null);
  }
};
```

Update the `forceOverride` state type to include `podId`:

```tsx
const [forceOverride, setForceOverride] = useState<{ type: string; draftId: string | null; podId?: string } | null>(null);
```

Update the override handler in the error alert:

```tsx
if (type === "pairings" && draftId && forceOverride.podId) {
  generatePairings(draftId, forceOverride.podId, true);
}
```

- [ ] **Step 2: Add per-pod progress and pairings button inside pod cards**

Inside each pod card `<Paper>`, after the Swiss Rounds accordion and before the closing `</Paper>`, add a per-pod action row:

```tsx
{/* Per-pod actions */}
{draft.status !== "FINISHED" && (() => {
  const podMatches = matchesByDraft[draft.id]?.filter((m) => m.pod_id === pod.id) ?? [];
  const hasPodMatches = podMatches.length > 0;
  const openPodMatches = podMatches.filter((m) => !m.reported && !m.is_bye);
  const podConflicts = podMatches.filter((m) => m.has_conflict);
  const podAllReported = hasPodMatches && openPodMatches.length === 0 && podConflicts.length === 0;
  const podSwissRound = hasPodMatches ? Math.max(...podMatches.map((m) => m.swiss_round)) : 0;

  return (
    <Group justify="space-between" mt="xs" align="center">
      {hasPodMatches && (
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            {podMatches.filter((m) => m.reported).length}/{podMatches.length} gemeldet
          </Text>
          {podConflicts.length > 0 && <Badge color="red" size="xs">{podConflicts.length} Konflikte</Badge>}
        </Group>
      )}
      <Group gap="xs">
        {!hasPodMatches && (
          <Button size="compact-xs" variant="light"
            loading={pairingFor === pod.id}
            onClick={() => generatePairings(draft.id, pod.id)}>
            Pairings
          </Button>
        )}
        {podAllReported && podSwissRound < 3 && (
          <Button size="compact-xs" variant="light"
            loading={pairingFor === pod.id}
            onClick={() => generatePairings(draft.id, pod.id)}>
            Nächste Runde
          </Button>
        )}
      </Group>
    </Group>
  );
})()}
```

- [ ] **Step 3: Remove global pairings buttons from the progress row**

In the global progress/action row (the `{(() => {` block after the pods), remove the "Pairings generieren" and "Nächste Swiss-Runde" buttons. Keep the PDF buttons, timer, and global match count summary. The global row becomes:

```tsx
{(() => {
  const allMatches = matchesByDraft[draft.id] ?? [];
  const hasMatches = allMatches.length > 0;
  const conflicts = allMatches.filter((m) => m.has_conflict);
  return (
    <Group justify="space-between" align="center">
      {hasMatches && (
        <Group gap="xs">
          <Text size="sm" c="dimmed">
            {allMatches.filter((m) => m.reported).length}/{allMatches.length} Matches gesamt
          </Text>
          {conflicts.length > 0 && <Badge color="red" size="xs">{conflicts.length} Konflikte</Badge>}
        </Group>
      )}
      <Group gap="xs">
        <Button size="xs" variant="light" leftSection={<IconDownload size={14} />}
          onClick={() => downloadPdf(`/tournaments/${tournamentId}/drafts/${draft.id}/pods/pdf`, `pods-runde${draft.round_number}.pdf`)}>
          Pods PDF
        </Button>
        {hasMatches && (
          <Button size="xs" variant="light" leftSection={<IconDownload size={14} />}
            onClick={() => downloadPdf(`/tournaments/${tournamentId}/drafts/${draft.id}/pairings/pdf`, `pairings-runde${draft.round_number}.pdf`)}>
            Pairings PDF
          </Button>
        )}
        {hasMatches && allMatches.some((m) => !m.reported && !m.is_bye) && draft.status !== "FINISHED" && (
          <Group gap={4}>
            <NumberInput w={70} size="xs" variant="filled"
              value={timerMinutes["_bulk"] ?? 50}
              onChange={(v) => setTimerMinutes((prev) => ({ ...prev, _bulk: Number(v) }))}
              min={1} max={999} suffix="m" />
            <Button size="xs" variant="light" color="orange"
              loading={settingTimer === "all"}
              leftSection={<IconClock size={14} />}
              onClick={() => setTimerForAllPods(draft.pods, timerMinutes["_bulk"] ?? 50)}>
              Timer
            </Button>
          </Group>
        )}
      </Group>
    </Group>
  );
})()}
```

- [ ] **Step 4: Verify build**

```bash
cd /Users/christoph/git/COBS/frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/AdminTournament.tsx
git commit -m "feat: move pairings controls into pod cards for per-pod generation"
```

---

### Task 4: Verification

- [ ] **Step 1: Run all backend tests**

```bash
cd /Users/christoph/git/COBS/backend && uv run pytest tests/ -v
```

- [ ] **Step 2: Rebuild and browser test**

```bash
docker compose up -d --build
```

1. Create test tournament with 13 players (2 pods)
2. Generate draft
3. Simulate photos
4. Click "Pairings" on Pod 1 only — Pod 1 gets matches, Pod 2 doesn't
5. Simulate results — only Pod 1 matches fill in
6. Click "Nächste Runde" on Pod 1 — Pod 1 gets Swiss 2, Pod 2 still has no matches
7. Click "Pairings" on Pod 2 — Pod 2 gets Swiss 1
8. Verify timers work per-pod
9. Verify PDF exports still work
