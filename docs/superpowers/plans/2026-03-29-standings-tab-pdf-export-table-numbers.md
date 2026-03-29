# Standings Tab, PDF Export & Table Numbers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Standings tab to the admin tournament page with PDF export, add a Pairings PDF export with global table numbers, and show table numbers in the match UI.

**Architecture:** Backend gets two new PDF endpoints using `fpdf2`. The standings endpoint already exists and returns all needed data. Table numbers are computed on-the-fly (not stored) by numbering matches globally across pods. Frontend gets a new StandingsTab component and table numbers in the Runden tab match lines. The Pairings PDF button goes in the Runden tab progress row.

**Tech Stack:** fpdf2 (Python PDF), FastAPI StreamingResponse, Mantine UI (React)

---

## File Structure

### Backend — New Files
- `backend/cobs/logic/pdf.py` — Pure functions to generate standings PDF and pairings PDF bytes

### Backend — Modified Files
- `backend/pyproject.toml` — Add `fpdf2` dependency
- `backend/cobs/routes/standings.py` — Add `GET /tournaments/{id}/standings/pdf` endpoint
- `backend/cobs/routes/matches.py` — Add `GET /tournaments/{id}/drafts/{draft_id}/pairings/pdf` endpoint

### Frontend — Modified Files
- `frontend/src/pages/admin/AdminTournament.tsx` — Add StandingsTab component, add table numbers to match lines, add Pairings PDF button

### Test Files
- `backend/tests/test_pdf.py` — Tests for PDF endpoints

---

### Task 1: Add fpdf2 dependency and PDF generation logic

**Files:**
- Modify: `backend/pyproject.toml`
- Create: `backend/cobs/logic/pdf.py`
- Create: `backend/tests/test_pdf_logic.py`

- [ ] **Step 1: Add fpdf2 to dependencies**

In `backend/pyproject.toml`, add `"fpdf2>=2.8"` to the `dependencies` list:

```toml
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
    "bcrypt<5.0.0",
    "ortools>=9.15.6755",
    "pillow>=12.1.1",
    "fpdf2>=2.8",
]
```

Install it: `cd /Users/christoph/git/COBS/backend && uv pip install --system ".[dev]"`

- [ ] **Step 2: Write failing tests for PDF logic**

Create `backend/tests/test_pdf_logic.py`:

```python
import pytest
from cobs.logic.pdf import generate_standings_pdf, generate_pairings_pdf


class TestStandingsPdf:
    def test_returns_pdf_bytes(self):
        standings = [
            {"rank": 1, "username": "Alice", "match_points": 9, "record": "3-0-0",
             "omw": "66.67%", "gw": "77.78%", "ogw": "55.56%", "dropped": False},
            {"rank": 2, "username": "Bob", "match_points": 6, "record": "2-1-0",
             "omw": "55.56%", "gw": "66.67%", "ogw": "48.15%", "dropped": False},
        ]
        result = generate_standings_pdf("Test Tournament", "Runde 2", standings)
        assert isinstance(result, bytes)
        assert result[:4] == b"%PDF"

    def test_handles_dropped_players(self):
        standings = [
            {"rank": 1, "username": "Alice", "match_points": 9, "record": "3-0-0",
             "omw": "66.67%", "gw": "77.78%", "ogw": "55.56%", "dropped": False},
            {"rank": 2, "username": "Dropped", "match_points": 0, "record": "0-1-0",
             "omw": "33.00%", "gw": "33.00%", "ogw": "33.00%", "dropped": True},
        ]
        result = generate_standings_pdf("Test", "Runde 1", standings)
        assert result[:4] == b"%PDF"

    def test_empty_standings(self):
        result = generate_standings_pdf("Test", "Runde 1", [])
        assert result[:4] == b"%PDF"


class TestPairingsPdf:
    def test_returns_pdf_bytes(self):
        pods = [
            {
                "pod_name": "Pod 1 · Test Cube",
                "matches": [
                    {"table": 1, "player1": "Alice", "player2": "Bob"},
                    {"table": 2, "player1": "Charlie", "player2": "Diana"},
                ],
                "byes": [],
            },
        ]
        result = generate_pairings_pdf("Test Tournament", "Runde 1 — Swiss 2", pods)
        assert isinstance(result, bytes)
        assert result[:4] == b"%PDF"

    def test_handles_byes(self):
        pods = [
            {
                "pod_name": "Pod 1 · Test Cube",
                "matches": [
                    {"table": 1, "player1": "Alice", "player2": "Bob"},
                ],
                "byes": ["Charlie"],
            },
        ]
        result = generate_pairings_pdf("Test", "Runde 1 — Swiss 1", pods)
        assert result[:4] == b"%PDF"
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/christoph/git/COBS/backend && uv run pytest tests/test_pdf_logic.py -v`
Expected: FAIL (import error)

