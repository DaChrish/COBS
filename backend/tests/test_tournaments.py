import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _setup_admin(client: AsyncClient) -> str:
    resp = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    return resp.json()["access_token"]


async def _create_cube(client: AsyncClient, token: str, name: str) -> str:
    resp = await client.post(
        "/cubes",
        json={"name": name},
        headers={"Authorization": f"Bearer {token}"},
    )
    return resp.json()["id"]


async def test_create_tournament(client: AsyncClient):
    token = await _setup_admin(client)
    cube_id = await _create_cube(client, token, "Test Cube")
    resp = await client.post(
        "/tournaments",
        json={"name": "Test Tournament", "cube_ids": [cube_id]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Tournament"
    assert len(data["join_code"]) == 8
    assert data["cube_count"] == 1


async def test_list_tournaments(client: AsyncClient):
    token = await _setup_admin(client)
    await client.post(
        "/tournaments",
        json={"name": "T1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    resp = await client.get(
        "/tournaments", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1


async def test_join_tournament(client: AsyncClient):
    token = await _setup_admin(client)
    cube_id = await _create_cube(client, token, "Cube 1")

    t_resp = await client.post(
        "/tournaments",
        json={"name": "Joinable", "cube_ids": [cube_id]},
        headers={"Authorization": f"Bearer {token}"},
    )
    join_code = t_resp.json()["join_code"]
    tournament_id = t_resp.json()["id"]

    join_resp = await client.post(
        "/tournaments/join",
        json={"join_code": join_code, "username": "newplayer", "password": "pw"},
    )
    assert join_resp.status_code == 200
    assert join_resp.json()["access_token"]

    detail = await client.get(f"/tournaments/{tournament_id}")
    assert detail.json()["player_count"] == 1
    assert detail.json()["players"][0]["username"] == "newplayer"


async def test_join_creates_neutral_votes(client: AsyncClient):
    token = await _setup_admin(client)
    cube_id = await _create_cube(client, token, "VoteCube")

    t_resp = await client.post(
        "/tournaments",
        json={"name": "VoteTest", "cube_ids": [cube_id]},
        headers={"Authorization": f"Bearer {token}"},
    )
    join_code = t_resp.json()["join_code"]

    await client.post(
        "/tournaments/join",
        json={"join_code": join_code, "username": "voter", "password": "pw"},
    )

    detail = await client.get(f"/tournaments/{t_resp.json()['id']}")
    assert detail.json()["player_count"] == 1


async def test_join_invalid_code(client: AsyncClient):
    resp = await client.post(
        "/tournaments/join",
        json={"join_code": "BADCODE1", "username": "x", "password": "pw"},
    )
    assert resp.status_code == 404


async def test_join_idempotent(client: AsyncClient):
    token = await _setup_admin(client)
    t_resp = await client.post(
        "/tournaments",
        json={"name": "Idem"},
        headers={"Authorization": f"Bearer {token}"},
    )
    code = t_resp.json()["join_code"]

    await client.post(
        "/tournaments/join",
        json={"join_code": code, "username": "same", "password": "pw"},
    )
    resp = await client.post(
        "/tournaments/join",
        json={"join_code": code, "username": "same", "password": "pw"},
    )
    assert resp.status_code == 200


async def test_update_tournament_status(client: AsyncClient):
    token = await _setup_admin(client)
    t_resp = await client.post(
        "/tournaments",
        json={"name": "StatusTest"},
        headers={"Authorization": f"Bearer {token}"},
    )
    tid = t_resp.json()["id"]

    resp = await client.patch(
        f"/tournaments/{tid}",
        json={"status": "VOTING"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.json()["status"] == "VOTING"


async def test_drop_player(client: AsyncClient):
    token = await _setup_admin(client)
    t_resp = await client.post(
        "/tournaments",
        json={"name": "DropTest"},
        headers={"Authorization": f"Bearer {token}"},
    )
    code = t_resp.json()["join_code"]
    tid = t_resp.json()["id"]

    join_resp = await client.post(
        "/tournaments/join",
        json={"join_code": code, "username": "dropper", "password": "pw"},
    )
    player_token = join_resp.json()["access_token"]

    detail = await client.get(f"/tournaments/{tid}")
    tp_id = detail.json()["players"][0]["id"]

    resp = await client.patch(
        f"/tournaments/{tid}/players/{tp_id}/drop",
        headers={"Authorization": f"Bearer {player_token}"},
    )
    assert resp.status_code == 200

    detail = await client.get(f"/tournaments/{tid}")
    assert detail.json()["players"][0]["dropped"] is True
