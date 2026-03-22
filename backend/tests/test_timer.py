import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _setup_pod(client: AsyncClient):
    """Create tournament with draft, return admin headers + pod_id."""
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}

    cube = await client.post("/cubes", json={"name": "TimerCube"}, headers=ah)

    t = await client.post(
        "/tournaments",
        json={"name": "TimerTest", "cube_ids": [cube.json()["id"]]},
        headers=ah,
    )
    tid = t.json()["id"]
    code = t.json()["join_code"]

    await client.patch(f"/tournaments/{tid}", json={"status": "VOTING"}, headers=ah)

    for i in range(4):
        await client.post(
            "/tournaments/join",
            json={"join_code": code, "username": f"timerp{i}", "password": "pw"},
        )

    draft = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    pod_id = draft.json()["pods"][0]["id"]

    return tid, pod_id, ah


async def test_set_timer(client: AsyncClient):
    tid, pod_id, ah = await _setup_pod(client)

    resp = await client.post(
        f"/tournaments/{tid}/pods/{pod_id}/timer",
        json={"minutes": 45},
        headers=ah,
    )
    assert resp.status_code == 200
    assert resp.json()["timer_ends_at"] is not None


async def test_clear_timer(client: AsyncClient):
    tid, pod_id, ah = await _setup_pod(client)

    # Set then clear
    await client.post(
        f"/tournaments/{tid}/pods/{pod_id}/timer",
        json={"minutes": 45},
        headers=ah,
    )
    resp = await client.post(
        f"/tournaments/{tid}/pods/{pod_id}/timer",
        json={"minutes": None},
        headers=ah,
    )
    assert resp.status_code == 200
    assert resp.json()["timer_ends_at"] is None