- [ ] **Step 4: Implement PDF generation**

Create `backend/cobs/logic/pdf.py`:

```python
"""PDF generation for standings and pairings."""

from fpdf import FPDF


def generate_standings_pdf(
    tournament_name: str,
    round_label: str,
    standings: list[dict],
) -> bytes:
    """Generate a standings PDF.

    standings: list of dicts with keys:
        rank, username, match_points, record, omw, gw, ogw, dropped
    """
    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    # Title
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, f"COBS — {tournament_name}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 7, f"Standings nach {round_label}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    if not standings:
        pdf.set_font("Helvetica", "I", 10)
        pdf.cell(0, 10, "Keine Spieler.", new_x="LMARGIN", new_y="NEXT")
        return pdf.output()

    # Table header
    col_widths = [12, 55, 18, 22, 20, 20, 20]
    headers = ["#", "Spieler", "Pkt", "W-L-D", "OMW%", "GW%", "OGW%"]

    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(230, 230, 230)
    for w, h in zip(col_widths, headers):
        pdf.cell(w, 7, h, border=1, fill=True)
    pdf.ln()

    # Table rows
    pdf.set_font("Helvetica", "", 9)
    for s in standings:
        if s["dropped"]:
            pdf.set_text_color(150, 150, 150)
        else:
            pdf.set_text_color(0, 0, 0)

        name = s["username"]
        if s["dropped"]:
            name += " (D)"

        vals = [
            str(s["rank"]),
            name,
            str(s["match_points"]),
            s["record"],
            s["omw"],
            s["gw"],
            s["ogw"],
        ]
        for w, v in zip(col_widths, vals):
            pdf.cell(w, 6, v, border=1)
        pdf.ln()

    pdf.set_text_color(0, 0, 0)
    return pdf.output()


def generate_pairings_pdf(
    tournament_name: str,
    round_label: str,
    pods: list[dict],
) -> bytes:
    """Generate a pairings PDF.

    pods: list of dicts with keys:
        pod_name, matches (list of {table, player1, player2}), byes (list of player names)
    """
    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    # Title
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, f"COBS — {tournament_name}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 7, round_label, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    col_widths = [20, 60, 10, 60]

    for pod in pods:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, pod["pod_name"], new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

        # Header
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(230, 230, 230)
        for w, h in zip(col_widths, ["Tisch", "Spieler 1", "vs", "Spieler 2"]):
            pdf.cell(w, 7, h, border=1, fill=True)
        pdf.ln()

        # Matches
        pdf.set_font("Helvetica", "", 9)
        for m in pod["matches"]:
            pdf.cell(col_widths[0], 6, str(m["table"]), border=1)
            pdf.cell(col_widths[1], 6, m["player1"], border=1)
            pdf.cell(col_widths[2], 6, "vs", border=1, align="C")
            pdf.cell(col_widths[3], 6, m["player2"], border=1)
            pdf.ln()

        # Byes
        for bye_name in pod.get("byes", []):
            pdf.set_font("Helvetica", "I", 9)
            pdf.cell(col_widths[0], 6, "BYE", border=1)
            pdf.cell(sum(col_widths[1:]), 6, bye_name, border=1)
            pdf.ln()

        pdf.ln(5)

    return pdf.output()
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/christoph/git/COBS/backend && uv run pytest tests/test_pdf_logic.py -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add backend/pyproject.toml backend/cobs/logic/pdf.py backend/tests/test_pdf_logic.py
git commit -m "feat: add fpdf2 dependency and PDF generation logic for standings and pairings"
```

