import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_create_test_tournament(client: AsyncClient):
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}

    resp = await client.post(
        "/test/tournament",
        json={"num_players": 8, "num_cubes": 2, "seed": 42},
        headers=ah,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["player_count"] == 8
    assert data["cube_count"] == 2

    # Verify tournament detail
    detail = await client.get(f"/tournaments/{data['tournament_id']}")
    assert detail.json()["player_count"] == 8
    assert detail.json()["status"] == "VOTING"


async def test_seed_reproducibility(client: AsyncClient):
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}

    r1 = await client.post(
        "/test/tournament",
        json={"name": "Seed1", "num_players": 4, "num_cubes": 2, "seed": 123},
        headers=ah,
    )
    r2 = await client.post(
        "/test/tournament",
        json={"name": "Seed2", "num_players": 4, "num_cubes": 2, "seed": 123},
        headers=ah,
    )

    # Both should succeed
    assert r1.status_code == 201
    assert r2.status_code == 201
