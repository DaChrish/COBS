import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _admin(client: AsyncClient):
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    return {"Authorization": f"Bearer {admin.json()['access_token']}"}


class TestBatchAnalysis:
    async def test_run_batch(self, client: AsyncClient):
        ah = await _admin(client)
        resp = await client.post(
            "/batch-analysis",
            json={
                "num_players": 8,
                "num_cubes": 2,
                "max_rounds": 1,
                "num_simulations": 3,
                "swiss_rounds_per_draft": 1,
            },
            headers=ah,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["num_simulations"] == 3
        assert len(data["simulations"]) == 3
        assert 0 <= data["avg_desired_pct"] <= 100

    async def test_with_profiles(self, client: AsyncClient):
        ah = await _admin(client)
        resp = await client.post(
            "/batch-analysis",
            json={
                "num_players": 8,
                "num_cubes": 4,
                "max_rounds": 1,
                "num_simulations": 2,
                "swiss_rounds_per_draft": 1,
                "player_profiles": [
                    {
                        "count": 2,
                        "desired_pct": 0.1,
                        "neutral_pct": 0.0,
                        "avoid_pct": 0.9,
                    }
                ],
            },
            headers=ah,
        )
        assert resp.status_code == 201

    async def test_list(self, client: AsyncClient):
        ah = await _admin(client)
        await client.post(
            "/batch-analysis",
            json={
                "num_players": 8,
                "num_cubes": 2,
                "max_rounds": 1,
                "num_simulations": 1,
                "swiss_rounds_per_draft": 1,
            },
            headers=ah,
        )
        resp = await client.get("/batch-analysis", headers=ah)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_delete(self, client: AsyncClient):
        ah = await _admin(client)
        created = await client.post(
            "/batch-analysis",
            json={
                "num_players": 8,
                "num_cubes": 2,
                "max_rounds": 1,
                "num_simulations": 1,
                "swiss_rounds_per_draft": 1,
            },
            headers=ah,
        )
        resp = await client.delete(
            f"/batch-analysis/{created.json()['id']}", headers=ah
        )
        assert resp.status_code == 204

    async def test_csv(self, client: AsyncClient):
        ah = await _admin(client)
        created = await client.post(
            "/batch-analysis",
            json={
                "num_players": 8,
                "num_cubes": 2,
                "max_rounds": 1,
                "num_simulations": 3,
                "swiss_rounds_per_draft": 1,
            },
            headers=ah,
        )
        resp = await client.get(
            f"/batch-analysis/{created.json()['id']}/csv", headers=ah
        )
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]
        lines = resp.text.strip().split("\n")
        assert len(lines) == 4  # header + 3 rows
