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
            assert p["pool"] == []
            assert p["deck"] == []
            assert p["returned"] == []

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
            assert len(p["pool"]) >= 1
            assert p["pool"][0]["url"].startswith("/uploads/")


class TestPairingsPhotoEnforcement:
    async def test_pairings_blocked_without_photos(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_draft(client)
        drafts = await client.get(f"/tournaments/{tid}/drafts", headers=ah)
        pod_id = drafts.json()[0]["pods"][0]["id"]
        resp = await client.post(
            f"/tournaments/{tid}/drafts/{draft_id}/pods/{pod_id}/pairings", headers=ah,
        )
        assert resp.status_code == 400
        assert "photo" in resp.json()["detail"].lower()

    async def test_pairings_allowed_with_photos(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_draft(client)
        await client.post(
            f"/test/tournaments/{tid}/simulate-photos",
            json={"incomplete": False}, headers=ah,
        )
        drafts = await client.get(f"/tournaments/{tid}/drafts", headers=ah)
        pod_id = drafts.json()[0]["pods"][0]["id"]
        resp = await client.post(
            f"/tournaments/{tid}/drafts/{draft_id}/pods/{pod_id}/pairings", headers=ah,
        )
        assert resp.status_code == 201

    async def test_pairings_override_skips_check(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_draft(client)
        drafts = await client.get(f"/tournaments/{tid}/drafts", headers=ah)
        pod_id = drafts.json()[0]["pods"][0]["id"]
        resp = await client.post(
            f"/tournaments/{tid}/drafts/{draft_id}/pods/{pod_id}/pairings",
            json={"skip_photo_check": True}, headers=ah,
        )
        assert resp.status_code == 201


async def _complete_draft_round(client: AsyncClient, ah: dict, tid: str, draft_id: str):
    """Generate pairings per pod and simulate results for one swiss round."""
    drafts_resp = await client.get(f"/tournaments/{tid}/drafts", headers=ah)
    draft = next(d for d in drafts_resp.json() if d["id"] == draft_id)
    for pod in draft["pods"]:
        await client.post(
            f"/tournaments/{tid}/drafts/{draft_id}/pods/{pod['id']}/pairings",
            json={"skip_photo_check": True}, headers=ah,
        )
    await client.post(
        f"/test/tournaments/{tid}/simulate-results",
        json={"with_conflicts": False},
        headers=ah,
    )


class TestDraftPhotoEnforcement:
    async def test_second_draft_blocked_without_returned(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_draft(client)
        await _complete_draft_round(client, ah, tid, draft_id)

        resp = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
        assert resp.status_code == 400
        assert "returned" in resp.json()["detail"].lower()

    async def test_second_draft_allowed_with_returned(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_draft(client)
        await _complete_draft_round(client, ah, tid, draft_id)

        await client.post(
            f"/test/tournaments/{tid}/simulate-photos",
            json={"incomplete": False}, headers=ah,
        )

        resp = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
        assert resp.status_code == 201

    async def test_second_draft_override(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_draft(client)
        await _complete_draft_round(client, ah, tid, draft_id)

        resp = await client.post(
            f"/tournaments/{tid}/drafts",
            json={"skip_photo_check": True}, headers=ah,
        )
        assert resp.status_code == 201

    async def test_first_draft_not_blocked(self, client: AsyncClient):
        admin = await client.post(
            "/auth/admin/setup", json={"username": "admin", "password": "pw"}
        )
        ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
        resp = await client.post(
            "/test/tournament",
            json={"num_players": 4, "num_cubes": 2, "seed": 99}, headers=ah,
        )
        tid = resp.json()["tournament_id"]

        resp = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
        assert resp.status_code == 201
