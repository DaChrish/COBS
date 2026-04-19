import io
import re
import zipfile

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _setup(client: AsyncClient):
    admin = await client.post("/auth/admin/setup", json={"username": "admin", "password": "pw"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    resp = await client.post("/test/tournament", json={"num_players": 8, "num_cubes": 2, "seed": 42}, headers=ah)
    tid = resp.json()["tournament_id"]
    draft = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    did = draft.json()["id"]
    pod_id = draft.json()["pods"][0]["id"]
    await client.post(f"/test/tournaments/{tid}/simulate-photos", json={"incomplete": False}, headers=ah)
    await client.post(f"/tournaments/{tid}/drafts/{did}/pods/{pod_id}/pairings", json={"skip_photo_check": True}, headers=ah)
    await client.post(f"/test/tournaments/{tid}/simulate-results", json={"with_conflicts": False}, headers=ah)
    return ah, tid, did


class TestExport:
    async def test_draft_export_zip(self, client: AsyncClient):
        ah, tid, did = await _setup(client)
        resp = await client.get(f"/tournaments/{tid}/drafts/{did}/export", headers=ah)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/zip"
        assert len(resp.content) > 100

    async def test_tournament_export_zip(self, client: AsyncClient):
        ah, tid, did = await _setup(client)
        resp = await client.get(f"/tournaments/{tid}/export", headers=ah)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/zip"
        assert len(resp.content) > 100

    async def test_draft_export_photo_layout(self, client: AsyncClient):
        """Photos must be grouped by cube and filenames use {type}_{W-L-D}_{name}.jpg."""
        ah, tid, did = await _setup(client)
        resp = await client.get(f"/tournaments/{tid}/drafts/{did}/export", headers=ah)
        names = zipfile.ZipFile(io.BytesIO(resp.content)).namelist()

        photo_entries = [n for n in names if n.endswith(".jpg")]
        assert photo_entries, "expected at least one photo in the export"

        # No "Fotos/" folder anymore and no rank-based folder prefix.
        assert not any(n.startswith("Fotos/") for n in names)
        assert not any("Rang" in n for n in names)

        pattern = re.compile(
            r"^[^/]+/(pool|deck|checkout)_\d+-\d+-\d+_[^/]+\.jpg$"
        )
        for entry in photo_entries:
            assert pattern.match(entry), f"unexpected photo path: {entry}"

    async def test_tournament_export_photo_folder_has_draft_suffix(self, client: AsyncClient):
        ah, tid, did = await _setup(client)
        resp = await client.get(f"/tournaments/{tid}/export", headers=ah)
        names = zipfile.ZipFile(io.BytesIO(resp.content)).namelist()
        photo_entries = [n for n in names if n.endswith(".jpg")]
        assert photo_entries
        # Each photo folder ends with " - Draft{N}" so cubes used in multiple drafts
        # do not collide at the top level.
        for entry in photo_entries:
            folder = entry.split("/")[0]
            assert re.search(r" - Draft\d+$", folder), f"missing draft suffix: {folder}"
