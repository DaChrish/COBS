import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _setup(client: AsyncClient):
    admin = await client.post("/auth/admin/setup", json={"username": "admin", "password": "pw"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    c1 = await client.post("/cubes", json={"name": "Cube A", "max_players": 8}, headers=ah)
    c2 = await client.post("/cubes", json={"name": "Cube B"}, headers=ah)
    t = await client.post("/tournaments", json={"name": "Test"}, headers=ah)
    return ah, t.json()["id"], c1.json()["id"], c2.json()["id"]


class TestTournamentCubes:
    async def test_add_cube(self, client: AsyncClient):
        ah, tid, cid1, _ = await _setup(client)
        resp = await client.post(f"/tournaments/{tid}/cubes", json={"cube_id": cid1}, headers=ah)
        assert resp.status_code == 201
        detail = await client.get(f"/tournaments/{tid}", headers=ah)
        assert detail.json()["cube_count"] == 1

    async def test_add_duplicate_fails(self, client: AsyncClient):
        ah, tid, cid1, _ = await _setup(client)
        await client.post(f"/tournaments/{tid}/cubes", json={"cube_id": cid1}, headers=ah)
        resp = await client.post(f"/tournaments/{tid}/cubes", json={"cube_id": cid1}, headers=ah)
        assert resp.status_code == 409

    async def test_remove_cube(self, client: AsyncClient):
        ah, tid, cid1, _ = await _setup(client)
        await client.post(f"/tournaments/{tid}/cubes", json={"cube_id": cid1}, headers=ah)
        resp = await client.delete(f"/tournaments/{tid}/cubes/{cid1}", headers=ah)
        assert resp.status_code == 204
        detail = await client.get(f"/tournaments/{tid}", headers=ah)
        assert detail.json()["cube_count"] == 0

    async def test_add_copies_max_players(self, client: AsyncClient):
        ah, tid, cid1, _ = await _setup(client)
        await client.post(f"/tournaments/{tid}/cubes", json={"cube_id": cid1}, headers=ah)
        detail = await client.get(f"/tournaments/{tid}", headers=ah)
        cube = detail.json()["cubes"][0]
        assert cube["max_players"] == 8


class TestCubeMaxPlayers:
    async def test_create_with_max_players(self, client: AsyncClient):
        admin = await client.post("/auth/admin/setup", json={"username": "admin", "password": "pw"})
        ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
        resp = await client.post("/cubes", json={"name": "Small Cube", "max_players": 4}, headers=ah)
        assert resp.status_code == 201
        assert resp.json()["max_players"] == 4

    async def test_update_max_players(self, client: AsyncClient):
        admin = await client.post("/auth/admin/setup", json={"username": "admin", "password": "pw"})
        ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
        c = await client.post("/cubes", json={"name": "Flex Cube"}, headers=ah)
        resp = await client.patch(f"/cubes/{c.json()['id']}", json={"max_players": 6}, headers=ah)
        assert resp.status_code == 200
        assert resp.json()["max_players"] == 6
