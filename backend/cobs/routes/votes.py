import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from cobs.auth.dependencies import get_current_user, require_admin
from cobs.database import get_db
from cobs.models.cube import Cube, TournamentCube
from cobs.models.tournament import Tournament, TournamentPlayer, TournamentStatus
from cobs.models.user import User
from cobs.models.vote import CubeVote, VoteType
from cobs.schemas.vote import CubeVoteSummary, VoteBulkUpdate, VoteResponse, VoteSummaryEntry

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

@router.get("/summary", response_model=list[CubeVoteSummary])
async def get_vote_summary(
    tournament_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get vote summary for all cubes in tournament (admin only)."""
    # Load tournament cubes
    tc_result = await db.execute(
        select(TournamentCube)
        .where(TournamentCube.tournament_id == tournament_id)
        .options(selectinload(TournamentCube.cube))
    )
    tournament_cubes = tc_result.scalars().all()

    # Load all votes with player usernames
    vote_result = await db.execute(
        select(CubeVote)
        .join(TournamentPlayer)
        .where(TournamentPlayer.tournament_id == tournament_id)
        .options(
            selectinload(CubeVote.tournament_player).selectinload(TournamentPlayer.user),
        )
    )
    all_votes = vote_result.scalars().all()

    # Group by tournament_cube_id
    votes_by_tc: dict[uuid.UUID, list] = {}
    for v in all_votes:
        votes_by_tc.setdefault(v.tournament_cube_id, []).append(v)

    summaries = []
    for tc in tournament_cubes:
        tc_votes = votes_by_tc.get(tc.id, [])
        desired = sum(1 for v in tc_votes if v.vote.value == "DESIRED")
        neutral = sum(1 for v in tc_votes if v.vote.value == "NEUTRAL")
        avoid = sum(1 for v in tc_votes if v.vote.value == "AVOID")

        vote_entries = [
            VoteSummaryEntry(username=v.tournament_player.user.username, vote=v.vote.value)
            for v in sorted(tc_votes, key=lambda v: {"DESIRED": 0, "NEUTRAL": 1, "AVOID": 2}[v.vote.value])
        ]

        summaries.append(CubeVoteSummary(
            tournament_cube_id=tc.id,
            cube_name=tc.cube.name,
            desired=desired,
            neutral=neutral,
            avoid=avoid,
            votes=vote_entries,
        ))

    return summaries


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
