# Photo Admin View & Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins visibility into which players have uploaded photos (with lightbox viewing), show a progress summary per draft, and block Pairings/Draft generation when required photos are missing (with admin override).

**Architecture:** New backend endpoint returns photo status per player per draft. The pairings endpoint checks for POOL+DECK before generating, the draft endpoint checks for RETURNED from the previous draft. Both accept a `skip_photo_check` flag for override. Frontend extends the existing Drafts tab pod cards with photo status icons, a progress badge, a player photo modal, and override UX when blocked.

**Tech Stack:** FastAPI, SQLAlchemy (async), Mantine UI (React), existing `useApi` hook and `apiFetch` client.

---

## File Structure

### Backend — New Files
- `backend/cobs/schemas/photo.py` — Already exists, will add `DraftPhotoStatusResponse` schema

### Backend — Modified Files
- `backend/cobs/routes/photos.py` — Add `GET /tournaments/{id}/drafts/{draft_id}/photos/status` endpoint
- `backend/cobs/routes/matches.py` — Add photo check to `generate_pairings` (POOL+DECK required)
- `backend/cobs/routes/drafts.py` — Add photo check to `create_draft` (RETURNED from previous draft required)

### Frontend — Modified Files
- `frontend/src/api/types.ts` — Add `PhotoStatus` types
- `frontend/src/pages/admin/AdminTournament.tsx` — Extend DraftsTab with photo status icons, progress badge, player photo modal, impersonate button, and override flow

### Test Files
- `backend/tests/test_photo_enforcement.py` — Tests for photo checks on pairings/drafts + status endpoint

---

### Task 1: Photo Status Endpoint

**Files:**
- Modify: `backend/cobs/schemas/photo.py`
- Modify: `backend/cobs/routes/photos.py`
- Create: `backend/tests/test_photo_enforcement.py`

- [ ] **Step 1: Write failing test for photo status endpoint**

Create `backend/tests/test_photo_enforcement.py`:

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _setup_draft(client: AsyncClient):
    """Create test tournament with draft. Returns (headers, tournament_id, draft_id)."""
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}

    resp = await client.post(
        "/test/tournament",
        json={"num_players": 4, "num_cubes": 2, "seed": 42},
        headers=ah,
    )
    tid = resp.json()["tournament_id"]

    draft_resp = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    draft_id = draft_resp.json()["id"]

    return ah, tid, draft_id


