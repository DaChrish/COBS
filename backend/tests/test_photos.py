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


async def test_upload_replaces_existing(client: AsyncClient, tmp_path):
    settings.upload_dir = str(tmp_path)

    tid, did, ah, tokens = await _setup_draft(client)
    img_data = _create_test_image()
    headers = {"Authorization": f"Bearer {tokens[0]}"}

    r1 = await client.post(
        f"/tournaments/{tid}/drafts/{did}/photos/POOL",
        files={"file": ("test.jpg", img_data, "image/jpeg")},
        headers=headers,
    )
    filename1 = r1.json()["filename"]

    r2 = await client.post(
        f"/tournaments/{tid}/drafts/{did}/photos/POOL",
        files={"file": ("test2.jpg", img_data, "image/jpeg")},
        headers=headers,
    )
    filename2 = r2.json()["filename"]

    # Should be different files (old one deleted)
    assert filename1 != filename2
    assert not os.path.exists(os.path.join(str(tmp_path), filename1))
    assert os.path.exists(os.path.join(str(tmp_path), filename2))


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