---

### Task 2: Standings PDF endpoint

**Files:**
- Modify: `backend/cobs/routes/standings.py`
- Modify: `backend/tests/test_pdf.py` (create)

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_pdf.py`:

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _setup_tournament_with_results(client: AsyncClient):
    """Create test tournament, draft, pairings, simulate results."""
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}

    resp = await client.post(
        "/test/tournament",
        json={"num_players": 8, "num_cubes": 2, "seed": 42},
        headers=ah,
    )
    tid = resp.json()["tournament_id"]

    # Draft + pairings + results
    draft = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    draft_id = draft.json()["id"]
    await client.post(
        f"/test/tournaments/{tid}/simulate-photos",
        json={"incomplete": False}, headers=ah,
    )
    await client.post(
        f"/tournaments/{tid}/drafts/{draft_id}/pairings",
        json={}, headers=ah,
    )
    await client.post(
        f"/test/tournaments/{tid}/simulate-results",
        json={"with_conflicts": False}, headers=ah,
    )
    return ah, tid, draft_id


class TestStandingsPdf:
    async def test_returns_pdf(self, client: AsyncClient):
        ah, tid, _ = await _setup_tournament_with_results(client)
        resp = await client.get(f"/tournaments/{tid}/standings/pdf", headers=ah)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content[:4] == b"%PDF"

    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.get("/tournaments/00000000-0000-0000-0000-000000000000/standings/pdf")
        assert resp.status_code == 403 or resp.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/christoph/git/COBS/backend && uv run pytest tests/test_pdf.py::TestStandingsPdf -v`
Expected: FAIL (404)

- [ ] **Step 3: Implement standings PDF endpoint**

In `backend/cobs/routes/standings.py`, add imports:

```python
from fastapi.responses import Response
from cobs.auth.dependencies import require_admin
from cobs.logic.pdf import generate_standings_pdf
```

Add the endpoint after the existing `get_standings` function:

```python
@router.get("/pdf")
async def get_standings_pdf(
    tournament_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Generate standings PDF."""
    # Reuse the existing standings logic
    t_result = await db.execute(
        select(Tournament).where(Tournament.id == tournament_id)
    )
    tournament = t_result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

    # Get latest round number
    draft_result = await db.execute(
        select(Draft).where(Draft.tournament_id == tournament_id).order_by(Draft.round_number.desc())
    )
    latest_draft = draft_result.scalars().first()
    round_label = f"Runde {latest_draft.round_number}" if latest_draft else "Keine Runden"

    # Calculate standings (same as get_standings)
    tp_result = await db.execute(
        select(TournamentPlayer)
        .where(TournamentPlayer.tournament_id == tournament_id)
        .options(selectinload(TournamentPlayer.user))
    )
    tournament_players = tp_result.scalars().all()
    tp_map = {str(tp.id): tp for tp in tournament_players}

    match_result = await db.execute(
        select(Match).join(Pod).join(Draft)
        .where(Draft.tournament_id == tournament_id, Match.reported.is_(True))
    )
    matches = match_result.scalars().all()

    from cobs.logic.swiss import MatchResult
    results = [
        MatchResult(
            player1_id=str(m.player1_id),
            player2_id=str(m.player2_id) if m.player2_id else None,
            player1_wins=m.player1_wins, player2_wins=m.player2_wins, is_bye=m.is_bye,
        )
        for m in matches
    ]
    dropped_ids = {str(tp.id) for tp in tournament_players if tp.dropped}
    player_ids = [str(tp.id) for tp in tournament_players]
    entries = calculate_standings(player_ids, results, dropped_ids)

    standings_data = []
    for i, e in enumerate(entries):
        tp = tp_map[e.player_id]
        standings_data.append({
            "rank": i + 1,
            "username": tp.user.username,
            "match_points": e.match_points,
            "record": f"{e.match_wins}-{e.match_losses}-{e.match_draws}",
            "omw": f"{e.omw_percent * 100:.2f}%",
            "gw": f"{e.gw_percent * 100:.2f}%",
            "ogw": f"{e.ogw_percent * 100:.2f}%",
            "dropped": e.dropped,
        })

    pdf_bytes = generate_standings_pdf(tournament.name, round_label, standings_data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="standings-{tournament.name}.pdf"'},
    )
```