class TestPhotoStatus:
    async def test_returns_status_for_all_players(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_draft(client)

        resp = await client.get(
            f"/tournaments/{tid}/drafts/{draft_id}/photos/status",
            headers=ah,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_players"] == 4
        assert data["pool_deck_ready"] == 0
        assert data["returned_ready"] == 0
        assert len(data["players"]) == 4
        for p in data["players"]:
            assert p["pool"] is None
            assert p["deck"] is None
            assert p["returned"] is None
            assert p["username"] is not None
            assert p["tournament_player_id"] is not None
            assert p["user_id"] is not None

    async def test_status_reflects_uploaded_photos(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_draft(client)

        # Simulate all photos
        await client.post(
            f"/test/tournaments/{tid}/simulate-photos",
            json={"incomplete": False},
            headers=ah,
        )

        resp = await client.get(
            f"/tournaments/{tid}/drafts/{draft_id}/photos/status",
            headers=ah,
        )
        data = resp.json()
        assert data["pool_deck_ready"] == 4
        assert data["returned_ready"] == 4
        for p in data["players"]:
            assert p["pool"] is not None
            assert p["deck"] is not None
            assert p["returned"] is not None
            assert p["pool"].startswith("/uploads/")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/christoph/git/COBS/backend && python -m pytest tests/test_photo_enforcement.py::TestPhotoStatus -v`
Expected: FAIL (404)

- [ ] **Step 3: Add PhotoStatusResponse schema**

In `backend/cobs/schemas/photo.py`, add after the existing `PhotoResponse` class:

```python
class PlayerPhotoStatus(BaseModel):
    tournament_player_id: uuid.UUID
    user_id: uuid.UUID
    username: str
    pool: str | None = None
    deck: str | None = None
    returned: str | None = None

    model_config = {"from_attributes": True}


class DraftPhotoStatusResponse(BaseModel):
    total_players: int
    pool_deck_ready: int
    returned_ready: int
    players: list[PlayerPhotoStatus]
```

- [ ] **Step 4: Implement photo status endpoint**

In `backend/cobs/routes/photos.py`, add the import and endpoint:

Add to imports:
```python
import uuid

from sqlalchemy.orm import selectinload

from cobs.auth.dependencies import get_current_user, require_admin
from cobs.models.draft import Draft, Pod, PodPlayer
from cobs.models.tournament import TournamentPlayer
from cobs.schemas.photo import DraftPhotoStatusResponse, PhotoResponse, PlayerPhotoStatus
```

Note: some of these imports already exist — only add the missing ones (`require_admin`, `selectinload`, `Draft`, `Pod`, `PodPlayer`, `TournamentPlayer`, `DraftPhotoStatusResponse`, `PlayerPhotoStatus`).

Add the endpoint:

```python
@router.get(
    "/tournaments/{tournament_id}/drafts/{draft_id}/photos/status",
    response_model=DraftPhotoStatusResponse,
)
async def get_photo_status(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get photo upload status for all players in a draft."""
    # Verify draft exists
    draft_result = await db.execute(
        select(Draft).where(Draft.id == draft_id, Draft.tournament_id == tournament_id)
    )
    if not draft_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Draft not found")

    # Load all pod players for this draft
    pp_result = await db.execute(
        select(PodPlayer)
        .join(Pod)
        .where(Pod.draft_id == draft_id)
        .options(
            selectinload(PodPlayer.tournament_player)
            .selectinload(TournamentPlayer.user),
        )
    )
    pod_players = pp_result.scalars().all()

    # Load all photos for this draft
    photo_result = await db.execute(
        select(DraftPhoto).where(DraftPhoto.draft_id == draft_id)
    )
    photos = photo_result.scalars().all()

    # Index photos by (tournament_player_id, photo_type)
    photo_map: dict[tuple[uuid.UUID, PhotoType], str] = {}
    for photo in photos:
        photo_map[(photo.tournament_player_id, photo.photo_type)] = f"/uploads/{photo.filename}"

    # Build player statuses
    players: list[PlayerPhotoStatus] = []
    pool_deck_ready = 0
    returned_ready = 0

    for pp in pod_players:
        pool_url = photo_map.get((pp.tournament_player_id, PhotoType.POOL))
        deck_url = photo_map.get((pp.tournament_player_id, PhotoType.DECK))
        returned_url = photo_map.get((pp.tournament_player_id, PhotoType.RETURNED))

        if pool_url and deck_url:
            pool_deck_ready += 1
        if returned_url:
            returned_ready += 1

        players.append(PlayerPhotoStatus(
            tournament_player_id=pp.tournament_player_id,
            user_id=pp.tournament_player.user_id,
            username=pp.tournament_player.user.username,
            pool=pool_url,
            deck=deck_url,
            returned=returned_url,
        ))

    return DraftPhotoStatusResponse(
        total_players=len(pod_players),
        pool_deck_ready=pool_deck_ready,
        returned_ready=returned_ready,
        players=players,
    )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/christoph/git/COBS/backend && python -m pytest tests/test_photo_enforcement.py::TestPhotoStatus -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add backend/cobs/schemas/photo.py backend/cobs/routes/photos.py backend/tests/test_photo_enforcement.py
git commit -m "feat: add photo status endpoint for admin draft overview"
```

---

### Task 2: Photo Enforcement on Pairings

**Files:**
- Modify: `backend/cobs/routes/matches.py`
- Modify: `backend/tests/test_photo_enforcement.py`

- [ ] **Step 1: Write failing tests for pairings photo check**

Append to `backend/tests/test_photo_enforcement.py`:

```python
class TestPairingsPhotoEnforcement:
    async def test_pairings_blocked_without_photos(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_draft(client)

        resp = await client.post(
            f"/tournaments/{tid}/drafts/{draft_id}/pairings",
            headers=ah,
        )
        assert resp.status_code == 400
        assert "photo" in resp.json()["detail"].lower()

    async def test_pairings_allowed_with_photos(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_draft(client)

        # Upload all photos
        await client.post(
            f"/test/tournaments/{tid}/simulate-photos",
            json={"incomplete": False},
            headers=ah,
        )

        resp = await client.post(
            f"/tournaments/{tid}/drafts/{draft_id}/pairings",
            headers=ah,
        )
        assert resp.status_code == 201

    async def test_pairings_override_skips_check(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_draft(client)

        resp = await client.post(
            f"/tournaments/{tid}/drafts/{draft_id}/pairings",
            json={"skip_photo_check": True},
            headers=ah,
        )
        assert resp.status_code == 201

    async def test_pairings_only_checks_pool_and_deck(self, client: AsyncClient):
        """RETURNED photos should not block pairings."""
        ah, tid, draft_id = await _setup_draft(client)

        # Simulate all photos, then we verify it works
        # (RETURNED is irrelevant for pairings)
        await client.post(
            f"/test/tournaments/{tid}/simulate-photos",
            json={"incomplete": False},
            headers=ah,
        )

        resp = await client.post(
            f"/tournaments/{tid}/drafts/{draft_id}/pairings",
            headers=ah,
        )
        assert resp.status_code == 201
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/christoph/git/COBS/backend && python -m pytest tests/test_photo_enforcement.py::TestPairingsPhotoEnforcement -v`
Expected: First test FAILS (pairings currently succeeds without photos)

- [ ] **Step 3: Add photo check to generate_pairings**

In `backend/cobs/routes/matches.py`, add imports at the top:

```python
from pydantic import BaseModel as PydanticBaseModel
from cobs.models.photo import DraftPhoto, PhotoType
```

Add a request body model after the existing imports:

```python
class PairingsRequest(PydanticBaseModel):
    skip_photo_check: bool = False
```

Update the `generate_pairings` function signature to accept the optional body:

Change:
```python
@router.post("/pairings", response_model=list[MatchResponse], status_code=201)
async def generate_pairings(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
```

To:
```python
@router.post("/pairings", response_model=list[MatchResponse], status_code=201)
async def generate_pairings(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    body: PairingsRequest = PairingsRequest(),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
```

Add the photo check right after the existing "Check for unreported non-bye matches" block (after line ~54 in the current file) and before the "Determine current swiss round" section:

```python
    # Check for POOL+DECK photos (only on first swiss round)
    if not body.skip_photo_check:
        # Only enforce on first pairings (swiss round 1)
        existing_matches_check = await db.execute(
            select(Match).join(Pod).where(Pod.draft_id == draft_id)
        )
        if not existing_matches_check.scalars().first():
            # This is the first round — check photos
            pp_result = await db.execute(
                select(PodPlayer).join(Pod).where(Pod.draft_id == draft_id)
            )
            player_ids = [pp.tournament_player_id for pp in pp_result.scalars().all()]

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

                missing = []
                for pid in player_ids:
                    if (pid, PhotoType.POOL) not in photo_set:
                        missing.append(str(pid))
                    elif (pid, PhotoType.DECK) not in photo_set:
                        missing.append(str(pid))

                if missing:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Missing POOL/DECK photos for {len(missing)} player(s). Use skip_photo_check to override.",
                    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/christoph/git/COBS/backend && python -m pytest tests/test_photo_enforcement.py::TestPairingsPhotoEnforcement -v`
Expected: All PASS

- [ ] **Step 5: Run full test suite — fix any broken tests**

Run: `cd /Users/christoph/git/COBS/backend && python -m pytest tests/ -x -v`

Many existing tests generate pairings without photos. They need `skip_photo_check: True` or the test setup needs to simulate photos. The simplest fix: update the tests that call pairings to include `json={"skip_photo_check": True}` in their requests. Affected test files:
- `backend/tests/test_simulate_endpoints.py` (in `_setup_tournament_with_matches`)
- `backend/tests/test_full_simulation.py` (first pairings call — photos are simulated before, so this should work; but swiss round 2 pairings should also work since check is only on round 1)
- `backend/tests/test_matches.py`
- `backend/tests/test_drafts.py`

For each: find the `POST .../pairings` call and add `json={"skip_photo_check": True}` to the request.

- [ ] **Step 6: Commit**

```bash
git add backend/cobs/routes/matches.py backend/tests/test_photo_enforcement.py backend/tests/test_simulate_endpoints.py backend/tests/test_full_simulation.py backend/tests/test_matches.py backend/tests/test_drafts.py
git commit -m "feat: enforce POOL+DECK photo check before pairings generation"
```

---

### Task 3: Photo Enforcement on Draft Creation

**Files:**
- Modify: `backend/cobs/routes/drafts.py`
- Modify: `backend/tests/test_photo_enforcement.py`

- [ ] **Step 1: Write failing tests for draft photo check**

Append to `backend/tests/test_photo_enforcement.py`:

```python
async def _complete_draft_round(client: AsyncClient, ah: dict, tid: str, draft_id: str):
    """Generate pairings and simulate results for one swiss round."""
    await client.post(
        f"/tournaments/{tid}/drafts/{draft_id}/pairings",
        json={"skip_photo_check": True},
        headers=ah,
    )
    await client.post(
        f"/test/tournaments/{tid}/simulate-results",
        json={"with_conflicts": False},
        headers=ah,
    )


class TestDraftPhotoEnforcement:
    async def test_second_draft_blocked_without_returned_photos(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_draft(client)

        # Complete the first draft (pairings + results)
        await _complete_draft_round(client, ah, tid, draft_id)

        # Try to create second draft without RETURNED photos
        resp = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
        assert resp.status_code == 400
        assert "returned" in resp.json()["detail"].lower()

    async def test_second_draft_allowed_with_returned_photos(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_draft(client)
        await _complete_draft_round(client, ah, tid, draft_id)

        # Upload photos (includes RETURNED)
        await client.post(
            f"/test/tournaments/{tid}/simulate-photos",
            json={"incomplete": False},
            headers=ah,
        )

        resp = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
        assert resp.status_code == 201

    async def test_second_draft_override_skips_check(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_draft(client)
        await _complete_draft_round(client, ah, tid, draft_id)

        resp = await client.post(
            f"/tournaments/{tid}/drafts",
            json={"skip_photo_check": True},
            headers=ah,
        )
        assert resp.status_code == 201

    async def test_first_draft_not_blocked(self, client: AsyncClient):
        """First draft has no previous round so no RETURNED check."""
        admin = await client.post(
            "/auth/admin/setup", json={"username": "admin", "password": "pw"}
        )
        ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}

        resp = await client.post(
            "/test/tournament",
            json={"num_players": 4, "num_cubes": 2, "seed": 99},
            headers=ah,
        )
        tid = resp.json()["tournament_id"]

        resp = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
        assert resp.status_code == 201
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/christoph/git/COBS/backend && python -m pytest tests/test_photo_enforcement.py::TestDraftPhotoEnforcement -v`
Expected: `test_second_draft_blocked_without_returned_photos` FAILS (draft currently succeeds)

- [ ] **Step 3: Add photo check and skip_photo_check to create_draft**

In `backend/cobs/routes/drafts.py`, add the import:

```python
from cobs.models.photo import DraftPhoto, PhotoType
```

Update the `DraftCreate` schema in `backend/cobs/schemas/draft.py` to add the override flag:

```python
class DraftCreate(BaseModel):
    """Config overrides for the optimizer (all optional)."""
    score_want: float = 5.0
    score_avoid: float = -200.0
    score_neutral: float = 0.0
    match_point_penalty_weight: float = 10000.0
    early_round_bonus: float = 3.0
    lower_standing_bonus: float = 0.3
    repeat_avoid_multiplier: float = 4.0
    skip_photo_check: bool = False
```

In `backend/cobs/routes/drafts.py`, in the `create_draft` function, add the RETURNED photo check right after determining the round number (after `round_number = (last_draft.round_number + 1) if last_draft else 1`) and before the max rounds check:

```python
    # Check RETURNED photos from previous draft
    if last_draft and not body.skip_photo_check:
        pp_result = await db.execute(
            select(PodPlayer).join(Pod).where(Pod.draft_id == last_draft.id)
        )
        player_ids = [pp.tournament_player_id for pp in pp_result.scalars().all()]

        if player_ids:
            returned_result = await db.execute(
                select(DraftPhoto).where(
                    DraftPhoto.draft_id == last_draft.id,
                    DraftPhoto.tournament_player_id.in_(player_ids),
                    DraftPhoto.photo_type == PhotoType.RETURNED,
                )
            )
            returned_photos = {p.tournament_player_id for p in returned_result.scalars().all()}
            missing = [pid for pid in player_ids if pid not in returned_photos]

            if missing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing RETURNED photos for {len(missing)} player(s) from previous draft. Use skip_photo_check to override.",
                )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/christoph/git/COBS/backend && python -m pytest tests/test_photo_enforcement.py::TestDraftPhotoEnforcement -v`
Expected: All PASS

- [ ] **Step 5: Run full test suite — fix broken tests**

Run: `cd /Users/christoph/git/COBS/backend && python -m pytest tests/ -x -v`

Tests that create a second draft without RETURNED photos will fail. Fix by adding `json={"skip_photo_check": True}` to those draft creation calls, or by simulating photos first. Affected:
- `backend/tests/test_full_simulation.py` — the second draft call may need photos simulated before it (check if photos were already simulated in the flow)

- [ ] **Step 6: Commit**

```bash
git add backend/cobs/routes/drafts.py backend/cobs/schemas/draft.py backend/tests/test_photo_enforcement.py backend/tests/test_full_simulation.py
git commit -m "feat: enforce RETURNED photo check before new draft creation"
```

---

### Task 4: Frontend Photo Types and Status Hook

**Files:**
- Modify: `frontend/src/api/types.ts`

- [ ] **Step 1: Add photo status types**

In `frontend/src/api/types.ts`, add at the end:

```typescript
export interface PlayerPhotoStatus {
  tournament_player_id: string;
  user_id: string;
  username: string;
  pool: string | null;
  deck: string | null;
  returned: string | null;
}

export interface DraftPhotoStatus {
  total_players: number;
  pool_deck_ready: number;
  returned_ready: number;
  players: PlayerPhotoStatus[];
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/types.ts
git commit -m "feat: add photo status types to frontend"
```

---

### Task 5: Frontend — Photo Status in Pod Cards + Progress Badge + Player Modal

**Files:**
- Modify: `frontend/src/pages/admin/AdminTournament.tsx`

This is the largest frontend task. It adds:
1. Photo status data loading per draft
2. Progress badge next to draft title
3. Photo status icons on player badges in pod cards
4. Player photo modal (click player → see all 3 photos)
5. Impersonate button in modal for players with missing photos
6. Override flow when pairings/draft blocked by missing photos

- [ ] **Step 1: Add imports and photo status state to DraftsTab**

In `AdminTournament.tsx`, add to the Mantine imports:

```tsx
import { Image as MantineImage } from "@mantine/core";
```

Add to tabler icon imports:

```tsx
import { IconCamera, IconCameraOff } from "@tabler/icons-react";
```

Add the type import at the top of the file (alongside the existing type imports):

```tsx
import type { TournamentDetail, Draft, Match, Pod, DraftPhotoStatus, PlayerPhotoStatus } from "../../api/types";
```

- [ ] **Step 2: Update DraftsTab to accept tournament and load photo status**

Change the DraftsTab signature:

```tsx
function DraftsTab({ tournamentId, isTest, tournament }: { tournamentId: string; isTest: boolean; tournament: TournamentDetail }) {
```

Update the invocation (around line 893):

```tsx
<DraftsTab tournamentId={id} isTest={tournament.is_test} tournament={tournament} />
```

Inside DraftsTab, after the existing state declarations, add:

```tsx
const [photoStatus, setPhotoStatus] = useState<Record<string, DraftPhotoStatus>>({});
const [selectedPlayer, setSelectedPlayer] = useState<{ player: PlayerPhotoStatus; draftId: string } | null>(null);

// Load photo status for each draft
useEffect(() => {
  if (!drafts) return;
  drafts.forEach(async (draft) => {
    try {
      const status = await apiFetch<DraftPhotoStatus>(
        `/tournaments/${tournamentId}/drafts/${draft.id}/photos/status`
      );
      setPhotoStatus((prev) => ({ ...prev, [draft.id]: status }));
    } catch {
      // Admin-only endpoint, ignore errors for non-admins
    }
  });
}, [drafts, tournamentId]);
```

You'll need to add `useEffect` to the React imports at the top of the file (it's not currently imported).

- [ ] **Step 3: Add photo progress badge next to draft title**

Inside the draft map, after the `<Badge>` for draft status and before the closing `</Group>`, add:

```tsx
{photoStatus[draft.id] && (
  <Badge
    size="sm"
    variant="light"
    color={
      photoStatus[draft.id].pool_deck_ready === photoStatus[draft.id].total_players
        ? "green"
        : "yellow"
    }
    leftSection={<IconCamera size={12} />}
  >
    {photoStatus[draft.id].pool_deck_ready}/{photoStatus[draft.id].total_players} bereit
  </Badge>
)}
```

- [ ] **Step 4: Add photo status icons to player badges in pod cards**

Replace the existing player badge rendering inside the pod cards. Find the `<Group gap={6} wrap="wrap">` block that maps over pod players.

Change each player badge to include photo status icons. Replace the full player map block with:

```tsx
<Group gap={6} wrap="wrap">
  {pod.players
    .sort((a, b) => a.seat_number - b.seat_number)
    .map((p) => {
      const voteColor =
        p.vote === "DESIRED"
          ? "green"
          : p.vote === "AVOID"
            ? "red"
            : "gray";
      const ps = photoStatus[draft.id]?.players.find(
        (s) => s.tournament_player_id === p.tournament_player_id
      );
      const hasPoolDeck = ps?.pool && ps?.deck;
      return (
        <Badge
          key={p.tournament_player_id}
          size="sm"
          variant={p.vote === "DESIRED" ? "light" : p.vote === "AVOID" ? "light" : "outline"}
          color={voteColor}
          style={{ cursor: ps ? "pointer" : undefined }}
          onClick={() => ps && setSelectedPlayer({ player: ps, draftId: draft.id })}
          leftSection={
            <Group gap={2} wrap="nowrap">
              <Text span size="xs" c="dimmed" fw={600}>
                {p.seat_number}
              </Text>
              {ps && (
                hasPoolDeck
                  ? <IconCamera size={10} color="var(--mantine-color-green-6)" />
                  : <IconCameraOff size={10} color="var(--mantine-color-red-6)" />
              )}
            </Group>
          }
        >
          {p.username}
        </Badge>
      );
    })}
</Group>
```

- [ ] **Step 5: Add player photo modal**

Add at the end of the DraftsTab return block, right before the closing `</Stack>` of the component:

```tsx
<Modal
  opened={selectedPlayer !== null}
  onClose={() => setSelectedPlayer(null)}
  title={selectedPlayer?.player.username ?? ""}
  size="lg"
>
  {selectedPlayer && (
    <Stack gap="md">
      <SimpleGrid cols={3} spacing="md">
        <Stack gap={4} align="center">
          <Text size="xs" fw={600} c="dimmed">POOL</Text>
          {selectedPlayer.player.pool ? (
            <MantineImage
              src={`/api${selectedPlayer.player.pool}`}
              radius="md"
              fit="contain"
              h={200}
            />
          ) : (
            <Paper withBorder p="xl" radius="md" style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", height: 200 }}>
              <Text c="red" size="sm">Fehlt</Text>
            </Paper>
          )}
        </Stack>
        <Stack gap={4} align="center">
          <Text size="xs" fw={600} c="dimmed">DECK</Text>
          {selectedPlayer.player.deck ? (
            <MantineImage
              src={`/api${selectedPlayer.player.deck}`}
              radius="md"
              fit="contain"
              h={200}
            />
          ) : (
            <Paper withBorder p="xl" radius="md" style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", height: 200 }}>
              <Text c="red" size="sm">Fehlt</Text>
            </Paper>
          )}
        </Stack>
        <Stack gap={4} align="center">
          <Text size="xs" fw={600} c="dimmed">RETURNED</Text>
          {selectedPlayer.player.returned ? (
            <MantineImage
              src={`/api${selectedPlayer.player.returned}`}
              radius="md"
              fit="contain"
              h={200}
            />
          ) : (
            <Paper withBorder p="xl" radius="md" style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", height: 200 }}>
              <Text c="red" size="sm">Fehlt</Text>
            </Paper>
          )}
        </Stack>
      </SimpleGrid>
      {(!selectedPlayer.player.pool || !selectedPlayer.player.deck || !selectedPlayer.player.returned) && (
        <Button
          size="xs"
          variant="light"
          color="blue"
          onClick={() => {
            // Impersonate this player
            const impersonate = async () => {
              try {
                const token = localStorage.getItem("token");
                const res = await apiFetch<{ access_token: string }>("/auth/impersonate", {
                  method: "POST",
                  body: JSON.stringify({ user_id: selectedPlayer.player.user_id }),
                });
                if (token) localStorage.setItem("admin_token", token);
                localStorage.setItem("token", res.access_token);
                window.location.reload();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Error");
              }
            };
            impersonate();
          }}
        >
          Als {selectedPlayer.player.username} anmelden
        </Button>
      )}
    </Stack>
  )}
</Modal>
```

- [ ] **Step 6: Add override flow for pairings and draft buttons**

Update the `generatePairings` function to accept an optional `skipPhotoCheck` parameter:

```tsx
const generatePairings = async (draftId: string, skipPhotoCheck = false) => {
  setPairingFor(draftId);
  setError(null);
  try {
    await apiFetch(
      `/tournaments/${tournamentId}/drafts/${draftId}/pairings`,
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
      setForceOverride({ type: "pairings", draftId });
    } else {
      setError(msg);
    }
  } finally {
    setPairingFor(null);
  }
};
```

Update the `generateDraft` function similarly:

```tsx
const generateDraft = async (skipPhotoCheck = false) => {
  setGenerating(true);
  setError(null);
  try {
    await apiFetch(`/tournaments/${tournamentId}/drafts`, {
      method: "POST",
      body: JSON.stringify({ skip_photo_check: skipPhotoCheck }),
    });
    refetch();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg.toLowerCase().includes("photo") && !skipPhotoCheck) {
      setError(msg);
      setForceOverride({ type: "draft", draftId: null });
    } else {
      setError(msg);
    }
  } finally {
    setGenerating(false);
  }
};
```

Add state for the override:

```tsx
const [forceOverride, setForceOverride] = useState<{ type: string; draftId: string | null } | null>(null);
```

In the error alert section, add an override button when forceOverride is set:

Replace the error alert block:

```tsx
{error && (
  <Alert color="red" icon={<IconAlertTriangle size={16} />}>
    {error}
    {forceOverride && (
      <Button
        size="xs"
        variant="light"
        color="red"
        mt="xs"
        onClick={() => {
          const { type, draftId } = forceOverride;
          setForceOverride(null);
          setError(null);
          if (type === "pairings" && draftId) {
            generatePairings(draftId, true);
          } else if (type === "draft") {
            generateDraft(true);
          }
        }}
      >
        Trotzdem fortfahren
      </Button>
    )}
  </Alert>
)}
```

Update the Pairings button to pass the draft id:

```tsx
onClick={() => generatePairings(draft.id)}
```

(This should already be the case.)

- [ ] **Step 7: Verify build compiles**

Run: `cd /Users/christoph/git/COBS/frontend && npx vite build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/admin/AdminTournament.tsx
git commit -m "feat: add photo status display, player modal, and override flow to Drafts tab"
```

---

### Task 6: Run All Tests and Verify

**Files:** No new files — verification only.

- [ ] **Step 1: Run full backend test suite**

Run: `cd /Users/christoph/git/COBS/backend && python -m pytest tests/ -v`
Expected: All PASS

- [ ] **Step 2: Verify frontend builds**

Run: `cd /Users/christoph/git/COBS/frontend && npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Verify end-to-end in browser**

1. `docker compose down -v && docker compose up -d --build`
2. Create admin, create test tournament
3. Generate draft → see photo status icons (all red camera-off)
4. Click "Fotos simulieren" → icons turn green
5. Click a player badge → photo modal opens with 3 images
6. Click "Pairings generieren" → succeeds
7. Simulate results, generate next draft round without RETURNED → should be blocked
8. Click "Trotzdem fortfahren" → override works
