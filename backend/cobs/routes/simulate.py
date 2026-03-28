import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cobs.auth.dependencies import require_admin
from cobs.database import get_db
from cobs.logic.simulate import generate_match_results
from cobs.models.draft import Draft, Pod
from cobs.models.match import Match
from cobs.models.tournament import Tournament, TournamentPlayer
from cobs.models.user import User

router = APIRouter(
    prefix="/test/tournaments/{tournament_id}",
    tags=["test"],
)


class SimulateResultsRequest(BaseModel):
    with_conflicts: bool = False


class SimulateResultsResponse(BaseModel):
    reported: int
    conflicts: int


async def _get_test_tournament(
    tournament_id: uuid.UUID, db: AsyncSession
) -> Tournament:
    result = await db.execute(
        select(Tournament).where(Tournament.id == tournament_id)
    )
    tournament = result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if not tournament.is_test:
        raise HTTPException(status_code=400, detail="Not a test tournament")
    return tournament


@router.post("/simulate-results", response_model=SimulateResultsResponse)
async def simulate_results(
    tournament_id: uuid.UUID,
    body: SimulateResultsRequest = SimulateResultsRequest(),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Simulate match results for the latest draft of a test tournament."""
    tournament = await _get_test_tournament(tournament_id, db)

    # Find latest draft by round_number desc
    draft_result = await db.execute(
        select(Draft)
        .where(Draft.tournament_id == tournament_id)
        .order_by(Draft.round_number.desc())
    )
    draft = draft_result.scalars().first()
    if not draft:
        return SimulateResultsResponse(reported=0, conflicts=0)

    # Find open matches (unreported, non-bye) in that draft
    open_matches_result = await db.execute(
        select(Match)
        .join(Pod)
        .where(
            Pod.draft_id == draft.id,
            Match.reported.is_(False),
            Match.is_bye.is_(False),
            Match.has_conflict.is_(False),
        )
    )
    open_matches = open_matches_result.scalars().all()

    if not open_matches:
        return SimulateResultsResponse(reported=0, conflicts=0)

    # Determine current swiss round from open matches
    current_swiss_round = open_matches[0].swiss_round

    # Determine seed
    seed = (tournament.seed or 0) + current_swiss_round

    # Generate simulated results
    match_ids = [str(m.id) for m in open_matches]
    sim_results = generate_match_results(match_ids, seed, body.with_conflicts)

    # Build a lookup from match id to match object
    match_by_id = {str(m.id): m for m in open_matches}

    reported_count = 0
    conflict_count = 0

    for result in sim_results:
        match = match_by_id[result["match_id"]]

        # Set reported fields from simulation
        match.p1_reported_p1_wins = result["p1_report"]["p1_wins"]
        match.p1_reported_p2_wins = result["p1_report"]["p2_wins"]
        match.p2_reported_p1_wins = result["p2_report"]["p1_wins"]
        match.p2_reported_p2_wins = result["p2_report"]["p2_wins"]

        if result["has_conflict"]:
            match.has_conflict = True
            conflict_count += 1
        else:
            # Finalize match
            match.player1_wins = result["p1_wins"]
            match.player2_wins = result["p2_wins"]
            match.reported = True
            match.has_conflict = False

            # Update player points
            p1_result = await db.execute(
                select(TournamentPlayer).where(
                    TournamentPlayer.id == match.player1_id
                )
            )
            tp1 = p1_result.scalar_one()
            tp1.game_wins += match.player1_wins
            tp1.game_losses += match.player2_wins

            if match.player2_id:
                p2_result = await db.execute(
                    select(TournamentPlayer).where(
                        TournamentPlayer.id == match.player2_id
                    )
                )
                tp2 = p2_result.scalar_one()
                tp2.game_wins += match.player2_wins
                tp2.game_losses += match.player1_wins

                if match.player1_wins > match.player2_wins:
                    tp1.match_points += 3
                elif match.player2_wins > match.player1_wins:
                    tp2.match_points += 3
                else:
                    tp1.match_points += 1
                    tp2.match_points += 1

            reported_count += 1

    await db.commit()

    return SimulateResultsResponse(
        reported=reported_count, conflicts=conflict_count
    )
