import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_register(client: AsyncClient):
    resp = await client.post(
        "/auth/register", json={"username": "alice", "password": "test123"}
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["access_token"]
    assert data["is_admin"] is False


async def test_register_duplicate(client: AsyncClient):
    await client.post("/auth/register", json={"username": "bob", "password": "pw"})
    resp = await client.post(
        "/auth/register", json={"username": "bob", "password": "pw"}
    )
    assert resp.status_code == 409


async def test_login(client: AsyncClient):
    await client.post("/auth/register", json={"username": "carol", "password": "pw"})
    resp = await client.post(
        "/auth/login", json={"username": "carol", "password": "pw"}
    )
    assert resp.status_code == 200
    assert resp.json()["access_token"]


async def test_login_wrong_password(client: AsyncClient):
    await client.post("/auth/register", json={"username": "dave", "password": "pw"})
    resp = await client.post(
        "/auth/login", json={"username": "dave", "password": "wrong"}
    )
    assert resp.status_code == 401


async def test_me(client: AsyncClient):
    reg = await client.post(
        "/auth/register", json={"username": "eve", "password": "pw"}
    )
    token = reg.json()["access_token"]
    resp = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["username"] == "eve"


async def test_me_no_token(client: AsyncClient):
    resp = await client.get("/auth/me")
    assert resp.status_code in (401, 403)


async def test_admin_setup(client: AsyncClient):
    resp = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "admin123"}
    )
    assert resp.status_code == 201
    assert resp.json()["is_admin"] is True


async def test_admin_setup_only_once(client: AsyncClient):
    await client.post(
        "/auth/admin/setup", json={"username": "admin1", "password": "pw"}
    )
    resp = await client.post(
        "/auth/admin/setup", json={"username": "admin2", "password": "pw"}
    )
    assert resp.status_code == 409


async def test_impersonate(client: AsyncClient):
    # Create admin
    admin_resp = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    admin_token = admin_resp.json()["access_token"]

    # Create player
    player_resp = await client.post(
        "/auth/register", json={"username": "player1", "password": "pw"}
    )
    player_id = player_resp.json()["user_id"]

    # Impersonate
    imp_resp = await client.post(
        "/auth/impersonate",
        json={"user_id": player_id},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert imp_resp.status_code == 200
    imp_token = imp_resp.json()["access_token"]

    # /me should return the impersonated player
    me_resp = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {imp_token}"}
    )
    assert me_resp.json()["username"] == "player1"
