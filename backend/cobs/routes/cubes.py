import io
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image, ImageOps
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cobs.auth.dependencies import require_admin
from cobs.config import settings
from cobs.database import get_db
from cobs.logic.cubecobra import fetch_cubecobra_metadata
from cobs.models.cube import Cube
from cobs.models.user import User
from cobs.schemas.cube import CubeCreate, CubeResponse, CubeUpdate

router = APIRouter(prefix="/cubes", tags=["cubes"])


@router.get("", response_model=list[CubeResponse])
async def list_cubes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cube).order_by(Cube.name))
    return result.scalars().all()


@router.post("", response_model=CubeResponse, status_code=201)
async def create_cube(
    body: CubeCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if body.cubecobra_id:
        # Check if cubecobra_id already exists
        existing = await db.execute(
            select(Cube).where(Cube.cubecobra_id == body.cubecobra_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=409, detail="Cube with this CubeCobra ID already exists"
            )

        try:
            meta = await fetch_cubecobra_metadata(body.cubecobra_id)
        except ValueError as e:
            raise HTTPException(
                status_code=400, detail=f"CubeCobra fetch failed: {e}"
            )

        final_name = body.name or meta["name"]

        # Check name uniqueness
        name_check = await db.execute(
            select(Cube).where(Cube.name == final_name)
        )
        if name_check.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail=f"Cube name '{final_name}' already exists",
            )

        cube = Cube(
            cubecobra_id=body.cubecobra_id,
            name=final_name,
            description=meta.get("description", ""),
            image_url=meta["image_url"],
            artist=meta["artist"],
            max_players=body.max_players if body.max_players is not None else meta.get("max_players"),
        )
    else:
        # Fallback: manual creation (for tests / backwards compat)
        if not body.name:
            raise HTTPException(
                status_code=400,
                detail="Either cubecobra_id or name must be provided",
            )

        existing = await db.execute(select(Cube).where(Cube.name == body.name))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Cube name already exists")

        cube = Cube(
            name=body.name,
            description=body.description,
            image_url=body.image_url,
            artist=body.artist,
            max_players=body.max_players,
        )

    db.add(cube)
    await db.commit()
    await db.refresh(cube)
    return cube


@router.get("/cubecobra/{cubecobra_id}")
async def preview_cubecobra(
    cubecobra_id: str,
    admin: User = Depends(require_admin),
):
    """Preview CubeCobra metadata without creating a cube."""
    try:
        meta = await fetch_cubecobra_metadata(cubecobra_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"CubeCobra fetch failed: {e}")
    return meta


@router.get("/{cube_id}", response_model=CubeResponse)
async def get_cube(cube_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cube).where(Cube.id == cube_id))
    cube = result.scalar_one_or_none()
    if not cube:
        raise HTTPException(status_code=404, detail="Cube not found")
    return cube


@router.patch("/{cube_id}", response_model=CubeResponse)
async def update_cube(
    cube_id: uuid.UUID,
    body: CubeUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Cube).where(Cube.id == cube_id))
    cube = result.scalar_one_or_none()
    if not cube:
        raise HTTPException(status_code=404, detail="Cube not found")

    if body.name is not None:
        cube.name = body.name
    if body.max_players is not None:
        cube.max_players = body.max_players

    await db.commit()
    await db.refresh(cube)
    return cube


@router.post("/{cube_id}/refresh", response_model=CubeResponse)
async def refresh_cube(
    cube_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Re-fetch metadata from CubeCobra."""
    result = await db.execute(select(Cube).where(Cube.id == cube_id))
    cube = result.scalar_one_or_none()
    if not cube:
        raise HTTPException(status_code=404, detail="Cube not found")
    if not cube.cubecobra_id:
        raise HTTPException(status_code=400, detail="Cube has no CubeCobra ID")

    try:
        meta = await fetch_cubecobra_metadata(cube.cubecobra_id)
    except ValueError as e:
        raise HTTPException(
            status_code=400, detail=f"CubeCobra fetch failed: {e}"
        )

    cube.name = meta["name"]
    cube.description = meta.get("description", "")
    cube.image_url = meta["image_url"]
    cube.artist = meta["artist"]
    if meta.get("max_players"):
        cube.max_players = meta["max_players"]

    await db.commit()
    await db.refresh(cube)
    return cube


@router.post("/{cube_id}/image", response_model=CubeResponse)
async def upload_cube_image(
    cube_id: uuid.UUID,
    file: UploadFile = File(...),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Cube).where(Cube.id == cube_id))
    cube = result.scalar_one_or_none()
    if not cube:
        raise HTTPException(status_code=404, detail="Cube not found")

    content = await file.read()
    if len(content) > settings.max_upload_size:
        raise HTTPException(status_code=400, detail="File too large")

    try:
        img = Image.open(io.BytesIO(content))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    img = ImageOps.exif_transpose(img)
    max_dim = settings.max_image_dimension
    if img.width > max_dim or img.height > max_dim:
        img.thumbnail((max_dim, max_dim), Image.LANCZOS)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    os.makedirs(settings.upload_dir, exist_ok=True)
    filename = f"cube-{cube_id}.jpg"
    filepath = os.path.join(settings.upload_dir, filename)
    img.save(filepath, "JPEG", quality=80)

    cube.image_url = f"/uploads/{filename}"
    await db.commit()
    await db.refresh(cube)
    return cube


@router.delete("/{cube_id}", status_code=204)
async def delete_cube(
    cube_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Cube).where(Cube.id == cube_id))
    cube = result.scalar_one_or_none()
    if not cube:
        raise HTTPException(status_code=404, detail="Cube not found")

    await db.delete(cube)
    await db.commit()
