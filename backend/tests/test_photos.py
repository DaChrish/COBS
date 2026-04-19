import io
import os

import pytest
from httpx import AsyncClient
from PIL import Image

from cobs.config import settings

pytestmark = pytest.mark.asyncio


async def _setup_draft(client: AsyncClient):
    """Create admin, cube, tournament, players, and a draft."""
    admin = await client.post(
        "/auth/admin/setup", json={"username": "admin", "password": "pw"}
    )
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}

    cube = await client.post("/cubes", json={"name": "PhotoCube"}, headers=ah)

    t = await client.post(
        "/tournaments",
        json={"name": "PhotoTest", "cube_ids": [cube.json()["id"]]},
        headers=ah,
    )
    tid = t.json()["id"]
    code = t.json()["join_code"]

    await client.patch(f"/tournaments/{tid}", json={"status": "VOTING"}, headers=ah)

    tokens = []
    for i in range(4):
        j = await client.post(
            "/tournaments/join",
            json={"join_code": code, "username": f"photoplayer{i}", "password": "pw"},
        )
        tokens.append(j.json()["access_token"])

    draft = await client.post(f"/tournaments/{tid}/drafts", headers=ah)
    did = draft.json()["id"]

    return tid, did, ah, tokens


def _create_test_image() -> bytes:
    """Create a minimal valid JPEG image in memory."""
    img = Image.new("RGB", (100, 100), color="red")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf.read()


async def test_upload_photo(client: AsyncClient, tmp_path):
    # Override upload dir to temp
    settings.upload_dir = str(tmp_path)

    tid, did, ah, tokens = await _setup_draft(client)
    img_data = _create_test_image()

    resp = await client.post(
        f"/tournaments/{tid}/drafts/{did}/photos/POOL",
        files={"file": ("test.jpg", img_data, "image/jpeg")},
        headers={"Authorization": f"Bearer {tokens[0]}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["photo_type"] == "POOL"
    assert data["filename"].endswith(".jpg")


async def test_upload_appends_multiple_photos(client: AsyncClient, tmp_path):
    """Uploading the same photo_type twice now stores both (no replacement)."""
    settings.upload_dir = str(tmp_path)

    tid, did, ah, tokens = await _setup_draft(client)
    img_data = _create_test_image()
    headers = {"Authorization": f"Bearer {tokens[0]}"}

    r1 = await client.post(
        f"/tournaments/{tid}/drafts/{did}/photos/POOL",
        files={"file": ("test.jpg", img_data, "image/jpeg")},
        headers=headers,
    )
    r2 = await client.post(
        f"/tournaments/{tid}/drafts/{did}/photos/POOL",
        files={"file": ("test2.jpg", img_data, "image/jpeg")},
        headers=headers,
    )
    assert r1.status_code == 201 and r2.status_code == 201
    id1, id2 = r1.json()["id"], r2.json()["id"]
    assert id1 != id2

    # Both files must still exist — we no longer delete the previous upload.
    f1 = os.path.join(str(tmp_path), r1.json()["filename"])
    f2 = os.path.join(str(tmp_path), r2.json()["filename"])
    assert os.path.exists(f1)
    assert os.path.exists(f2)

    # /photos/mine returns both, ordered by upload time.
    mine = await client.get(
        f"/tournaments/{tid}/drafts/{did}/photos/mine", headers=headers
    )
    assert mine.status_code == 200
    pool_items = mine.json()["POOL"]
    assert [item["id"] for item in pool_items] == [id1, id2]
    assert mine.json()["DECK"] == []
    assert mine.json()["RETURNED"] == []


async def test_delete_photo_removes_record_and_file(client: AsyncClient, tmp_path):
    settings.upload_dir = str(tmp_path)

    tid, did, ah, tokens = await _setup_draft(client)
    img_data = _create_test_image()
    headers = {"Authorization": f"Bearer {tokens[0]}"}

    r1 = await client.post(
        f"/tournaments/{tid}/drafts/{did}/photos/POOL",
        files={"file": ("a.jpg", img_data, "image/jpeg")},
        headers=headers,
    )
    r2 = await client.post(
        f"/tournaments/{tid}/drafts/{did}/photos/POOL",
        files={"file": ("b.jpg", img_data, "image/jpeg")},
        headers=headers,
    )
    id1, filename1 = r1.json()["id"], r1.json()["filename"]
    id2 = r2.json()["id"]

    del_resp = await client.delete(
        f"/tournaments/{tid}/drafts/{did}/photos/item/{id1}", headers=headers
    )
    assert del_resp.status_code == 204
    assert not os.path.exists(os.path.join(str(tmp_path), filename1))

    mine = await client.get(
        f"/tournaments/{tid}/drafts/{did}/photos/mine", headers=headers
    )
    assert [item["id"] for item in mine.json()["POOL"]] == [id2]


async def test_cannot_delete_other_players_photo(client: AsyncClient, tmp_path):
    settings.upload_dir = str(tmp_path)

    tid, did, ah, tokens = await _setup_draft(client)
    img_data = _create_test_image()

    r = await client.post(
        f"/tournaments/{tid}/drafts/{did}/photos/POOL",
        files={"file": ("a.jpg", img_data, "image/jpeg")},
        headers={"Authorization": f"Bearer {tokens[0]}"},
    )
    photo_id = r.json()["id"]

    # Another player attempts to delete — must fail with 404
    bad = await client.delete(
        f"/tournaments/{tid}/drafts/{did}/photos/item/{photo_id}",
        headers={"Authorization": f"Bearer {tokens[1]}"},
    )
    assert bad.status_code == 404


async def test_photo_status_returns_lists(client: AsyncClient, tmp_path):
    settings.upload_dir = str(tmp_path)

    tid, did, ah, tokens = await _setup_draft(client)
    img_data = _create_test_image()
    headers = {"Authorization": f"Bearer {tokens[0]}"}

    for _ in range(3):
        resp = await client.post(
            f"/tournaments/{tid}/drafts/{did}/photos/POOL",
            files={"file": ("a.jpg", img_data, "image/jpeg")},
            headers=headers,
        )
        assert resp.status_code == 201
    await client.post(
        f"/tournaments/{tid}/drafts/{did}/photos/DECK",
        files={"file": ("d.jpg", img_data, "image/jpeg")},
        headers=headers,
    )

    status = await client.get(
        f"/tournaments/{tid}/drafts/{did}/photos/status", headers=ah
    )
    assert status.status_code == 200
    body = status.json()
    # This player has 3 POOL photos and 1 DECK photo — they count as one ready player
    # for pool_deck_ready; other 3 players are not ready.
    assert body["pool_deck_ready"] == 1
    player0 = next(p for p in body["players"] if len(p["pool"]) == 3)
    assert len(player0["deck"]) == 1
    assert player0["returned"] == []


async def test_serve_upload(client: AsyncClient, tmp_path):
    settings.upload_dir = str(tmp_path)

    tid, did, ah, tokens = await _setup_draft(client)
    img_data = _create_test_image()

    upload = await client.post(
        f"/tournaments/{tid}/drafts/{did}/photos/DECK",
        files={"file": ("test.jpg", img_data, "image/jpeg")},
        headers={"Authorization": f"Bearer {tokens[0]}"},
    )
    filename = upload.json()["filename"]

    resp = await client.get(f"/uploads/{filename}")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/jpeg"
