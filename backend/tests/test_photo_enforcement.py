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
            f"/tournaments/{tid}/drafts/{draft_id}/photos/status", headers=ah,
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

    async def test_status_reflects_uploaded_photos(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_draft(client)
        await client.post(
            f"/test/tournaments/{tid}/simulate-photos",
            json={"incomplete": False}, headers=ah,
        )
        resp = await client.get(
            f"/tournaments/{tid}/drafts/{draft_id}/photos/status", headers=ah,
        )
        data = resp.json()
        assert data["pool_deck_ready"] == 4
        assert data["returned_ready"] == 4
        for p in data["players"]:
            assert p["pool"] is not None
            assert p["pool"].startswith("/uploads/")
