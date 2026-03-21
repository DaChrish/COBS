import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _full_setup(client: AsyncClient, num_players: int = 8):
    """Create tournament with players and generate a draft."""
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    at = admin.json()["access_token"]
    ah = {"Authorization": f"Bearer {at}"}

    c1 = await client.post("/cubes", json={"name": "C1"}, headers=ah)
    c2 = await client.post("/cubes", json={"name": "C2"}, headers=ah)

    t = await client.post(
        "/tournaments",
        json={"name": "MatchTest", "cube_ids": [c1.json()["id"], c2.json()["id"]]},
        headers=ah,
    )
    tid = t.json()["id"]
    code = t.json()["join_code"]

    await client.patch(f"/tournaments/{tid}", json={"status": "VOTING"}, headers=ah)

    player_tokens = []
    for i in range(num_players):
        j = await client.post(
            "/tournaments/join",
            json={"join_code": code, "username": f"p{i}", "password": "pw"},
        )
        player_tokens.append(j.json()["access_token"])

    # Create draft
    draft_resp = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    draft_id = draft_resp.json()["id"]

    return tid, draft_id, ah, player_tokens


async def test_generate_pairings(client: AsyncClient):
    tid, did, ah, _ = await _full_setup(client, 8)

    resp = await client.post(f"/tournaments/{tid}/drafts/{did}/pairings", headers=ah)
    assert resp.status_code == 201
    matches = resp.json()
    assert len(matches) >= 4  # 4 matches for 8 players


async def test_list_matches(client: AsyncClient):
    tid, did, ah, _ = await _full_setup(client, 8)
    await client.post(f"/tournaments/{tid}/drafts/{did}/pairings", headers=ah)

    resp = await client.get(f"/tournaments/{tid}/drafts/{did}/matches")
    assert resp.status_code == 200
    assert len(resp.json()) >= 4


async def test_report_match(client: AsyncClient):
    tid, did, ah, pts = await _full_setup(client, 4)
    pairings = await client.post(
        f"/tournaments/{tid}/drafts/{did}/pairings", headers=ah
    )
    matches = [m for m in pairings.json() if not m["is_bye"]]
    if not matches:
        return  # skip if all byes (unlikely with 4 players)

    match = matches[0]
    mid = match["id"]

    # Try each player token until one succeeds (player in this match)
    resp = None
    for pt in pts:
        resp = await client.post(
            f"/tournaments/{tid}/drafts/{did}/matches/{mid}/report",
            json={"player1_wins": 2, "player2_wins": 1},
            headers={"Authorization": f"Bearer {pt}"},
        )
        if resp.status_code == 200:
            break

    assert resp.status_code == 200


async def test_max_3_swiss_rounds(client: AsyncClient):
    tid, did, ah, _ = await _full_setup(client, 4)

    # Generate 3 rounds of pairings
    for _ in range(3):
        resp = await client.post(
            f"/tournaments/{tid}/drafts/{did}/pairings", headers=ah
        )
        assert resp.status_code == 201

        # Auto-resolve all matches for this round
        matches_resp = await client.get(f"/tournaments/{tid}/drafts/{did}/matches")
        for m in matches_resp.json():
            if not m["reported"]:
                await client.post(
                    f"/tournaments/{tid}/drafts/{did}/matches/{m['id']}/resolve",
                    json={"player1_wins": 2, "player2_wins": 0},
                    headers=ah,
                )

    # 4th round should fail
    resp = await client.post(
        f"/tournaments/{tid}/drafts/{did}/pairings", headers=ah
    )
    assert resp.status_code == 400