Also add the missing import for `User`:

```python
from cobs.models.user import User
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/christoph/git/COBS/backend && uv run pytest tests/test_pdf.py::TestStandingsPdf -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add backend/cobs/routes/standings.py backend/tests/test_pdf.py
git commit -m "feat: add standings PDF export endpoint"
```

---

### Task 3: Pairings PDF endpoint with global table numbers

**Files:**
- Modify: `backend/cobs/routes/matches.py`
- Modify: `backend/tests/test_pdf.py`

- [ ] **Step 1: Write failing test**

Append to `backend/tests/test_pdf.py`:

```python
class TestPairingsPdf:
    async def test_returns_pdf(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_tournament_with_results(client)
        resp = await client.get(
            f"/tournaments/{tid}/drafts/{draft_id}/pairings/pdf", headers=ah
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content[:4] == b"%PDF"

    async def test_no_pairings_returns_pdf(self, client: AsyncClient):
        """Even with no matches, should return a valid PDF."""
        admin = await client.post(
            "/auth/admin/setup", json={"username": "admin", "password": "pw"}
        )
        ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
        resp = await client.post(
            "/test/tournament",
            json={"num_players": 4, "num_cubes": 2, "seed": 99}, headers=ah,
        )
        tid = resp.json()["tournament_id"]
        draft = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
        draft_id = draft.json()["id"]

        resp = await client.get(
            f"/tournaments/{tid}/drafts/{draft_id}/pairings/pdf", headers=ah
        )
        assert resp.status_code == 200
        assert resp.content[:4] == b"%PDF"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/christoph/git/COBS/backend && uv run pytest tests/test_pdf.py::TestPairingsPdf -v`
Expected: FAIL (404 or 405)

- [ ] **Step 3: Implement pairings PDF endpoint**

In `backend/cobs/routes/matches.py`, add imports:

```python
from fastapi.responses import Response
from cobs.logic.pdf import generate_pairings_pdf
from cobs.models.tournament import Tournament
```

Add the endpoint (after the existing endpoints but before the helper functions):

```python
@router.get("/pairings/pdf")
async def get_pairings_pdf(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Generate pairings PDF with global table numbers."""
    draft = await _get_draft(draft_id, tournament_id, db)

    # Get tournament name
    t_result = await db.execute(select(Tournament).where(Tournament.id == tournament_id))
    tournament = t_result.scalar_one()

    # Load pods with players
    pods_result = await db.execute(
        select(Pod).where(Pod.draft_id == draft_id)
        .options(
            selectinload(Pod.players)
            .selectinload(PodPlayer.tournament_player)
            .selectinload(TournamentPlayer.user),
            selectinload(Pod.tournament_cube).selectinload(TournamentCube.cube),
        )
        .order_by(Pod.pod_number)
    )
    pods = pods_result.scalars().all()

    # Load matches
    match_result = await db.execute(
        select(Match).join(Pod).where(Pod.draft_id == draft_id)
        .options(
            selectinload(Match.player1).selectinload(TournamentPlayer.user),
            selectinload(Match.player2).selectinload(TournamentPlayer.user),
        )
        .order_by(Match.pod_id, Match.swiss_round)
    )
    all_matches = match_result.scalars().all()

    # Determine current swiss round
    current_round = max((m.swiss_round for m in all_matches), default=0)

    # Filter to current swiss round
    current_matches = [m for m in all_matches if m.swiss_round == current_round] if current_round > 0 else []

    # Build pods data with global table numbers
    pods_data = []
    table_number = 1

    for pod in pods:
        pod_matches = [m for m in current_matches if m.pod_id == pod.id and not m.is_bye]
        pod_byes = [m for m in current_matches if m.pod_id == pod.id and m.is_bye]

        cube_name = pod.tournament_cube.cube.name if pod.tournament_cube else "?"
        matches_data = []
        for m in pod_matches:
            matches_data.append({
                "table": table_number,
                "player1": m.player1.user.username,
                "player2": m.player2.user.username if m.player2 else "—",
            })
            table_number += 1

        byes_data = [m.player1.user.username for m in pod_byes]

        pods_data.append({
            "pod_name": f"Pod {pod.pod_number} · {cube_name}",
            "matches": matches_data,
            "byes": byes_data,
        })

    round_label = f"Runde {draft.round_number} — Swiss {current_round}" if current_round > 0 else f"Runde {draft.round_number}"

    pdf_bytes = generate_pairings_pdf(tournament.name, round_label, pods_data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="pairings-runde{draft.round_number}.pdf"'},
    )
```

