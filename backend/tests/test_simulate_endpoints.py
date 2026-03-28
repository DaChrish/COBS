import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _setup_tournament_with_matches(client: AsyncClient):
    """Create a test tournament with a draft and pairings ready to simulate."""
    # 1. Create admin
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}

    # 2. Create test tournament (8 players, 2 cubes, seed 42)
    resp = await client.post(
        "/test/tournament",
        json={"num_players": 8, "num_cubes": 2, "seed": 42},
        headers=ah,
    )
    assert resp.status_code == 201
    tid = resp.json()["tournament_id"]

    # 3. Generate draft
    draft_resp = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    assert draft_resp.status_code == 201
    draft_id = draft_resp.json()["id"]

    # 4. Generate pairings
    pair_resp = await client.post(
        f"/tournaments/{tid}/drafts/{draft_id}/pairings", headers=ah
    )
    assert pair_resp.status_code == 201

    return ah, tid, draft_id


async def test_simulate_results_reports_all_matches(client: AsyncClient):
    ah, tid, draft_id = await _setup_tournament_with_matches(client)

    resp = await client.post(
        f"/test/tournaments/{tid}/simulate-results",
        json={"with_conflicts": False},
        headers=ah,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["reported"] > 0
    assert data["conflicts"] == 0


async def test_simulate_results_with_conflicts(client: AsyncClient):
    ah, tid, draft_id = await _setup_tournament_with_matches(client)

    resp = await client.post(
        f"/test/tournaments/{tid}/simulate-results",
        json={"with_conflicts": True},
        headers=ah,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["reported"] + data["conflicts"] > 0


async def test_simulate_results_rejects_non_test_tournament(client: AsyncClient):
    # Create admin
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}

    # Create a cube first
    cube_resp = await client.post(
        "/cubes", json={"name": "Real Cube", "description": "A real cube"}, headers=ah
    )
    assert cube_resp.status_code == 201
    cube_id = cube_resp.json()["id"]

    # Create a real (non-test) tournament
    t_resp = await client.post(
        "/tournaments",
        json={"name": "Real Tournament", "cube_ids": [cube_id]},
        headers=ah,
    )
    assert t_resp.status_code == 201
    tid = t_resp.json()["id"]

    resp = await client.post(
        f"/test/tournaments/{tid}/simulate-results",
        json={},
        headers=ah,
    )
    assert resp.status_code == 400
    assert "test tournament" in resp.json()["detail"].lower()


class TestSimulatePhotos:
    async def test_simulate_photos_all(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_tournament_with_matches(client)

        resp = await client.post(
            f"/test/tournaments/{tid}/simulate-photos",
            json={"incomplete": False},
            headers=ah,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["photos_created"] == 24  # 8 players * 3 types
        assert data["photos_skipped"] == 0

    async def test_simulate_photos_incomplete(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_tournament_with_matches(client)

        resp = await client.post(
            f"/test/tournaments/{tid}/simulate-photos",
            json={"incomplete": True},
            headers=ah,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["photos_created"] + data["photos_skipped"] == 24
        assert data["photos_skipped"] > 0

    async def test_simulate_photos_rejects_non_test(self, client: AsyncClient):
        # Create admin
        admin = await client.post(
            "/auth/admin/setup", json={"username": "admin", "password": "pw"}
        )
        ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}

        # Create a cube first
        cube_resp = await client.post(
            "/cubes",
            json={"name": "Real Cube", "description": "A real cube"},
            headers=ah,
        )
        assert cube_resp.status_code == 201
        cube_id = cube_resp.json()["id"]

        # Create a real (non-test) tournament
        t_resp = await client.post(
            "/tournaments",
            json={"name": "Real Tournament", "cube_ids": [cube_id]},
            headers=ah,
        )
        assert t_resp.status_code == 201
        tid = t_resp.json()["id"]

        resp = await client.post(
            f"/test/tournaments/{tid}/simulate-photos",
            json={},
            headers=ah,
        )
        assert resp.status_code == 400
        assert "test tournament" in resp.json()["detail"].lower()

    async def test_simulate_photos_idempotent(self, client: AsyncClient):
        ah, tid, draft_id = await _setup_tournament_with_matches(client)

        # First run
        resp1 = await client.post(
            f"/test/tournaments/{tid}/simulate-photos",
            json={"incomplete": False},
            headers=ah,
        )
        assert resp1.status_code == 200
        assert resp1.json()["photos_created"] == 24

        # Second run — should replace, still 24 created
        resp2 = await client.post(
            f"/test/tournaments/{tid}/simulate-photos",
            json={"incomplete": False},
            headers=ah,
        )
        assert resp2.status_code == 200
        assert resp2.json()["photos_created"] == 24
        assert resp2.json()["photos_skipped"] == 0


async def test_simulate_skips_byes_and_already_reported(client: AsyncClient):
    ah, tid, draft_id = await _setup_tournament_with_matches(client)

    # First simulation - reports matches
    resp1 = await client.post(
        f"/test/tournaments/{tid}/simulate-results",
        json={"with_conflicts": False},
        headers=ah,
    )
    assert resp1.status_code == 200
    assert resp1.json()["reported"] > 0

    # Second simulation - no open matches left
    resp2 = await client.post(
        f"/test/tournaments/{tid}/simulate-results",
        json={"with_conflicts": False},
        headers=ah,
    )
    assert resp2.status_code == 200
    assert resp2.json()["reported"] == 0
    assert resp2.json()["conflicts"] == 0
