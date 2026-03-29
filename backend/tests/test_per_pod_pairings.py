import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _setup_draft(client: AsyncClient):
    admin = await client.post("/auth/admin/setup", json={"username": "admin", "password": "pw"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    resp = await client.post("/test/tournament", json={"num_players": 13, "num_cubes": 4, "seed": 42}, headers=ah)
    tid = resp.json()["tournament_id"]
    draft_resp = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    draft = draft_resp.json()
    await client.post(f"/test/tournaments/{tid}/simulate-photos", json={"incomplete": False}, headers=ah)
    return ah, tid, draft


class TestPerPodPairings:
    async def test_generate_for_single_pod(self, client: AsyncClient):
        ah, tid, draft = await _setup_draft(client)
        pod = draft["pods"][0]
        resp = await client.post(f"/tournaments/{tid}/drafts/{draft['id']}/pods/{pod['id']}/pairings", json={}, headers=ah)
        assert resp.status_code == 201
        assert len(resp.json()) > 0
        assert all(m["pod_id"] == pod["id"] for m in resp.json())

    async def test_other_pod_unaffected(self, client: AsyncClient):
        ah, tid, draft = await _setup_draft(client)
        pod1, pod2 = draft["pods"][0], draft["pods"][1]
        await client.post(f"/tournaments/{tid}/drafts/{draft['id']}/pods/{pod1['id']}/pairings", json={}, headers=ah)
        matches = await client.get(f"/tournaments/{tid}/drafts/{draft['id']}/matches", headers=ah)
        pod2_matches = [m for m in matches.json() if m["pod_id"] == pod2["id"]]
        assert len(pod2_matches) == 0

    async def test_different_swiss_rounds(self, client: AsyncClient):
        ah, tid, draft = await _setup_draft(client)
        pod1, pod2 = draft["pods"][0], draft["pods"][1]
        # Round 1 for both
        await client.post(f"/tournaments/{tid}/drafts/{draft['id']}/pods/{pod1['id']}/pairings", json={}, headers=ah)
        await client.post(f"/tournaments/{tid}/drafts/{draft['id']}/pods/{pod2['id']}/pairings", json={}, headers=ah)
        # Simulate all results
        await client.post(f"/test/tournaments/{tid}/simulate-results", json={"with_conflicts": False}, headers=ah)
        # Round 2 for pod 1 only
        resp = await client.post(f"/tournaments/{tid}/drafts/{draft['id']}/pods/{pod1['id']}/pairings", json={}, headers=ah)
        assert resp.status_code == 201
        matches = await client.get(f"/tournaments/{tid}/drafts/{draft['id']}/matches", headers=ah)
        pod1_rounds = set(m["swiss_round"] for m in matches.json() if m["pod_id"] == pod1["id"])
        pod2_rounds = set(m["swiss_round"] for m in matches.json() if m["pod_id"] == pod2["id"])
        assert 2 in pod1_rounds
        assert 2 not in pod2_rounds

    async def test_blocks_on_unreported(self, client: AsyncClient):
        ah, tid, draft = await _setup_draft(client)
        pod = draft["pods"][0]
        await client.post(f"/tournaments/{tid}/drafts/{draft['id']}/pods/{pod['id']}/pairings", json={}, headers=ah)
        resp = await client.post(f"/tournaments/{tid}/drafts/{draft['id']}/pods/{pod['id']}/pairings", json={}, headers=ah)
        assert resp.status_code == 400
        assert "unreported" in resp.json()["detail"].lower()

    async def test_only_clears_this_pod_timer(self, client: AsyncClient):
        ah, tid, draft = await _setup_draft(client)
        pod1, pod2 = draft["pods"][0], draft["pods"][1]
        await client.post(f"/tournaments/{tid}/pods/{pod1['id']}/timer", json={"minutes": 50}, headers=ah)
        await client.post(f"/tournaments/{tid}/pods/{pod2['id']}/timer", json={"minutes": 50}, headers=ah)
        await client.post(f"/tournaments/{tid}/drafts/{draft['id']}/pods/{pod1['id']}/pairings", json={}, headers=ah)
        drafts = await client.get(f"/tournaments/{tid}/drafts", headers=ah)
        pod2_data = next(p for p in drafts.json()[0]["pods"] if p["id"] == pod2["id"])
        assert pod2_data["timer_ends_at"] is not None
