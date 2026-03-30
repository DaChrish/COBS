# Cube Management & Tournament Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global cube management page, cube image upload, improve tournament creation with cube selection and max rounds, and add cube add/remove in the tournament Cubes tab.

**Architecture:** Backend already has full CRUD for cubes and `cube_ids` on tournament creation. We add a cube image upload endpoint (reusing the existing Pillow/upload infrastructure), two new endpoints for adding/removing cubes from tournaments, and build three new frontend components: a global Cubes admin page, an improved tournament creation modal, and an interactive Cubes tab.

**Tech Stack:** FastAPI, SQLAlchemy (async), Pillow (image processing), Mantine UI (React), Mantine MultiSelect/Combobox

---

## File Structure

### Backend — New/Modified Files
- `backend/cobs/routes/cubes.py` — Add `POST /cubes/{id}/image` upload endpoint
- `backend/cobs/routes/tournaments.py` — Add `POST /tournaments/{id}/cubes` and `DELETE /tournaments/{id}/cubes/{cube_id}` endpoints
- `backend/cobs/schemas/cube.py` — Add `max_players` to CubeCreate/CubeUpdate/CubeResponse
- `backend/cobs/models/cube.py` — Add `max_players` to Cube model
- `backend/alembic/versions/3dad6d21c1b8_initial_v2_schema.py` — Add `max_players` to cubes table

### Frontend — New/Modified Files
- `frontend/src/pages/admin/AdminCubes.tsx` — New global cube management page
- `frontend/src/pages/admin/AdminOverview.tsx` — Improve tournament creation modal
- `frontend/src/pages/admin/AdminTournament.tsx` — Improve Cubes tab with add/remove
- `frontend/src/App.tsx` — Add route for `/admin/cubes`
- `frontend/src/api/types.ts` — Add Cube type
- `frontend/src/components/Layout.tsx` or admin navigation — Link to cube management

### Test Files
- `backend/tests/test_cube_management.py` — Tests for new endpoints

---

### Task 1: Add max_players to Cube model and image upload endpoint

**Files:**
- Modify: `backend/cobs/models/cube.py`
- Modify: `backend/cobs/schemas/cube.py`
- Modify: `backend/cobs/routes/cubes.py`
- Modify: `backend/alembic/versions/3dad6d21c1b8_initial_v2_schema.py`
- Modify: `backend/tests/test_cubes.py`

- [ ] **Step 1: Add max_players to Cube model**

In `backend/cobs/models/cube.py`, add to the `Cube` class after `image_url`:

```python
max_players: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

- [ ] **Step 2: Add max_players to schemas**

In `backend/cobs/schemas/cube.py`:

```python
class CubeCreate(BaseModel):
    name: str
    description: str = ""
    image_url: str | None = None
    max_players: int | None = None


class CubeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    image_url: str | None = None
    max_players: int | None = None


class CubeResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    image_url: str | None
    max_players: int | None

    model_config = {"from_attributes": True}
```

- [ ] **Step 3: Update create_cube to include max_players**

In `backend/cobs/routes/cubes.py`, update the `create_cube` function:

```python
cube = Cube(name=body.name, description=body.description, image_url=body.image_url, max_players=body.max_players)
```

- [ ] **Step 4: Add cube image upload endpoint**

In `backend/cobs/routes/cubes.py`, add imports and the upload endpoint:

```python
import io
import os

from fastapi import File, UploadFile
from PIL import Image, ImageOps

from cobs.config import settings
```

Add the endpoint after `update_cube`:

```python
@router.post("/{cube_id}/image", response_model=CubeResponse)
async def upload_cube_image(
    cube_id: uuid.UUID,
    file: UploadFile = File(...),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Cube).where(Cube.id == cube_id))
    cube = result.scalar_one_or_none()
    if not cube:
        raise HTTPException(status_code=404, detail="Cube not found")

    content = await file.read()
    if len(content) > settings.max_upload_size:
        raise HTTPException(status_code=400, detail="File too large")

    try:
        img = Image.open(io.BytesIO(content))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    img = ImageOps.exif_transpose(img)
    max_dim = settings.max_image_dimension
    if img.width > max_dim or img.height > max_dim:
        img.thumbnail((max_dim, max_dim), Image.LANCZOS)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    os.makedirs(settings.upload_dir, exist_ok=True)
    filename = f"cube-{cube_id}.jpg"
    filepath = os.path.join(settings.upload_dir, filename)
    img.save(filepath, "JPEG", quality=80)

    cube.image_url = f"/uploads/{filename}"
    await db.commit()
    await db.refresh(cube)
    return cube
