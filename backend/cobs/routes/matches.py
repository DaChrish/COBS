import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel as PydanticBaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cobs.auth.dependencies import get_current_user, require_admin
from cobs.database import get_db
from cobs.logic.swiss import generate_swiss_pairings
from cobs.logic.ws_manager import manager
from cobs.models.draft import Draft, Pod, PodPlayer
from cobs.models.match import Match
from cobs.models.photo import DraftPhoto, PhotoType
from cobs.models.tournament import TournamentPlayer
from cobs.models.user import User
from cobs.schemas.match import MatchReportRequest, MatchResolveRequest, MatchResponse

router = APIRouter(
    prefix="/tournaments/{tournament_id}/drafts/{draft_id}",
    tags=["matches"],
)


class PairingsRequest(PydanticBaseModel):
    skip_photo_check: bool = False


@router.post("/pairings", response_model=list[MatchResponse], status_code=201)
async def generate_pairings(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    body: PairingsRequest = PairingsRequest(),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Generate Swiss pairings for the next round within each pod."""
    draft = await _get_draft(draft_id, tournament_id, db)

    # Check for unresolved conflicts
    conflict_result = await db.execute(
        select(Match)
        .join(Pod)
        .where(Pod.draft_id == draft_id, Match.has_conflict.is_(True))
    )
    if conflict_result.scalars().first():
        raise HTTPException(status_code=400, detail="Unresolved match conflicts exist")

    # Check for unreported non-bye matches
    unreported_result = await db.execute(
        select(Match)
        .join(Pod)
        .where(
            Pod.draft_id == draft_id,
            Match.reported.is_(False),
            Match.is_bye.is_(False),
        )
    )
    if unreported_result.scalars().first():
        raise HTTPException(status_code=400, detail="Unreported matches from previous round")

    # Check for POOL+DECK photos (only before first swiss round)
    if not body.skip_photo_check:
        existing_matches_check = await db.execute(
            select(Match).join(Pod).where(Pod.draft_id == draft_id)
        )
        if not existing_matches_check.scalars().first():
            # First round — check photos
            pp_result = await db.execute(
                select(PodPlayer).join(Pod).where(Pod.draft_id == draft_id)
            )
            player_ids = [pp.tournament_player_id for pp in pp_result.scalars().all()]

            if player_ids:
                photo_result = await db.execute(
                    select(DraftPhoto).where(
                        DraftPhoto.draft_id == draft_id,
                        DraftPhoto.tournament_player_id.in_(player_ids),
                        DraftPhoto.photo_type.in_([PhotoType.POOL, PhotoType.DECK]),
                    )
                )
                photos = photo_result.scalars().all()
                photo_set = {(p.tournament_player_id, p.photo_type) for p in photos}

                missing = []
                for pid in player_ids:
                    if (pid, PhotoType.POOL) not in photo_set or (pid, PhotoType.DECK) not in photo_set:
                        missing.append(str(pid))

                if missing:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Missing POOL/DECK photos for {len(missing)} player(s). Use skip_photo_check to override.",
                    )

    # Determine current swiss round
    existing_matches = await db.execute(
        select(Match).join(Pod).where(Pod.draft_id == draft_id)
    )
    all_matches = existing_matches.scalars().all()
    current_round = max((m.swiss_round for m in all_matches), default=0) + 1

    if current_round > 3:
        raise HTTPException(status_code=400, detail="Max 3 swiss rounds per draft")

    # Generate pairings per pod
    pods_result = await db.execute(
        select(Pod)
        .where(Pod.draft_id == draft_id)
        .options(
            selectinload(Pod.players)
            .selectinload(PodPlayer.tournament_player)
            .selectinload(TournamentPlayer.user),
        )
    )
    pods = pods_result.scalars().all()

    new_matches: list[Match] = []

    for pod in pods:
        # Get players in this pod
        players = [
            {"id": str(pp.tournament_player_id), "match_points": pp.tournament_player.match_points}
            for pp in pod.players
        ]

        # Get previous matches for this pod
        prev_result = await db.execute(
            select(Match).where(Match.pod_id == pod.id)
        )
        prev_matches = [
            {"player1_id": str(m.player1_id), "player2_id": str(m.player2_id) if m.player2_id else None}
            for m in prev_result.scalars().all()
        ]

        # Get previous byes
        prev_byes = [
            str(m.player1_id)
            for m in (await db.execute(
                select(Match).where(Match.pod_id == pod.id, Match.is_bye.is_(True))
            )).scalars().all()
        ]

        result = generate_swiss_pairings(players, prev_matches, prev_byes)

        for pairing in result.pairings:
            match = Match(
                pod_id=pod.id,
                swiss_round=current_round,
                player1_id=uuid.UUID(pairing.player1_id),
                player2_id=uuid.UUID(pairing.player2_id) if pairing.player2_id else None,
                is_bye=pairing.is_bye,
                reported=pairing.is_bye,  # Byes are auto-reported
                player1_wins=2 if pairing.is_bye else 0,
            )
            if pairing.is_bye:
                # Update player match points for bye
                tp_result = await db.execute(
                    select(TournamentPlayer).where(
                        TournamentPlayer.id == uuid.UUID(pairing.player1_id)
                    )
                )
                tp = tp_result.scalar_one()
                tp.match_points += 3
                tp.game_wins += 2

            db.add(match)
            new_matches.append(match)

    await db.commit()
    await manager.broadcast(str(tournament_id), "pairings_ready", {"draft_id": str(draft_id)})

    # Return all matches for this draft
    return await _get_draft_matches(draft_id, db)


@router.get("/matches", response_model=list[MatchResponse])
async def list_matches(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    return await _get_draft_matches(draft_id, db)


@router.post("/matches/{match_id}/report", response_model=MatchResponse)
async def report_match(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    match_id: uuid.UUID,
    body: MatchReportRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Player self-reports match result."""
    match = await _get_match(match_id, db)

    if match.is_bye:
        raise HTTPException(status_code=400, detail="Cannot report a bye")
    if match.reported:
        raise HTTPException(status_code=400, detail="Match already finalized")

    # Find which player is reporting (scoped to this tournament)
    pod_result = await db.execute(select(Pod).where(Pod.id == match.pod_id))
    pod = pod_result.scalar_one()
    draft_result = await db.execute(select(Draft).where(Draft.id == pod.draft_id))
    draft_obj = draft_result.scalar_one()

    tp_result = await db.execute(
        select(TournamentPlayer).where(
            TournamentPlayer.user_id == user.id,
            TournamentPlayer.tournament_id == draft_obj.tournament_id,
        )
    )
    tp = tp_result.scalar_one_or_none()
    if not tp:
        raise HTTPException(status_code=403, detail="Not a participant")

    if tp.id == match.player1_id:
        match.p1_reported_p1_wins = body.player1_wins
        match.p1_reported_p2_wins = body.player2_wins
    elif tp.id == match.player2_id:
        match.p2_reported_p1_wins = body.player1_wins
        match.p2_reported_p2_wins = body.player2_wins
    else:
        raise HTTPException(status_code=403, detail="Not in this match")

    # Check if both reported and if they agree
    if (
        match.p1_reported_p1_wins is not None
        and match.p2_reported_p1_wins is not None
    ):
        if (
            match.p1_reported_p1_wins == match.p2_reported_p1_wins
            and match.p1_reported_p2_wins == match.p2_reported_p2_wins
        ):
            # Agreement — finalize
            match.player1_wins = match.p1_reported_p1_wins
            match.player2_wins = match.p1_reported_p2_wins
            match.reported = True
            match.has_conflict = False
            await _update_player_points(match, db)
        else:
            match.has_conflict = True

    await db.commit()
    await manager.broadcast(str(tournament_id), "match_reported", {"match_id": str(match_id)})
    await db.refresh(match)
    return await _match_to_response(match, db)


@router.post("/matches/{match_id}/resolve", response_model=MatchResponse)
async def resolve_match(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    match_id: uuid.UUID,
    body: MatchResolveRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin resolves a match conflict or manually sets result."""
    match = await _get_match(match_id, db)

    match.player1_wins = body.player1_wins
    match.player2_wins = body.player2_wins
    match.reported = True
    match.has_conflict = False
    await _update_player_points(match, db)

    await db.commit()
    await db.refresh(match)
    return await _match_to_response(match, db)


async def _update_player_points(match: Match, db: AsyncSession):
    """Update tournament player match points and game records."""
    p1 = await db.execute(
        select(TournamentPlayer).where(TournamentPlayer.id == match.player1_id)
    )
    tp1 = p1.scalar_one()
    tp1.game_wins += match.player1_wins
    tp1.game_losses += match.player2_wins

    if match.player2_id:
        p2 = await db.execute(
            select(TournamentPlayer).where(TournamentPlayer.id == match.player2_id)
        )
        tp2 = p2.scalar_one()
        tp2.game_wins += match.player2_wins
        tp2.game_losses += match.player1_wins

        if match.player1_wins > match.player2_wins:
            tp1.match_points += 3
        elif match.player2_wins > match.player1_wins:
            tp2.match_points += 3
        else:
            tp1.match_points += 1
            tp2.match_points += 1


async def _get_draft(draft_id: uuid.UUID, tournament_id: uuid.UUID, db: AsyncSession) -> Draft:
    result = await db.execute(
        select(Draft).where(Draft.id == draft_id, Draft.tournament_id == tournament_id)
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft


async def _get_match(match_id: uuid.UUID, db: AsyncSession) -> Match:
    result = await db.execute(select(Match).where(Match.id == match_id))
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    return match


async def _get_draft_matches(draft_id: uuid.UUID, db: AsyncSession) -> list[MatchResponse]:
    result = await db.execute(
        select(Match)
        .join(Pod)
        .where(Pod.draft_id == draft_id)
        .options(
            selectinload(Match.player1).selectinload(TournamentPlayer.user),
            selectinload(Match.player2).selectinload(TournamentPlayer.user),
        )
        .order_by(Match.swiss_round, Match.pod_id)
    )
    matches = result.scalars().all()
    return [
        MatchResponse(
            id=m.id,
            pod_id=m.pod_id,
            swiss_round=m.swiss_round,
            player1_id=m.player1_id,
            player1_username=m.player1.user.username,
            player2_id=m.player2_id,
            player2_username=m.player2.user.username if m.player2 else None,
            player1_wins=m.player1_wins,
            player2_wins=m.player2_wins,
            is_bye=m.is_bye,
            reported=m.reported,
            has_conflict=m.has_conflict,
            p1_reported_p1_wins=m.p1_reported_p1_wins,
            p1_reported_p2_wins=m.p1_reported_p2_wins,
            p2_reported_p1_wins=m.p2_reported_p1_wins,
            p2_reported_p2_wins=m.p2_reported_p2_wins,
        )
        for m in matches
    ]


async def _match_to_response(match: Match, db: AsyncSession) -> MatchResponse:
    await db.refresh(match, ["player1", "player2"])
    p1_user = (await db.execute(
        select(TournamentPlayer).where(TournamentPlayer.id == match.player1_id).options(selectinload(TournamentPlayer.user))
    )).scalar_one()
    p2_user = None
    if match.player2_id:
        p2_user = (await db.execute(
            select(TournamentPlayer).where(TournamentPlayer.id == match.player2_id).options(selectinload(TournamentPlayer.user))
        )).scalar_one()

    return MatchResponse(
        id=match.id,
        pod_id=match.pod_id,
        swiss_round=match.swiss_round,
        player1_id=match.player1_id,
        player1_username=p1_user.user.username,
        player2_id=match.player2_id,
        player2_username=p2_user.user.username if p2_user else None,
        player1_wins=match.player1_wins,
        player2_wins=match.player2_wins,
        is_bye=match.is_bye,
        reported=match.reported,
        has_conflict=match.has_conflict,
        p1_reported_p1_wins=match.p1_reported_p1_wins,
        p1_reported_p2_wins=match.p1_reported_p2_wins,
        p2_reported_p1_wins=match.p2_reported_p1_wins,
        p2_reported_p2_wins=match.p2_reported_p2_wins,
    )