You will also need to add the import for `TournamentCube`:

```python
from cobs.models.cube import TournamentCube
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/christoph/git/COBS/backend && uv run pytest tests/test_pdf.py -v`
Expected: All PASS

- [ ] **Step 5: Run full test suite**

Run: `cd /Users/christoph/git/COBS/backend && uv run pytest tests/ -x -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add backend/cobs/routes/matches.py backend/tests/test_pdf.py
git commit -m "feat: add pairings PDF export endpoint with global table numbers"
```

---

### Task 4: Frontend — Standings tab

**Files:**
- Modify: `frontend/src/pages/admin/AdminTournament.tsx`

- [ ] **Step 1: Add StandingsTab component**

Add a new component before the `// ─── Timer Tab` section. It loads standings from the API and displays them in a table. It also has a "Standings PDF" button that opens the PDF in a new tab.

```tsx
// ─── Standings Tab ───────────────────────────────────────────────────────────

function StandingsTab({ tournamentId }: { tournamentId: string }) {
  const { data: standings, loading } = useApi<StandingsEntry[]>(
    `/tournaments/${tournamentId}/standings`
  );

  if (loading) return <Center><Loader /></Center>;

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button
          size="xs"
          variant="light"
          leftSection={<IconDownload size={14} />}
          component="a"
          href={`/api/tournaments/${tournamentId}/standings/pdf`}
          target="_blank"
        >
          Standings PDF
        </Button>
      </Group>

      {(!standings || standings.length === 0) ? (
        <Text c="dimmed">Noch keine Standings.</Text>
      ) : (
        <ScrollArea>
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th ta="right">#</Table.Th>
                <Table.Th>Spieler</Table.Th>
                <Table.Th ta="right">Punkte</Table.Th>
                <Table.Th ta="right">W-L-D</Table.Th>
                <Table.Th ta="right">OMW%</Table.Th>
                <Table.Th ta="right">GW%</Table.Th>
                <Table.Th ta="right">OGW%</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {standings.map((s, i) => (
                <Table.Tr key={s.player_id} opacity={s.dropped ? 0.5 : 1}>
                  <Table.Td ta="right">{i + 1}</Table.Td>
                  <Table.Td fw={500}>
                    {s.username}
                    {s.dropped && <Badge color="red" size="xs" ml="xs">Dropped</Badge>}
                  </Table.Td>
                  <Table.Td ta="right" fw={600}>{s.match_points}</Table.Td>
                  <Table.Td ta="right">{s.match_wins}-{s.match_losses}-{s.match_draws}</Table.Td>
                  <Table.Td ta="right">{(s.omw_percent * 100).toFixed(2)}%</Table.Td>
                  <Table.Td ta="right">{(s.gw_percent * 100).toFixed(2)}%</Table.Td>
                  <Table.Td ta="right">{(s.ogw_percent * 100).toFixed(2)}%</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Stack>
  );
}
```

