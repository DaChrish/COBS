import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cobs.auth.dependencies import require_admin
from cobs.database import get_db
from cobs.logic.ws_manager import manager
from cobs.models.draft import Draft, Pod
from cobs.models.user import User
from cobs.schemas.timer import TimerSetRequest

router = APIRouter(tags=["timer"])


@router.post("/tournaments/{tournament_id}/pods/{pod_id}/timer")
async def set_timer(
    tournament_id: uuid.UUID,
    pod_id: uuid.UUID,
    body: TimerSetRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Pod).where(Pod.id == pod_id))
    pod = result.scalar_one_or_none()
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    if body.minutes and body.minutes > 0:
        pod.timer_ends_at = datetime.now(timezone.utc) + timedelta(minutes=body.minutes)
    else:
        pod.timer_ends_at = None

    # Read draft_id before commit (SQLAlchemy expires attributes after commit)
    draft_id = pod.draft_id
    pod_id_str = str(pod.id)
    timer_ends_at = pod.timer_ends_at

    await db.commit()
    await db.refresh(pod)

    # Look up tournament_id from pod -> draft for broadcast
    draft_result = await db.execute(select(Draft).where(Draft.id == draft_id))
    draft = draft_result.scalar_one()
    await manager.broadcast(
        str(draft.tournament_id),
        "timer_update",
        {
            "pod_id": pod_id_str,
            "timer_ends_at": timer_ends_at.isoformat() if timer_ends_at else None,
        },
    )

    return {
        "pod_id": str(pod.id),
        "timer_ends_at": pod.timer_ends_at.isoformat() if pod.timer_ends_at else None,
    }
