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


class TestSimulateDraftMulti:
    async def test_returns_rounds(self, client: AsyncClient):
        ah, tid = await _setup(client)
        resp = await client.post(
            f"/tournaments/{tid}/simulate-draft-multi",
            json={"num_rounds": 3, "seed": 5},
            headers=ah,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["num_rounds"] == 3
        assert data["player_count"] == 8
        assert len(data["rounds"]) == 3
        for i, r in enumerate(data["rounds"]):
            assert r["round"] == i + 1
            assert sum(p["size"] for p in r["pods"]) == 8

    async def test_deterministic_per_seed(self, client: AsyncClient):
        ah, tid = await _setup(client)
        body = {"num_rounds": 3, "seed": 42, "avoid_penalty_formula": "arccot_norm"}
        r1 = await client.post(f"/tournaments/{tid}/simulate-draft-multi", json=body, headers=ah)
        r2 = await client.post(f"/tournaments/{tid}/simulate-draft-multi", json=body, headers=ah)

        def strip(rounds):  # solver_time is wall-clock and varies between runs
            return [{k: v for k, v in r.items() if k != "solver_time"} for r in rounds]

        assert strip(r1.json()["rounds"]) == strip(r2.json()["rounds"])

    async def test_different_seed_may_differ(self, client: AsyncClient):
        ah, tid = await _setup(client)
        r1 = await client.post(f"/tournaments/{tid}/simulate-draft-multi", json={"seed": 1}, headers=ah)
        r2 = await client.post(f"/tournaments/{tid}/simulate-draft-multi", json={"seed": 2}, headers=ah)
        assert r1.status_code == 200 and r2.status_code == 200

    async def test_rejects_zero_rounds(self, client: AsyncClient):
        ah, tid = await _setup(client)
        resp = await client.post(f"/tournaments/{tid}/simulate-draft-multi", json={"num_rounds": 0}, headers=ah)
        assert resp.status_code == 400

    async def test_36_players_fills_pods(self, client: AsyncClient):
        # Regression: 36 players (≡ 4 mod 16) previously produced pod sizes
        # summing to 28 → INFEASIBLE → empty pods. Must now fill all 36 seats.
        admin = await client.post("/auth/admin/setup", json={"username": "admin", "password": "pw"})
        ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
        resp = await client.post("/test/tournament", json={"num_players": 36, "num_cubes": 8, "seed": 7}, headers=ah)
        tid = resp.json()["tournament_id"]

        r = await client.post(f"/tournaments/{tid}/simulate-draft-multi", json={"num_rounds": 1, "seed": 1}, headers=ah)
        assert r.status_code == 200
        data = r.json()
        assert data["player_count"] == 36
        assert sum(p["size"] for p in data["rounds"][0]["pods"]) == 36