```

- [ ] **Step 5: Update Alembic migration**

In the initial migration, find the `cubes` table and add:

```python
sa.Column("max_players", sa.Integer(), nullable=True),
```

- [ ] **Step 6: Run tests**

```bash
cd /Users/christoph/git/COBS/backend && uv run pytest tests/test_cubes.py -v
cd /Users/christoph/git/COBS/backend && uv run pytest tests/ -x -v
```

- [ ] **Step 7: Commit**

```bash
git add backend/cobs/models/cube.py backend/cobs/schemas/cube.py backend/cobs/routes/cubes.py backend/alembic/versions/
git commit -m "feat: add max_players to Cube model and cube image upload endpoint"
```

---

### Task 2: Add/remove cubes from tournament endpoints

**Files:**
- Modify: `backend/cobs/routes/tournaments.py`
- Create: `backend/tests/test_cube_management.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_cube_management.py`:

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _setup(client: AsyncClient):
    admin = await client.post("/auth/admin/setup", json={"username": "admin", "password": "pw"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}

    # Create cubes
    c1 = await client.post("/cubes", json={"name": "Cube A"}, headers=ah)
    c2 = await client.post("/cubes", json={"name": "Cube B"}, headers=ah)

    # Create tournament (no cubes)
    t = await client.post("/tournaments", json={"name": "Test"}, headers=ah)
    return ah, t.json()["id"], c1.json()["id"], c2.json()["id"]


class TestTournamentCubes:
    async def test_add_cube_to_tournament(self, client: AsyncClient):
        ah, tid, cid1, cid2 = await _setup(client)
        resp = await client.post(
            f"/tournaments/{tid}/cubes", json={"cube_id": cid1}, headers=ah
        )
        assert resp.status_code == 201

        # Verify
        detail = await client.get(f"/tournaments/{tid}", headers=ah)
        assert detail.json()["cube_count"] == 1

    async def test_add_duplicate_cube_fails(self, client: AsyncClient):
        ah, tid, cid1, cid2 = await _setup(client)
        await client.post(f"/tournaments/{tid}/cubes", json={"cube_id": cid1}, headers=ah)
        resp = await client.post(f"/tournaments/{tid}/cubes", json={"cube_id": cid1}, headers=ah)
        assert resp.status_code == 409

    async def test_remove_cube_from_tournament(self, client: AsyncClient):
        ah, tid, cid1, cid2 = await _setup(client)
        await client.post(f"/tournaments/{tid}/cubes", json={"cube_id": cid1}, headers=ah)
        resp = await client.delete(f"/tournaments/{tid}/cubes/{cid1}", headers=ah)
        assert resp.status_code == 204

        detail = await client.get(f"/tournaments/{tid}", headers=ah)
        assert detail.json()["cube_count"] == 0

    async def test_add_multiple_cubes(self, client: AsyncClient):
        ah, tid, cid1, cid2 = await _setup(client)
        await client.post(f"/tournaments/{tid}/cubes", json={"cube_id": cid1}, headers=ah)
        await client.post(f"/tournaments/{tid}/cubes", json={"cube_id": cid2}, headers=ah)

        detail = await client.get(f"/tournaments/{tid}", headers=ah)
        assert detail.json()["cube_count"] == 2
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/christoph/git/COBS/backend && uv run pytest tests/test_cube_management.py -v
```

- [ ] **Step 3: Implement endpoints**

In `backend/cobs/routes/tournaments.py`, add a Pydantic model and two endpoints. Add after the existing `drop_player` endpoint:

