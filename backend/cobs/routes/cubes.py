import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cobs.auth.dependencies import require_admin
from cobs.database import get_db
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
    existing = await db.execute(select(Cube).where(Cube.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Cube name already exists")

    cube = Cube(name=body.name, description=body.description, image_url=body.image_url)
    db.add(cube)
    await db.commit()
    await db.refresh(cube)
    return cube


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

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cube, field, value)

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
