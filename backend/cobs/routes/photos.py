import io
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cobs.auth.dependencies import get_current_user, require_admin
from cobs.config import settings
from cobs.database import get_db
from cobs.models.draft import Draft, Pod, PodPlayer
from cobs.models.photo import DraftPhoto, PhotoType
from cobs.models.tournament import TournamentPlayer
from cobs.models.user import User
from cobs.schemas.photo import DraftPhotoStatusResponse, PhotoResponse, PlayerPhotoStatus

router = APIRouter(tags=["photos"])


@router.post(
    "/tournaments/{tournament_id}/drafts/{draft_id}/photos/{photo_type}",
    response_model=PhotoResponse,
    status_code=201,
)
async def upload_photo(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    photo_type: PhotoType,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify draft exists
    draft_result = await db.execute(
        select(Draft).where(Draft.id == draft_id, Draft.tournament_id == tournament_id)
    )
    if not draft_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Draft not found")

    # Find tournament player
    tp_result = await db.execute(
        select(TournamentPlayer).where(
            TournamentPlayer.tournament_id == tournament_id,
            TournamentPlayer.user_id == user.id,
        )
    )
    tp = tp_result.scalar_one_or_none()
    if not tp:
        raise HTTPException(status_code=403, detail="Not a participant")

    # Read file content
    content = await file.read()
    if len(content) > settings.max_upload_size:
        raise HTTPException(status_code=400, detail="File too large (max 25MB)")

    # Process image with Pillow
    try:
        img = Image.open(io.BytesIO(content))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    # Auto-rotate based on EXIF
    img = ImageOps.exif_transpose(img)

    # Resize if too large
    max_dim = settings.max_image_dimension
    if img.width > max_dim or img.height > max_dim:
        img.thumbnail((max_dim, max_dim), Image.LANCZOS)

    # Convert to RGB JPEG
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    # Save to disk
    os.makedirs(settings.upload_dir, exist_ok=True)
    filename = f"{uuid.uuid4()}.jpg"
    filepath = os.path.join(settings.upload_dir, filename)

    img.save(filepath, "JPEG", quality=80)

    # Upsert database record
    existing = await db.execute(
        select(DraftPhoto).where(
            DraftPhoto.draft_id == draft_id,
            DraftPhoto.tournament_player_id == tp.id,
            DraftPhoto.photo_type == photo_type,
        )
    )
    photo = existing.scalar_one_or_none()

    if photo:
        # Delete old file
        old_path = os.path.join(settings.upload_dir, photo.filename)
        if os.path.exists(old_path):
            os.remove(old_path)
        photo.filename = filename
    else:
        photo = DraftPhoto(
            draft_id=draft_id,
            tournament_player_id=tp.id,
            photo_type=photo_type,
            filename=filename,
        )
        db.add(photo)

    await db.commit()
    await db.refresh(photo)

    return PhotoResponse(
        id=photo.id,
        draft_id=photo.draft_id,
        tournament_player_id=photo.tournament_player_id,
        photo_type=photo.photo_type,
        filename=photo.filename,
        url=f"/uploads/{photo.filename}",
    )


@router.get(
    "/tournaments/{tournament_id}/drafts/{draft_id}/photos/status",
    response_model=DraftPhotoStatusResponse,
)
async def draft_photo_status(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Verify draft exists
    draft_result = await db.execute(
        select(Draft).where(Draft.id == draft_id, Draft.tournament_id == tournament_id)
    )
    if not draft_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Draft not found")

    # Load all PodPlayers for the draft via Pod join
    pp_result = await db.execute(
        select(PodPlayer)
        .join(Pod, PodPlayer.pod_id == Pod.id)
        .where(Pod.draft_id == draft_id)
        .options(selectinload(PodPlayer.tournament_player).selectinload(TournamentPlayer.user))
    )
    pod_players = pp_result.scalars().all()

    # Load all DraftPhotos for the draft
    photo_result = await db.execute(
        select(DraftPhoto).where(DraftPhoto.draft_id == draft_id)
    )
    photos = photo_result.scalars().all()

    # Index photos by (tournament_player_id, photo_type) → URL
    photo_index: dict[tuple[uuid.UUID, PhotoType], str] = {}
    for photo in photos:
        photo_index[(photo.tournament_player_id, photo.photo_type)] = f"/uploads/{photo.filename}"

    # Build PlayerPhotoStatus for each player
    players: list[PlayerPhotoStatus] = []
    pool_deck_ready = 0
    returned_ready = 0

    for pp in pod_players:
        tp = pp.tournament_player
        pool_url = photo_index.get((tp.id, PhotoType.POOL))
        deck_url = photo_index.get((tp.id, PhotoType.DECK))
        returned_url = photo_index.get((tp.id, PhotoType.RETURNED))

        players.append(
            PlayerPhotoStatus(
                tournament_player_id=tp.id,
                user_id=tp.user_id,
                username=tp.user.username,
                pool=pool_url,
                deck=deck_url,
                returned=returned_url,
            )
        )

        if pool_url and deck_url:
            pool_deck_ready += 1
        if returned_url:
            returned_ready += 1

    return DraftPhotoStatusResponse(
        total_players=len(players),
        pool_deck_ready=pool_deck_ready,
        returned_ready=returned_ready,
        players=players,
    )


@router.get("/uploads/{filename}")
async def serve_upload(filename: str):
    # Prevent path traversal
    safe_name = os.path.basename(filename)
    filepath = os.path.join(settings.upload_dir, safe_name)
    if not filepath.startswith(os.path.abspath(settings.upload_dir)):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath, media_type="image/jpeg")
