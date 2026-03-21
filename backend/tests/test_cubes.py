import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _admin_token(client: AsyncClient) -> str:
    resp = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    return resp.json()["access_token"]


async def _auth(client: AsyncClient, token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_create_cube(client: AsyncClient):
    token = await _admin_token(client)
    resp = await client.post(
        "/cubes",
        json={"name": "Vintage Cube", "description": "Power 9 included"},
        headers=await _auth(client, token),
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "Vintage Cube"


async def test_create_cube_duplicate_name(client: AsyncClient):
    token = await _admin_token(client)
    headers = await _auth(client, token)
    await client.post("/cubes", json={"name": "Cube A"}, headers=headers)
    resp = await client.post("/cubes", json={"name": "Cube A"}, headers=headers)
    assert resp.status_code == 409


async def test_list_cubes(client: AsyncClient):
    token = await _admin_token(client)
    headers = await _auth(client, token)
    await client.post("/cubes", json={"name": "Cube 1"}, headers=headers)
    await client.post("/cubes", json={"name": "Cube 2"}, headers=headers)

    resp = await client.get("/cubes")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_update_cube(client: AsyncClient):
    token = await _admin_token(client)
    headers = await _auth(client, token)
    create_resp = await client.post(
        "/cubes", json={"name": "Old Name"}, headers=headers
    )
    cube_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/cubes/{cube_id}", json={"name": "New Name"}, headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


async def test_delete_cube(client: AsyncClient):
    token = await _admin_token(client)
    headers = await _auth(client, token)
    create_resp = await client.post(
        "/cubes", json={"name": "Doomed"}, headers=headers
    )
    cube_id = create_resp.json()["id"]

    resp = await client.delete(f"/cubes/{cube_id}", headers=headers)
    assert resp.status_code == 204

    resp = await client.get(f"/cubes/{cube_id}")
    assert resp.status_code == 404


async def test_create_cube_requires_admin(client: AsyncClient):
    player_resp = await client.post(
        "/auth/register", json={"username": "player", "password": "pw"}
    )
    token = player_resp.json()["access_token"]
    resp = await client.post(
        "/cubes",
        json={"name": "Sneaky"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
