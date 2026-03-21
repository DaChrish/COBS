import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

async def _setup(client: AsyncClient):
    admin = await client.post("/auth/admin/setup", json={"username": "admin", "password": "pw"})
    admin_token = admin.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    cube = await client.post("/cubes", json={"name": "TestCube"}, headers=admin_headers)
    cube_id = cube.json()["id"]

    t = await client.post("/tournaments", json={"name": "VoteTourney", "cube_ids": [cube_id]}, headers=admin_headers)
    tid = t.json()["id"]

    await client.patch(f"/tournaments/{tid}", json={"status": "VOTING"}, headers=admin_headers)

    join = await client.post("/tournaments/join", json={"join_code": t.json()["join_code"], "username": "voter", "password": "pw"})
    player_token = join.json()["access_token"]

    detail = await client.get(f"/tournaments/{tid}")
    tc_id = detail.json()["cubes"][0]["id"]

    return tid, tc_id, player_token, admin_headers

async def test_get_votes(client: AsyncClient):
    tid, tc_id, player_token, _ = await _setup(client)
    resp = await client.get(f"/tournaments/{tid}/votes", headers={"Authorization": f"Bearer {player_token}"})
    assert resp.status_code == 200
    votes = resp.json()
    assert len(votes) == 1
    assert votes[0]["vote"] == "NEUTRAL"

async def test_update_votes(client: AsyncClient):
    tid, tc_id, player_token, _ = await _setup(client)
    headers = {"Authorization": f"Bearer {player_token}"}
    resp = await client.put(f"/tournaments/{tid}/votes", json={"votes": [{"tournament_cube_id": tc_id, "vote": "DESIRED"}]}, headers=headers)
    assert resp.status_code == 200
    votes = await client.get(f"/tournaments/{tid}/votes", headers=headers)
    assert votes.json()[0]["vote"] == "DESIRED"

async def test_update_votes_not_in_voting_phase(client: AsyncClient):
    tid, tc_id, player_token, admin_headers = await _setup(client)
    await client.patch(f"/tournaments/{tid}", json={"status": "DRAFTING"}, headers=admin_headers)
    resp = await client.put(f"/tournaments/{tid}/votes", json={"votes": [{"tournament_cube_id": tc_id, "vote": "AVOID"}]}, headers={"Authorization": f"Bearer {player_token}"})
    assert resp.status_code == 400
