import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_full_tournament_simulation(client: AsyncClient):
    """End-to-end: create → draft → pairings → simulate → conflicts → resolve → standings → drop → round 2."""
    # 1. Setup admin
    admin = await client.post("/auth/admin/setup", json={"username": "admin", "password": "pw"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}

    # 2. Create test tournament: 13 players, 4 cubes, seed 42
    resp = await client.post(
        "/test/tournament",
        json={"name": "Full Sim", "num_players": 13, "num_cubes": 4, "seed": 42},
        headers=ah,
    )
    assert resp.status_code == 201
    tid = resp.json()["tournament_id"]

    # 3. Verify is_test flag
    detail = await client.get(f"/tournaments/{tid}", headers=ah)
    assert detail.json()["is_test"] is True
    assert detail.json()["seed"] == 42

    # --- ROUND 1 (Draft 1) ---

    # 4. Generate draft
    draft_resp = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    assert draft_resp.status_code == 201
    draft = draft_resp.json()
    assert draft["round_number"] == 1
    assert len(draft["pods"]) == 2  # 13 players → 2 pods

    # 5. Simulate photos (all)
    photo_resp = await client.post(
        f"/test/tournaments/{tid}/simulate-photos",
        json={"incomplete": False},
        headers=ah,
    )
    assert photo_resp.status_code == 200
    assert photo_resp.json()["photos_created"] == 13 * 3

    # 6. Generate Swiss pairings (round 1)
    pair_resp = await client.post(
        f"/tournaments/{tid}/drafts/{draft['id']}/pairings", headers=ah
    )
    assert pair_resp.status_code == 201
    matches = pair_resp.json()
    byes = [m for m in matches if m["is_bye"]]
    non_byes = [m for m in matches if not m["is_bye"]]
    assert len(byes) >= 1  # odd pod → at least 1 bye

    # 7. Simulate results (no conflicts)
    sim_resp = await client.post(
        f"/test/tournaments/{tid}/simulate-results",
        json={"with_conflicts": False},
        headers=ah,
    )
    assert sim_resp.status_code == 200
    assert sim_resp.json()["reported"] == len(non_byes)
    assert sim_resp.json()["conflicts"] == 0

    # 8. Generate Swiss pairings (round 2)
    pair_resp2 = await client.post(
        f"/tournaments/{tid}/drafts/{draft['id']}/pairings", headers=ah
    )
    assert pair_resp2.status_code == 201

    # 9. Simulate results WITH conflicts
    sim_resp2 = await client.post(
        f"/test/tournaments/{tid}/simulate-results",
        json={"with_conflicts": True},
        headers=ah,
    )
    assert sim_resp2.status_code == 200
    conflict_count = sim_resp2.json()["conflicts"]

    # 10. If conflicts exist, resolve them via admin
    if conflict_count > 0:
        matches_resp = await client.get(
            f"/tournaments/{tid}/drafts/{draft['id']}/matches", headers=ah
        )
        for m in matches_resp.json():
            if m["has_conflict"]:
                resolve = await client.post(
                    f"/tournaments/{tid}/drafts/{draft['id']}/matches/{m['id']}/resolve",
                    json={"player1_wins": 2, "player2_wins": 1},
                    headers=ah,
                )
                assert resolve.status_code == 200

    # 11. Check standings after round 1
    standings = await client.get(f"/tournaments/{tid}/standings", headers=ah)
    assert standings.status_code == 200
    assert len(standings.json()) == 13

    # 12. Drop a player (pick someone from the standings)
    detail2 = await client.get(f"/tournaments/{tid}", headers=ah)
    players = detail2.json()["players"]
    drop_target = players[-1]  # drop last player
    drop_resp = await client.patch(
        f"/tournaments/{tid}/players/{drop_target['id']}/drop", headers=ah
    )
    assert drop_resp.status_code == 200

    # --- ROUND 2 (Draft 2) ---

    # 13. Generate second draft (should only include 12 active players)
    draft2_resp = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    assert draft2_resp.status_code == 201
    draft2 = draft2_resp.json()
    assert draft2["round_number"] == 2
    # Count players across pods
    total_players = sum(len(pod["players"]) for pod in draft2["pods"])
    assert total_players == 12  # one player dropped

    # 14. Simulate photos with gaps
    photo_resp2 = await client.post(
        f"/test/tournaments/{tid}/simulate-photos",
        json={"incomplete": True},
        headers=ah,
    )
    assert photo_resp2.status_code == 200
    assert photo_resp2.json()["photos_skipped"] > 0

    # 15. Generate pairings and simulate for draft 2 (incomplete photos → skip check)
    pair_resp3 = await client.post(
        f"/tournaments/{tid}/drafts/{draft2['id']}/pairings", json={"skip_photo_check": True}, headers=ah
    )
    assert pair_resp3.status_code == 201

    sim_resp3 = await client.post(
        f"/test/tournaments/{tid}/simulate-results",
        json={"with_conflicts": False},
        headers=ah,
    )
    assert sim_resp3.status_code == 200
    assert sim_resp3.json()["reported"] > 0

    # 16. Final standings should still include all 13 (dropped player shows too)
    final_standings = await client.get(f"/tournaments/{tid}/standings", headers=ah)
    assert final_standings.status_code == 200
    assert len(final_standings.json()) == 13
