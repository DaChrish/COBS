import io
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cobs.auth.dependencies import get_current_user
from cobs.config import settings
from cobs.database import get_db
from cobs.models.draft import Draft
from cobs.models.photo import DraftPhoto, PhotoType
from cobs.models.tournament import TournamentPlayer
from cobs.models.user import User
from cobs.schemas.photo import PhotoResponse

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
