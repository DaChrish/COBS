import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from cobs.auth.dependencies import get_current_user
from cobs.database import get_db
from cobs.models.cube import TournamentCube
from cobs.models.tournament import Tournament, TournamentPlayer, TournamentStatus
from cobs.models.user import User
from cobs.models.vote import CubeVote, VoteType
from cobs.schemas.vote import VoteBulkUpdate, VoteResponse

router = APIRouter(prefix="/tournaments/{tournament_id}/votes", tags=["votes"])

async def _get_tournament_player(
    tournament_id: uuid.UUID, user: User, db: AsyncSession
) -> TournamentPlayer:
    result = await db.execute(
        select(TournamentPlayer).where(
            TournamentPlayer.tournament_id == tournament_id,
            TournamentPlayer.user_id == user.id,
        )
    )
    tp = result.scalar_one_or_none()
    if not tp:
        raise HTTPException(status_code=404, detail="Not a participant in this tournament")
    return tp

@router.get("", response_model=list[VoteResponse])
async def get_votes(
    tournament_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tp = await _get_tournament_player(tournament_id, user, db)
    result = await db.execute(
        select(CubeVote)
        .where(CubeVote.tournament_player_id == tp.id)
        .options(selectinload(CubeVote.tournament_cube).selectinload(TournamentCube.cube))
    )
    votes = result.scalars().all()
    return [
        VoteResponse(
            tournament_cube_id=v.tournament_cube_id,
            cube_name=v.tournament_cube.cube.name,
            vote=v.vote,
        )
        for v in votes
    ]

@router.put("")
async def update_votes(
    tournament_id: uuid.UUID,
    body: VoteBulkUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    t_result = await db.execute(select(Tournament).where(Tournament.id == tournament_id))
    tournament = t_result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if tournament.status != TournamentStatus.VOTING:
        raise HTTPException(status_code=400, detail="Voting is not open")

    tp = await _get_tournament_player(tournament_id, user, db)

    for vote_update in body.votes:
        result = await db.execute(
            select(CubeVote).where(
                CubeVote.tournament_player_id == tp.id,
                CubeVote.tournament_cube_id == vote_update.tournament_cube_id,
            )
        )
        vote = result.scalar_one_or_none()
        if vote:
            vote.vote = vote_update.vote
        else:
            db.add(CubeVote(
                tournament_player_id=tp.id,
                tournament_cube_id=vote_update.tournament_cube_id,
                vote=vote_update.vote,
            ))

    await db.commit()
    return {"ok": True}
