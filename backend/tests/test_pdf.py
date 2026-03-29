import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _setup_tournament_with_results(client: AsyncClient):
    admin = await client.post("/auth/admin/setup", json={"username": "admin", "password": "pw"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    resp = await client.post("/test/tournament", json={"num_players": 8, "num_cubes": 2, "seed": 42}, headers=ah)
    tid = resp.json()["tournament_id"]
    draft = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    draft_id = draft.json()["id"]
    await client.post(f"/test/tournaments/{tid}/simulate-photos", json={"incomplete": False}, headers=ah)
    await client.post(f"/tournaments/{tid}/drafts/{draft_id}/pairings", json={}, headers=ah)
    await client.post(f"/test/tournaments/{tid}/simulate-results", json={"with_conflicts": False}, headers=ah)
    return ah, tid, draft_id


class TestStandingsPdf:
    async def test_returns_pdf(self, client: AsyncClient):
        ah, tid, _ = await _setup_tournament_with_results(client)
        resp = await client.get(f"/tournaments/{tid}/standings/pdf", headers=ah)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content[:4] == b"%PDF"


class TestPairingsPdf:
    async def test_returns_pdf(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_tournament_with_results(client)
        resp = await client.get(f"/tournaments/{tid}/drafts/{draft_id}/pairings/pdf", headers=ah)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content[:4] == b"%PDF"

class TestPodsPdfEndpoint:
    async def test_returns_pdf(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_tournament_with_results(client)
        resp = await client.get(f"/tournaments/{tid}/drafts/{draft_id}/pods/pdf", headers=ah)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content[:4] == b"%PDF"


class TestPairingsPdfNoMatches:
    async def test_no_matches_returns_pdf(self, client: AsyncClient):
        admin = await client.post("/auth/admin/setup", json={"username": "admin", "password": "pw"})
        ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
        resp = await client.post("/test/tournament", json={"num_players": 4, "num_cubes": 2, "seed": 99}, headers=ah)
        tid = resp.json()["tournament_id"]
        draft = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
        draft_id = draft.json()["id"]
        resp = await client.get(f"/tournaments/{tid}/drafts/{draft_id}/pairings/pdf", headers=ah)
        assert resp.status_code == 200
        assert resp.content[:4] == b"%PDF"