```python
from pydantic import BaseModel as PydanticBaseModel

class AddCubeRequest(PydanticBaseModel):
    cube_id: uuid.UUID


@router.post("/{tournament_id}/cubes", status_code=201)
async def add_cube_to_tournament(
    tournament_id: uuid.UUID,
    body: AddCubeRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Add a cube to a tournament."""
    result = await db.execute(
        select(Tournament).where(Tournament.id == tournament_id)
    )
    tournament = result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

    # Check cube exists
    cube_result = await db.execute(select(Cube).where(Cube.id == body.cube_id))
    if not cube_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Cube not found")

    # Check not already added
    existing = await db.execute(
        select(TournamentCube).where(
            TournamentCube.tournament_id == tournament_id,
            TournamentCube.cube_id == body.cube_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Cube already in tournament")

    # Get max_players from the cube
    cube = (await db.execute(select(Cube).where(Cube.id == body.cube_id))).scalar_one()
    tc = TournamentCube(
        tournament_id=tournament_id,
        cube_id=body.cube_id,
        max_players=cube.max_players,
    )
    db.add(tc)
    await db.commit()
    return {"ok": True}


@router.delete("/{tournament_id}/cubes/{cube_id}", status_code=204)
async def remove_cube_from_tournament(
    tournament_id: uuid.UUID,
    cube_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Remove a cube from a tournament."""
    result = await db.execute(
        select(TournamentCube).where(
            TournamentCube.tournament_id == tournament_id,
            TournamentCube.cube_id == cube_id,
        )
    )
    tc = result.scalar_one_or_none()
    if not tc:
        raise HTTPException(status_code=404, detail="Cube not in tournament")

    await db.delete(tc)
    await db.commit()
```

Note: `PydanticBaseModel` is used to avoid conflict with SQLAlchemy's `BaseModel` — check if there's already such an import pattern in the file.

- [ ] **Step 4: Run tests**

```bash
cd /Users/christoph/git/COBS/backend && uv run pytest tests/test_cube_management.py -v
cd /Users/christoph/git/COBS/backend && uv run pytest tests/ -x -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/cobs/routes/tournaments.py backend/tests/test_cube_management.py
git commit -m "feat: add endpoints to add/remove cubes from tournaments"
```

---

### Task 3: Frontend — Global Cube Management Page

**Files:**
- Create: `frontend/src/pages/admin/AdminCubes.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/pages/admin/AdminOverview.tsx`

- [ ] **Step 1: Add Cube type to frontend**

In `frontend/src/api/types.ts`, add:

```typescript
export interface Cube {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  max_players: number | null;
}
```

- [ ] **Step 2: Create AdminCubes page**

Create `frontend/src/pages/admin/AdminCubes.tsx`:

