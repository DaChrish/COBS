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
    async def test_returns_result(self, client: AsyncClient):
        ah, tid = await _setup(client)
        resp = await client.post(f"/tournaments/{tid}/simulate-draft", json={}, headers=ah)
        assert resp.status_code == 201
        data = resp.json()
        assert data["player_count"] == 8
        assert data["pod_count"] >= 1
        assert data["total_desired"] + data["total_neutral"] + data["total_avoid"] == 8
        assert "pods" in data["result"]

    async def test_custom_config(self, client: AsyncClient):
        ah, tid = await _setup(client)
        resp = await client.post(f"/tournaments/{tid}/simulate-draft", json={
            "label": "Custom", "score_avoid": -500.0, "avoid_penalty_scaling": 2.0,
        }, headers=ah)
        assert resp.status_code == 201
        assert resp.json()["config"]["score_avoid"] == -500.0
        assert resp.json()["label"] == "Custom"

    async def test_list_simulations(self, client: AsyncClient):
        ah, tid = await _setup(client)
        await client.post(f"/tournaments/{tid}/simulate-draft", json={"label": "A"}, headers=ah)
        await client.post(f"/tournaments/{tid}/simulate-draft", json={"label": "B"}, headers=ah)
        resp = await client.get(f"/tournaments/{tid}/simulations", headers=ah)
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    async def test_delete_simulation(self, client: AsyncClient):
        ah, tid = await _setup(client)
        sim = await client.post(f"/tournaments/{tid}/simulate-draft", json={}, headers=ah)
        resp = await client.delete(f"/tournaments/{tid}/simulations/{sim.json()['id']}", headers=ah)
        assert resp.status_code == 204

    async def test_deterministic(self, client: AsyncClient):
        ah, tid = await _setup(client)
        r1 = await client.post(f"/tournaments/{tid}/simulate-draft", json={}, headers=ah)
        r2 = await client.post(f"/tournaments/{tid}/simulate-draft", json={}, headers=ah)
        assert r1.json()["result"] == r2.json()["result"]
