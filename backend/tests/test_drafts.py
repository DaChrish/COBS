import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _setup_tournament_with_players(client: AsyncClient, num_players: int = 8):
    """Create admin, cube, tournament in VOTING, join players, return context."""
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    admin_token = admin.json()["access_token"]
    ah = {"Authorization": f"Bearer {admin_token}"}

    # Create 2 cubes
    c1 = await client.post("/cubes", json={"name": "Cube Alpha"}, headers=ah)
    c2 = await client.post("/cubes", json={"name": "Cube Beta"}, headers=ah)

    t = await client.post(
        "/tournaments",
        json={"name": "Draft Test", "cube_ids": [c1.json()["id"], c2.json()["id"]]},
        headers=ah,
    )
    tid = t.json()["id"]
    code = t.json()["join_code"]

    # Set to VOTING
    await client.patch(f"/tournaments/{tid}", json={"status": "VOTING"}, headers=ah)

    # Join players
    player_tokens = []
    for i in range(num_players):
        j = await client.post(
            "/tournaments/join",
            json={"join_code": code, "username": f"player{i}", "password": "pw"},
        )
        player_tokens.append(j.json()["access_token"])

    return tid, ah, player_tokens


async def test_create_draft(client: AsyncClient):
    tid, ah, _ = await _setup_tournament_with_players(client, 8)

    resp = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    assert resp.status_code == 201
    data = resp.json()
    assert data["round_number"] == 1
    assert data["status"] == "ACTIVE"
    assert len(data["pods"]) >= 1

    # All 8 players should be assigned
    all_players = []
    for pod in data["pods"]:
        all_players.extend(pod["players"])
    assert len(all_players) == 8


async def test_create_draft_updates_status(client: AsyncClient):
    tid, ah, _ = await _setup_tournament_with_players(client, 8)
    await client.post(f"/tournaments/{tid}/drafts", headers=ah)

    detail = await client.get(f"/tournaments/{tid}")
    assert detail.json()["status"] == "DRAFTING"


async def test_list_drafts(client: AsyncClient):
    tid, ah, _ = await _setup_tournament_with_players(client, 8)
    await client.post(f"/tournaments/{tid}/drafts", headers=ah)

    resp = await client.get(f"/tournaments/{tid}/drafts")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


async def test_cannot_exceed_max_rounds(client: AsyncClient):
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}

    c = await client.post("/cubes", json={"name": "C1"}, headers=ah)
    t = await client.post(
        "/tournaments",
        json={"name": "MaxRounds", "cube_ids": [c.json()["id"]], "max_rounds": 1},
        headers=ah,
    )
    tid = t.json()["id"]
    code = t.json()["join_code"]

    await client.patch(f"/tournaments/{tid}", json={"status": "VOTING"}, headers=ah)

    for i in range(2):
        await client.post(
            "/tournaments/join",
            json={"join_code": code, "username": f"p{i}", "password": "pw"},
        )

    # First draft OK
    r1 = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    assert r1.status_code == 201

    # Second draft should fail (max_rounds=1)
    r2 = await client.post(
        f"/tournaments/{tid}/drafts",
        json={"skip_photo_check": True},
        headers=ah,
    )
    assert r2.status_code == 400