- [ ] **Step 2: Add the StandingsEntry import**

Verify that `StandingsEntry` is already imported in the types import line. It should be — if not, add it:

```tsx
import type { TournamentDetail, Draft, Match, Pod, DraftPhotoStatus, PlayerPhotoStatus, StandingsEntry } from "../../api/types";
```

- [ ] **Step 3: Add IconTrophy to icon imports**

Add to the tabler icons import:

```tsx
import { IconTrophy } from "@tabler/icons-react";
```

- [ ] **Step 4: Add the Standings tab entry and panel**

In the `AdminTournament` component, add the tab entry after the "Runden" tab:

```tsx
<Tabs.Tab value="standings" leftSection={<IconTrophy size={16} />}>
  Standings
</Tabs.Tab>
```

Add the panel after the Runden panel:

```tsx
<Tabs.Panel value="standings">
  <StandingsTab tournamentId={id} />
</Tabs.Panel>
```

- [ ] **Step 5: Verify build**

```bash
cd /Users/christoph/git/COBS/frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/admin/AdminTournament.tsx
git commit -m "feat: add Standings tab with full tiebreaker display and PDF export"
```

---

### Task 5: Frontend — Table numbers in match lines + Pairings PDF button

**Files:**
- Modify: `frontend/src/pages/admin/AdminTournament.tsx`

- [ ] **Step 1: Add global table numbers to match lines**

In the DraftsTab, find the match rendering code inside the Swiss rounds accordion. The matches are rendered per pod. We need to compute a global table offset per pod.

Before the pods rendering (before `{draft.pods.length > 0 && (`), add a table offset calculation:

```tsx
{/* Compute global table offsets per pod */}
{(() => {
  const allDraftMatches = matchesByDraft[draft.id] ?? [];
  const currentSwiss = allDraftMatches.length > 0
    ? Math.max(...allDraftMatches.map((m) => m.swiss_round))
    : 0;
  // Compute cumulative non-bye match count per pod for global table numbering
  let tableOffset = 0;
  const podTableOffsets: Record<string, number> = {};
  for (const pod of draft.pods) {
    podTableOffsets[pod.id] = tableOffset;
    const podNonByes = allDraftMatches.filter(
      (m) => m.pod_id === pod.id && m.swiss_round === currentSwiss && !m.is_bye
    ).length;
    tableOffset += podNonByes;
  }
```

This IIFE pattern won't work cleanly here. Instead, compute the offsets at the draft level and pass them down. The simplest approach: compute `podTableOffsets` inside the `draft.pods.map` by using a running counter.

Actually, the cleanest approach is to compute it before the pods map. Inside the `drafts?.map((draft) => (` block, before `{draft.pods.length > 0 && (`, add:

```tsx
const allDraftMatches = matchesByDraft[draft.id] ?? [];
const currentSwiss = allDraftMatches.length > 0 ? Math.max(...allDraftMatches.map((m) => m.swiss_round)) : 0;
let globalTable = 1;
const podTableStart: Record<string, number> = {};
for (const pod of draft.pods) {
  podTableStart[pod.id] = globalTable;
  globalTable += allDraftMatches.filter((m) => m.pod_id === pod.id && m.swiss_round === currentSwiss && !m.is_bye).length;
}
```

Note: Since the drafts are mapped with `drafts?.map((draft) => (`, the parenthesis after `=>` needs to change to a brace `{` to allow the variable declarations before the return. Change:

```tsx
{drafts?.map((draft) => (
  <Stack key={draft.id} gap="md">
```

To:

```tsx
{drafts?.map((draft) => {
  const allDraftMatches = matchesByDraft[draft.id] ?? [];
  const currentSwiss = allDraftMatches.length > 0 ? Math.max(...allDraftMatches.map((m) => m.swiss_round)) : 0;
  let globalTable = 1;
  const podTableStart: Record<string, number> = {};
  for (const pod of draft.pods) {
    podTableStart[pod.id] = globalTable;
    globalTable += allDraftMatches.filter((m) => m.pod_id === pod.id && m.swiss_round === currentSwiss && !m.is_bye).length;
  }

  return (
    <Stack key={draft.id} gap="md">
```

