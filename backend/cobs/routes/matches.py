import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel as PydanticBaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cobs.auth.dependencies import get_current_user, require_admin
from cobs.database import get_db
from cobs.logic.pdf import generate_pairings_pdf
from cobs.logic.swiss import generate_swiss_pairings
from cobs.logic.ws_manager import manager
from cobs.models.cube import TournamentCube
from cobs.models.draft import Draft, Pod, PodPlayer
from cobs.models.match import Match
from cobs.models.photo import DraftPhoto, PhotoType
from cobs.models.tournament import Tournament, TournamentPlayer
from cobs.models.user import User
from cobs.schemas.match import MatchReportRequest, MatchResolveRequest, MatchResponse

def _pod_local_points(matches: list, player_ids: list[str]) -> dict[str, int]:
    """Calculate match points earned within a pod's matches only."""
    points: dict[str, int] = {pid: 0 for pid in player_ids}
    for m in matches:
        if not m.reported:
            continue
        p1 = str(m.player1_id)
        p2 = str(m.player2_id) if m.player2_id else None
        if m.is_bye:
            if p1 in points:
                points[p1] += 3
        elif p2:
            if m.player1_wins > m.player2_wins:
                if p1 in points:
                    points[p1] += 3
            elif m.player2_wins > m.player1_wins:
                if p2 in points:
                    points[p2] += 3
            else:
                if p1 in points:
                    points[p1] += 1
                if p2 in points:
                    points[p2] += 1
    return points


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
        # Get previous matches for this pod
        prev_result = await db.execute(
            select(Match).where(Match.pod_id == pod.id)
        )
        prev_matches_list = prev_result.scalars().all()

        # Calculate pod-local match points (not global tournament points)
        player_ids = [str(pp.tournament_player_id) for pp in pod.players]
        local_points = _pod_local_points(prev_matches_list, player_ids)

        players = [
            {"id": str(pp.tournament_player_id), "match_points": local_points.get(str(pp.tournament_player_id), 0), "seat_number": pp.seat_number}
            for pp in pod.players
        ]

        prev_matches = [
            {"player1_id": str(m.player1_id), "player2_id": str(m.player2_id) if m.player2_id else None}
            for m in prev_matches_list
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

    # Clear pod timers for new round
    for pod in pods:
        pod.timer_ends_at = None

    await db.commit()
    await manager.broadcast(str(tournament_id), "pairings_ready", {"draft_id": str(draft_id)})

    # Return all matches for this draft
    return await _get_draft_matches(draft_id, db)


@router.post("/pods/{pod_id}/pairings", response_model=list[MatchResponse], status_code=201)
async def generate_pod_pairings(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    pod_id: uuid.UUID,
    body: PairingsRequest = PairingsRequest(),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Generate Swiss pairings for the next round in a single pod."""
    draft = await _get_draft(draft_id, tournament_id, db)

    # Check for unresolved conflicts in THIS pod
    conflict_result = await db.execute(
        select(Match).where(Match.pod_id == pod_id, Match.has_conflict.is_(True))
    )
    if conflict_result.scalars().first():
        raise HTTPException(status_code=400, detail="Unresolved match conflicts exist in this pod")

    # Check for unreported non-bye matches in THIS pod
    unreported_result = await db.execute(
        select(Match).where(
            Match.pod_id == pod_id,
            Match.reported.is_(False),
            Match.is_bye.is_(False),
        )
    )
    if unreported_result.scalars().first():
        raise HTTPException(status_code=400, detail="Unreported matches from previous round in this pod")

    # Load the specific pod with eager-loaded players
    pod_result = await db.execute(
        select(Pod)
        .where(Pod.id == pod_id, Pod.draft_id == draft_id)
        .options(
            selectinload(Pod.players)
            .selectinload(PodPlayer.tournament_player)
            .selectinload(TournamentPlayer.user),
        )
    )
    pod = pod_result.scalar_one_or_none()
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    # Check for POOL+DECK photos (only before first swiss round for this pod)
    if not body.skip_photo_check:
        existing_pod_matches = await db.execute(
            select(Match).where(Match.pod_id == pod_id)
        )
        if not existing_pod_matches.scalars().first():
            # First round for this pod — check photos
            player_ids = [pp.tournament_player_id for pp in pod.players]
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

    # Determine swiss round for THIS pod
    pod_matches_result = await db.execute(
        select(Match).where(Match.pod_id == pod_id)
    )
    pod_matches = pod_matches_result.scalars().all()
    current_round = max((m.swiss_round for m in pod_matches), default=0) + 1

    if current_round > 3:
        raise HTTPException(status_code=400, detail="Max 3 swiss rounds per pod")

    # Calculate pod-local match points (not global tournament points)
    player_ids = [str(pp.tournament_player_id) for pp in pod.players]
    local_points = _pod_local_points(pod_matches, player_ids)

    players = [
        {"id": str(pp.tournament_player_id), "match_points": local_points.get(str(pp.tournament_player_id), 0), "seat_number": pp.seat_number}
        for pp in pod.players
    ]

    prev_matches = [
        {"player1_id": str(m.player1_id), "player2_id": str(m.player2_id) if m.player2_id else None}
        for m in pod_matches
    ]

    # Get previous byes
    prev_byes = [
        str(m.player1_id)
        for m in (await db.execute(
            select(Match).where(Match.pod_id == pod_id, Match.is_bye.is_(True))
        )).scalars().all()
    ]

    result = generate_swiss_pairings(players, prev_matches, prev_byes)

    new_matches: list[Match] = []
    for pairing in result.pairings:
        match = Match(
            pod_id=pod_id,
            swiss_round=current_round,
            player1_id=uuid.UUID(pairing.player1_id),
            player2_id=uuid.UUID(pairing.player2_id) if pairing.player2_id else None,
            is_bye=pairing.is_bye,
            reported=pairing.is_bye,
            player1_wins=2 if pairing.is_bye else 0,
        )
        if pairing.is_bye:
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

    # Clear only THIS pod's timer
    pod.timer_ends_at = None

    await db.commit()
    await manager.broadcast(str(tournament_id), "pairings_ready", {"draft_id": str(draft_id), "pod_id": str(pod_id)})

    # Return matches for THIS pod
    match_result = await db.execute(
        select(Match)
        .where(Match.pod_id == pod_id)
        .options(
            selectinload(Match.player1).selectinload(TournamentPlayer.user),
            selectinload(Match.player2).selectinload(TournamentPlayer.user),
        )
        .order_by(Match.swiss_round)
    )
    matches = match_result.scalars().all()
    max_round = max((m.swiss_round for m in matches), default=0)
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
            editable=m.swiss_round == max_round,  # just generated, no later draft possible
            p1_reported_p1_wins=m.p1_reported_p1_wins,
            p1_reported_p2_wins=m.p1_reported_p2_wins,
            p2_reported_p1_wins=m.p2_reported_p1_wins,
            p2_reported_p2_wins=m.p2_reported_p2_wins,
        )
        for m in matches
    ]


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

    # Check RETURNED photo requirement on swiss round 3
    if match.swiss_round >= 3:
        returned_check = await db.execute(
            select(DraftPhoto).where(
                DraftPhoto.draft_id == pod.draft_id,
                DraftPhoto.tournament_player_id == tp.id,
                DraftPhoto.photo_type == PhotoType.RETURNED,
            )
        )
        if not returned_check.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="Bitte lade zuerst dein RETURNED Foto hoch bevor du das Ergebnis meldest.",
            )

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
    """Admin resolves a match conflict or manually sets/edits result."""
    match = await _get_match(match_id, db)

    if not await _is_match_editable(match, db):
        raise HTTPException(status_code=400, detail="Match can no longer be edited — next round or draft already started")

    was_reported = match.reported

    match.player1_wins = body.player1_wins
    match.player2_wins = body.player2_wins
    match.reported = True
    match.has_conflict = False

    # Re-aggregate all points for both players across all their pod matches
    await _reaggregate_player_points(match.player1_id, db)
    if match.player2_id:
        await _reaggregate_player_points(match.player2_id, db)

    await db.commit()
    await db.refresh(match)
    return await _match_to_response(match, db)


async def _update_player_points(match: Match, db: AsyncSession):
    """Update tournament player match points and game records (incremental, for player reports)."""
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


async def _reaggregate_player_points(player_id: uuid.UUID, db: AsyncSession):
    """Re-aggregate all match/game points for a player from their match records."""
    tp_result = await db.execute(
        select(TournamentPlayer).where(TournamentPlayer.id == player_id)
    )
    tp = tp_result.scalar_one()

    # Find all reported matches involving this player
    matches_result = await db.execute(
        select(Match).where(
            Match.reported.is_(True),
            (Match.player1_id == player_id) | (Match.player2_id == player_id),
        )
    )
    matches = matches_result.scalars().all()

    match_points = 0
    game_wins = 0
    game_losses = 0

    for m in matches:
        is_p1 = m.player1_id == player_id
        if m.is_bye:
            match_points += 3
            game_wins += 2
        elif is_p1:
            game_wins += m.player1_wins
            game_losses += m.player2_wins
            if m.player1_wins > m.player2_wins:
                match_points += 3
            elif m.player1_wins == m.player2_wins:
                match_points += 1
        else:
            game_wins += m.player2_wins
            game_losses += m.player1_wins
            if m.player2_wins > m.player1_wins:
                match_points += 3
            elif m.player1_wins == m.player2_wins:
                match_points += 1

    tp.match_points = match_points
    tp.game_wins = game_wins
    tp.game_losses = game_losses


async def _is_match_editable(match: Match, db: AsyncSession) -> bool:
    """A match is editable if no subsequent swiss round exists in the same pod,
    and (for the last swiss round) no subsequent draft exists in the tournament."""
    # Check if a later swiss round exists in this pod
    later_round = await db.execute(
        select(Match).where(
            Match.pod_id == match.pod_id,
            Match.swiss_round > match.swiss_round,
        )
    )
    if later_round.scalars().first():
        return False

    # For the latest swiss round: check if a later draft exists
    pod_result = await db.execute(select(Pod).where(Pod.id == match.pod_id))
    pod = pod_result.scalar_one()
    draft_result = await db.execute(select(Draft).where(Draft.id == pod.draft_id))
    draft = draft_result.scalar_one()

    later_draft = await db.execute(
        select(Draft).where(
            Draft.tournament_id == draft.tournament_id,
            Draft.round_number > draft.round_number,
        )
    )
    if later_draft.scalars().first():
        return False

    return True


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

    # Pre-compute editability: a match is editable if no later round exists in its pod
    # Group matches by pod to determine max swiss round per pod
    pod_max_round: dict[uuid.UUID, int] = {}
    for m in matches:
        pod_max_round[m.pod_id] = max(pod_max_round.get(m.pod_id, 0), m.swiss_round)

    # Check if a later draft exists (needed for last-round matches)
    draft_result = await db.execute(select(Draft).where(Draft.id == draft_id))
    draft_obj = draft_result.scalar_one()
    later_draft_result = await db.execute(
        select(Draft).where(
            Draft.tournament_id == draft_obj.tournament_id,
            Draft.round_number > draft_obj.round_number,
        )
    )
    has_later_draft = later_draft_result.scalars().first() is not None

    responses = []
    for m in matches:
        is_latest_round = m.swiss_round == pod_max_round[m.pod_id]
        editable = is_latest_round and not has_later_draft
        responses.append(MatchResponse(
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
            editable=editable,
            p1_reported_p1_wins=m.p1_reported_p1_wins,
            p1_reported_p2_wins=m.p1_reported_p2_wins,
            p2_reported_p1_wins=m.p2_reported_p1_wins,
            p2_reported_p2_wins=m.p2_reported_p2_wins,
        ))
    return responses


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

    editable = await _is_match_editable(match, db)

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
        editable=editable,
        p1_reported_p1_wins=match.p1_reported_p1_wins,
        p1_reported_p2_wins=match.p1_reported_p2_wins,
        p2_reported_p1_wins=match.p2_reported_p1_wins,
        p2_reported_p2_wins=match.p2_reported_p2_wins,
    )


@router.get("/pairings/pdf")
async def get_pairings_pdf(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Load tournament
    t_result = await db.execute(
        select(Tournament).where(Tournament.id == tournament_id)
    )
    tournament = t_result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

    # Verify draft
    draft = await _get_draft(draft_id, tournament_id, db)

    # Load pods with players and cube info
    pods_result = await db.execute(
        select(Pod)
        .where(Pod.draft_id == draft_id)
        .options(
            selectinload(Pod.players)
            .selectinload(PodPlayer.tournament_player)
            .selectinload(TournamentPlayer.user),
            selectinload(Pod.tournament_cube).selectinload(TournamentCube.cube),
        )
        .order_by(Pod.pod_number)
    )
    pods = pods_result.scalars().all()

    # Load matches
    matches_result = await db.execute(
        select(Match)
        .join(Pod)
        .where(Pod.draft_id == draft_id)
        .options(
            selectinload(Match.player1).selectinload(TournamentPlayer.user),
            selectinload(Match.player2).selectinload(TournamentPlayer.user),
        )
        .order_by(Match.pod_id, Match.swiss_round)
    )
    all_matches = matches_result.scalars().all()

    if not all_matches:
        # No matches — return empty pairings PDF
        round_label = f"Draft {draft.round_number} - Runde 1 Pairings"
        pdf_bytes = generate_pairings_pdf(tournament.name, round_label, [])
        return Response(content=pdf_bytes, media_type="application/pdf")

    # Determine current swiss round
    current_round = max(m.swiss_round for m in all_matches)
    current_matches = [m for m in all_matches if m.swiss_round == current_round]

    round_label = f"Draft {draft.round_number} - Runde {current_round} Pairings"

    pods_data = []
    table_number = 1
    for pod in pods:
        pod_matches = [m for m in current_matches if m.pod_id == pod.id and not m.is_bye]
        pod_byes = [m for m in current_matches if m.pod_id == pod.id and m.is_bye]
        cube_name = pod.tournament_cube.cube.name
        matches_data = []
        for m in pod_matches:
            matches_data.append({
                "table": table_number,
                "player1": m.player1.user.username,
                "player2": m.player2.user.username if m.player2 else "\u2014",
            })
            table_number += 1
        byes_data = [m.player1.user.username for m in pod_byes]
        pods_data.append({
            "pod_name": f"Pod {pod.pod_number} \u00b7 {cube_name}",
            "matches": matches_data,
            "byes": byes_data,
        })

    pdf_bytes = generate_pairings_pdf(tournament.name, round_label, pods_data)
    return Response(content=pdf_bytes, media_type="application/pdf")
