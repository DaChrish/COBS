import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cobs.database import get_db
from cobs.logic.standings import calculate_standings
from cobs.logic.swiss import MatchResult
from cobs.models.draft import Draft, Pod
from cobs.models.match import Match
from cobs.models.tournament import Tournament, TournamentPlayer
from cobs.schemas.standings import StandingsEntryResponse

router = APIRouter(prefix="/tournaments/{tournament_id}/standings", tags=["standings"])


@router.get("", response_model=list[StandingsEntryResponse])
async def get_standings(
    tournament_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    # Verify tournament exists
    t_result = await db.execute(
        select(Tournament).where(Tournament.id == tournament_id)
    )
    if not t_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tournament not found")

    # Get all players
    tp_result = await db.execute(
        select(TournamentPlayer)
        .where(TournamentPlayer.tournament_id == tournament_id)
        .options(selectinload(TournamentPlayer.user))
    )
    tournament_players = tp_result.scalars().all()
    tp_map = {str(tp.id): tp for tp in tournament_players}

    # Get all reported matches
    match_result = await db.execute(
        select(Match)
        .join(Pod)
        .join(Draft)
        .where(Draft.tournament_id == tournament_id, Match.reported.is_(True))
    )
    matches = match_result.scalars().all()

    results = [
        MatchResult(
            player1_id=str(m.player1_id),
            player2_id=str(m.player2_id) if m.player2_id else None,
            player1_wins=m.player1_wins,
            player2_wins=m.player2_wins,
            is_bye=m.is_bye,
        )
        for m in matches
    ]

    dropped_ids = {str(tp.id) for tp in tournament_players if tp.dropped}
    player_ids = [str(tp.id) for tp in tournament_players]

    entries = calculate_standings(player_ids, results, dropped_ids)

    return [
        StandingsEntryResponse(
            player_id=uuid.UUID(e.player_id),
            username=tp_map[e.player_id].user.username,
            match_points=e.match_points,
            match_wins=e.match_wins,
            match_losses=e.match_losses,
            match_draws=e.match_draws,
            game_wins=e.game_wins,
            game_losses=e.game_losses,
            omw_percent=e.omw_percent,
            gw_percent=e.gw_percent,
            ogw_percent=e.ogw_percent,
            dropped=e.dropped,
        )
        for e in entries
    ]