And change the closing `))}` of the drafts map to `})}`.

Then, in the match line rendering, add a table number. Find the match `<Group>` and add a table number at the start. The table number only applies to non-bye matches in the current swiss round. Inside the `roundMatches.map((m) => (` block, change it to include an index:

```tsx
{roundMatches.map((m, matchIdx) => (
  <Group key={m.id} justify="space-between" px="xs" py={4}
    style={{ borderRadius: 4 }}
    bg={m.has_conflict ? "var(--mantine-color-red-light)" : undefined}>
    {!m.is_bye && round === currentSwiss && (
      <Text size="xs" c="dimmed" w={30} ta="center">
        T{podTableStart[pod.id] + roundMatches.filter((rm, ri) => ri < matchIdx && !rm.is_bye).length}
      </Text>
    )}
    <Text size="sm" fw={500} style={{ flex: 1 }}>{m.player1_username}</Text>
    ...rest unchanged...
  </Group>
))}
```

Wait — that's complex. Simpler: precompute table numbers for the current round's non-bye matches:

Inside the accordion panel, before the match map, add:

```tsx
let podMatchTable = round === currentSwiss ? (podTableStart[pod.id] ?? 1) : 1;
```

Then in each non-bye match row, show and increment:

```tsx
{!m.is_bye && (
  <Text size="xs" c="dimmed" w={24} ta="center" style={{ flexShrink: 0 }}>
    T{round === currentSwiss ? podMatchTable++ : matchIdx + 1}
  </Text>
)}
```

Actually, the `podMatchTable++` in JSX is a side effect and not great. Let me simplify: just compute a map of match_id → table number upfront.

The simplest correct approach: Before the Accordion, compute table numbers:

```tsx
const tableNumbers: Record<string, number> = {};
if (currentSwiss > 0) {
  let tbl = 1;
  for (const p of draft.pods) {
    const currentRoundNonByes = (matchesByDraft[draft.id] ?? [])
      .filter((m) => m.pod_id === p.id && m.swiss_round === currentSwiss && !m.is_bye);
    for (const m of currentRoundNonByes) {
      tableNumbers[m.id] = tbl++;
    }
  }
}
```

Compute this at the draft level (alongside `podTableStart`). Then in match rendering:

```tsx
{tableNumbers[m.id] && (
  <Text size="xs" c="dimmed" w={24} ta="center" style={{ flexShrink: 0 }}>
    T{tableNumbers[m.id]}
  </Text>
)}
```

- [ ] **Step 2: Add Pairings PDF button**

In the progress/action row (the `{(() => {` block that shows "X/Y Matches gemeldet" and "Nächste Swiss-Runde"), add a Pairings PDF button next to the existing buttons when matches exist:

```tsx
{hasMatches && (
  <Button
    size="xs"
    variant="light"
    leftSection={<IconDownload size={14} />}
    component="a"
    href={`/api/tournaments/${tournamentId}/drafts/${draft.id}/pairings/pdf`}
    target="_blank"
  >
    Pairings PDF
  </Button>
)}
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/christoph/git/COBS/frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/AdminTournament.tsx
git commit -m "feat: add global table numbers to match lines and pairings PDF button"
```

---

### Task 6: Verification

- [ ] **Step 1: Run full backend tests**

```bash
cd /Users/christoph/git/COBS/backend && uv run pytest tests/ -v
```

- [ ] **Step 2: Rebuild and test in browser**

```bash
docker compose up -d --build
```

1. Login, create test tournament, generate draft + pairings + results
2. Check "Runden" tab — match lines should show "T1", "T2", etc.
3. Click "Pairings PDF" — should open PDF in new tab with table numbers
4. Check "Standings" tab — full table with tiebreakers
5. Click "Standings PDF" — should open PDF in new tab