```tsx
import { useState } from "react";
import { Container, Title, Table, Button, Group, Modal, TextInput, NumberInput, Stack, Text, Badge, ScrollArea, ActionIcon, Image, FileInput } from "@mantine/core";
import { IconPlus, IconEdit, IconTrash, IconUpload, IconArrowLeft } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../hooks/useApi";
import { apiFetch } from "../../api/client";
import type { Cube } from "../../api/types";

export function AdminCubes() {
  const navigate = useNavigate();
  const { data: cubes, refetch } = useApi<Cube[]>("/cubes");
  const [editCube, setEditCube] = useState<Cube | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [maxPlayers, setMaxPlayers] = useState<number | undefined>();
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName("");
    setDescription("");
    setMaxPlayers(undefined);
  };

  const openEdit = (cube: Cube) => {
    setEditCube(cube);
    setName(cube.name);
    setDescription(cube.description);
    setMaxPlayers(cube.max_players ?? undefined);
  };

  const saveCube = async () => {
    setSaving(true);
    try {
      if (editCube) {
        await apiFetch(`/cubes/${editCube.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name, description, max_players: maxPlayers ?? null }),
        });
        setEditCube(null);
      } else {
        await apiFetch("/cubes", {
          method: "POST",
          body: JSON.stringify({ name, description, max_players: maxPlayers ?? null }),
        });
        setCreateOpen(false);
      }
      resetForm();
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const deleteCube = async (id: string) => {
    await apiFetch(`/cubes/${id}`, { method: "DELETE" });
    refetch();
  };

  const uploadImage = async (cubeId: string, file: File | null) => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("token");
    await fetch(`/api/cubes/${cubeId}/image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    refetch();
  };

  return (
    <Container size="lg">
      <Group justify="space-between" mb="lg">
        <Group gap="sm">
          <ActionIcon variant="subtle" onClick={() => navigate("/admin")}>
            <IconArrowLeft size={20} />
          </ActionIcon>
          <Title order={2}>Cubes</Title>
        </Group>
        <Button leftSection={<IconPlus size={16} />} onClick={() => { resetForm(); setCreateOpen(true); }}>
          Neuer Cube
        </Button>
      </Group>

      <ScrollArea>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Bild</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Beschreibung</Table.Th>
              <Table.Th ta="right">Max Spieler</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {cubes?.map((c) => (
              <Table.Tr key={c.id}>
                <Table.Td w={60}>
                  {c.image_url ? (
                    <Image src={`/api${c.image_url}`} w={40} h={40} radius="sm" fit="cover" />
                  ) : (
                    <FileInput
                      size="xs"
                      variant="unstyled"
                      placeholder="+"
                      accept="image/*"
                      w={40}
                      onChange={(f) => uploadImage(c.id, f)}
                    />
                  )}
                </Table.Td>
                <Table.Td fw={500}>{c.name}</Table.Td>
                <Table.Td c="dimmed" maw={300}>
                  {c.description ? (
                    c.description.startsWith("http") ? (
                      <Text size="sm" component="a" href={c.description} target="_blank" c="blue">Link</Text>
                    ) : (
                      <Text size="sm" lineClamp={1}>{c.description}</Text>
                    )
                  ) : "—"}
                </Table.Td>
                <Table.Td ta="right">
                  {c.max_players ? <Badge size="sm" variant="light">{c.max_players}</Badge> : "—"}
                </Table.Td>
                <Table.Td>
                  <Group gap="xs" justify="flex-end">
                    <ActionIcon variant="subtle" onClick={() => openEdit(c)}>
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" color="red" onClick={() => deleteCube(c.id)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      {/* Create / Edit Modal */}
      <Modal
        opened={createOpen || editCube !== null}
        onClose={() => { setCreateOpen(false); setEditCube(null); resetForm(); }}
        title={editCube ? "Cube bearbeiten" : "Neuer Cube"}
      >
        <Stack>
          <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <TextInput label="Beschreibung / Link" value={description} onChange={(e) => setDescription(e.target.value)} />
          <NumberInput label="Max Spieler (optional)" value={maxPlayers} onChange={(v) => setMaxPlayers(v ? Number(v) : undefined)} min={2} max={20} />
          {editCube && (
            <FileInput label="Bild hochladen" accept="image/*" leftSection={<IconUpload size={14} />}
              onChange={(f) => { if (f && editCube) uploadImage(editCube.id, f); }} />
          )}
          <Button onClick={saveCube} loading={saving}>
            {editCube ? "Speichern" : "Erstellen"}
          </Button>
        </Stack>
      </Modal>
    </Container>
  );
}
```

- [ ] **Step 3: Add route and navigation**

In `frontend/src/App.tsx`, add import and route:

```tsx
import { AdminCubes } from "./pages/admin/AdminCubes";
```

Add inside the `<Route element={<Layout />}>` block, after the AdminTournament route:

```tsx
<Route path="/admin/cubes" element={<AdminGuard><AdminCubes /></AdminGuard>} />
```

In `frontend/src/pages/admin/AdminOverview.tsx`, add a "Cubes verwalten" button in the header Group, before the "Test-Turnier" button:

```tsx
<Button
  variant="subtle"
  leftSection={<IconCube size={16} />}
  onClick={() => navigate("/admin/cubes")}
>
  Cubes
</Button>
```

Add the import: `import { IconCube } from "@tabler/icons-react";` (add to existing imports if IconCube isn't already there, and also add `IconPlus` if needed — check existing imports).

- [ ] **Step 4: Verify build**

```bash
cd /Users/christoph/git/COBS/frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/AdminCubes.tsx frontend/src/App.tsx frontend/src/api/types.ts frontend/src/pages/admin/AdminOverview.tsx
git commit -m "feat: add global cube management page with CRUD and image upload"
```

---

### Task 4: Improve tournament creation modal

**Files:**
- Modify: `frontend/src/pages/admin/AdminOverview.tsx`

- [ ] **Step 1: Enhance the "Neues Turnier" modal**

Read the file first. The current modal has only a name TextInput. Replace it with:

```tsx
<Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Neues Turnier" size="md">
  <Stack>
    <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} />
    <NumberInput label="Max Runden" value={maxRounds} onChange={(v) => setMaxRounds(Number(v))} min={1} max={10} />
    <div>
      <Text size="sm" fw={500} mb={4}>Cubes</Text>
      {selectedCubeIds.length === 0 && <Text size="sm" c="dimmed">Keine Cubes ausgewählt. Du kannst sie später im Turnier hinzufügen.</Text>}
      <Stack gap={4} mb="xs">
        {selectedCubeIds.map((id) => {
          const cube = allCubes?.find((c) => c.id === id);
          return cube ? (
            <Group key={id} justify="space-between" px="xs" py={2} style={{ borderRadius: 4, background: "var(--mantine-color-default-hover)" }}>
              <Text size="sm">{cube.name}</Text>
              <ActionIcon size="xs" variant="subtle" color="red" onClick={() => setSelectedCubeIds((prev) => prev.filter((x) => x !== id))}>
                <IconX size={12} />
              </ActionIcon>
            </Group>
          ) : null;
        })}
      </Stack>
      <Select
        placeholder="Cube hinzufügen..."
        data={allCubes?.filter((c) => !selectedCubeIds.includes(c.id)).map((c) => ({ value: c.id, label: c.name })) ?? []}
        searchable
        value={null}
        onChange={(v) => { if (v) setSelectedCubeIds((prev) => [...prev, v]); }}
      />
    </div>
    <Button onClick={createTournament} loading={loading}>Erstellen</Button>
  </Stack>
</Modal>
```

Add new state variables:

```tsx
const [maxRounds, setMaxRounds] = useState(3);
const [selectedCubeIds, setSelectedCubeIds] = useState<string[]>([]);
const { data: allCubes } = useApi<Cube[]>("/cubes");
```

Update the `createTournament` function to send `max_rounds` and `cube_ids`:

```tsx
const createTournament = async () => {
  setLoading(true);
  try {
    const t = await apiFetch<Tournament>("/tournaments", {
      method: "POST",
      body: JSON.stringify({
        name: name || "Neues Turnier",
        max_rounds: maxRounds,
        cube_ids: selectedCubeIds,
      }),
    });
    setCreateOpen(false);
    setName("");
    setSelectedCubeIds([]);
    setMaxRounds(3);
    navigate(`/admin/tournament/${t.id}`);
  } finally {
    setLoading(false);
  }
};
```

Add necessary imports: `Select, ActionIcon, Text` from Mantine, `IconX` from tabler, `Cube` type, `useApi`.

Note: `useApi` is already imported. `Select` may need to be added to the Mantine imports. `Cube` type needs to be imported from `../../api/types`.

- [ ] **Step 2: Verify build**

```bash
cd /Users/christoph/git/COBS/frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/AdminOverview.tsx
git commit -m "feat: improve tournament creation with cube selection and max rounds"
```

---

### Task 5: Interactive Cubes tab in tournament

**Files:**
- Modify: `frontend/src/pages/admin/AdminTournament.tsx`

- [ ] **Step 1: Rewrite CubesTab with add/remove functionality**

Read the file first. Find the `CubesTab` component. Currently it's a read-only table. Replace it with an interactive version:

```tsx
function CubesTab({ tournament, onRefetch }: { tournament: TournamentDetail; onRefetch: () => void }) {
  const { data: allCubes } = useApi<Cube[]>("/cubes");
  const [adding, setAdding] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newMaxPlayers, setNewMaxPlayers] = useState<number | undefined>();
  const [saving, setSaving] = useState(false);

  const addCube = async (cubeId: string) => {
    setAdding(true);
    try {
      await apiFetch(`/tournaments/${tournament.id}/cubes`, {
        method: "POST",
        body: JSON.stringify({ cube_id: cubeId }),
      });
      onRefetch();
    } finally {
      setAdding(false);
    }
  };

  const removeCube = async (cubeId: string) => {
    await apiFetch(`/tournaments/${tournament.id}/cubes/${cubeId}`, { method: "DELETE" });
    onRefetch();
  };

  const createAndAdd = async () => {
    setSaving(true);
    try {
      const cube = await apiFetch<Cube>("/cubes", {
        method: "POST",
        body: JSON.stringify({ name: newName, description: newDesc, max_players: newMaxPlayers ?? null }),
      });
      await apiFetch(`/tournaments/${tournament.id}/cubes`, {
        method: "POST",
        body: JSON.stringify({ cube_id: cube.id }),
      });
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      setNewMaxPlayers(undefined);
      onRefetch();
    } finally {
      setSaving(false);
    }
  };

  const tournamentCubeIds = tournament.cubes.map((c) => c.cube_id);
  const availableCubes = allCubes?.filter((c) => !tournamentCubeIds.includes(c.id)) ?? [];

  return (
    <Stack gap="md">
      <Group gap="xs">
        <Select
          placeholder="Cube hinzufügen..."
          data={availableCubes.map((c) => ({ value: c.id, label: `${c.name}${c.max_players ? ` (max ${c.max_players})` : ""}` }))}
          searchable
          disabled={adding}
          value={null}
          onChange={(v) => { if (v) addCube(v); }}
          style={{ flex: 1 }}
        />
        <Button variant="light" size="sm" leftSection={<IconPlus size={14} />} onClick={() => setCreateOpen(true)}>
          Neuer Cube
        </Button>
      </Group>

      {tournament.cubes.length === 0 ? (
        <Text c="dimmed">Keine Cubes in diesem Turnier.</Text>
      ) : (
        <ScrollArea>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Beschreibung</Table.Th>
                <Table.Th ta="right">Max. Spieler</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tournament.cubes.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td fw={500}>{c.cube_name}</Table.Td>
                  <Table.Td c="dimmed" maw={400}>
                    {c.cube_description ? (
                      c.cube_description.startsWith("http") ? (
                        <Text size="sm" component="a" href={c.cube_description} target="_blank" c="blue">Link</Text>
                      ) : (
                        <Text size="sm" lineClamp={1}>{c.cube_description}</Text>
                      )
                    ) : "—"}
                  </Table.Td>
                  <Table.Td ta="right">{c.max_players ?? "—"}</Table.Td>
                  <Table.Td>
                    <ActionIcon variant="subtle" color="red" onClick={() => removeCube(c.cube_id)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Neuer Cube">
        <Stack>
          <TextInput label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <TextInput label="Beschreibung / Link" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          <NumberInput label="Max Spieler (optional)" value={newMaxPlayers} onChange={(v) => setNewMaxPlayers(v ? Number(v) : undefined)} min={2} max={20} />
          <Button onClick={createAndAdd} loading={saving}>Erstellen & hinzufügen</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
```

Update the CubesTab invocation to pass `onRefetch`:

```tsx
<Tabs.Panel value="cubes">
  <CubesTab tournament={tournament} onRefetch={refetch} />
</Tabs.Panel>
```

Add necessary imports: `Select, TextInput` to Mantine (if not already), `IconPlus, IconTrash` to tabler icons (check which are already imported), `Cube` to type imports.

- [ ] **Step 2: Verify build**

```bash
cd /Users/christoph/git/COBS/frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/AdminTournament.tsx
git commit -m "feat: interactive Cubes tab with add/remove and inline cube creation"
```

---

### Task 6: Verification

- [ ] **Step 1: Run all backend tests**

```bash
cd /Users/christoph/git/COBS/backend && uv run pytest tests/ -v
```

- [ ] **Step 2: Rebuild and browser test**

```bash
docker compose down -v && docker compose up -d --build
```

(Need `down -v` because we changed the initial migration to add `max_players` to cubes.)

1. Create admin account
2. Go to `/admin/cubes` — create 3 cubes with names, descriptions, max_players
3. Upload an image for one cube
4. Go to `/admin` — click "Neues Turnier"
5. Verify: name, max rounds, searchable cube selector visible
6. Select 2 cubes, set max rounds to 4, create
7. Open tournament — Cubes tab should show the 2 cubes
8. Add a third cube from the search dropdown
9. Click "Neuer Cube" — create inline and verify it's added
10. Remove a cube
11. Change status to VOTING — verify cubes are visible for voting
