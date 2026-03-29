import random
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cobs.auth.dependencies import require_admin
from cobs.database import get_db
from cobs.logic.optimizer import CubeInput, OptimizerConfig, PlayerInput, optimize_pods
from cobs.logic.pdf import generate_pods_pdf
from cobs.logic.pod_sizes import calculate_pod_sizes
from cobs.models.cube import TournamentCube
from cobs.models.draft import Draft, DraftStatus, Pod, PodPlayer
from cobs.models.photo import DraftPhoto, PhotoType
from cobs.models.match import Match
from cobs.models.tournament import Tournament, TournamentPlayer, TournamentStatus
from cobs.models.user import User
from cobs.models.vote import CubeVote
from cobs.schemas.draft import DraftCreate, DraftResponse, PodPlayerResponse, PodResponse
from cobs.models.vote import CubeVote as CubeVoteModel

router = APIRouter(prefix="/tournaments/{tournament_id}/drafts", tags=["drafts"])


@router.get("/{draft_id}/pods/pdf")
async def get_pods_pdf(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Generate pods overview PDF with table numbers and seats."""
    result = await db.execute(
        select(Draft)
        .where(Draft.id == draft_id, Draft.tournament_id == tournament_id)
        .options(
            selectinload(Draft.pods)
            .selectinload(Pod.players)
            .selectinload(PodPlayer.tournament_player)
            .selectinload(TournamentPlayer.user),
            selectinload(Draft.pods)
            .selectinload(Pod.tournament_cube)
            .selectinload(TournamentCube.cube),
        )
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    # Get tournament name
    t_result = await db.execute(select(Tournament).where(Tournament.id == tournament_id))
    tournament = t_result.scalar_one()

    pods_data = []
    for pod in sorted(draft.pods, key=lambda p: p.pod_number):
        cube_name = pod.tournament_cube.cube.name if pod.tournament_cube else "?"
        players = [
            {"seat": pp.seat_number, "username": pp.tournament_player.user.username}
            for pp in sorted(pod.players, key=lambda p: p.seat_number)
        ]
        pods_data.append({
            "table": pod.pod_number,
            "pod_name": cube_name,
            "players": players,
        })

    round_label = f"Runde {draft.round_number} - Pods"
    pdf_bytes = generate_pods_pdf(tournament.name, round_label, pods_data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="pods-runde{draft.round_number}.pdf"'},
    )


def _draft_load_options():
    return [
        selectinload(Draft.pods)
        .selectinload(Pod.players)
        .selectinload(PodPlayer.tournament_player)
        .selectinload(TournamentPlayer.user),
        selectinload(Draft.pods)
        .selectinload(Pod.players)
        .selectinload(PodPlayer.tournament_player)
        .selectinload(TournamentPlayer.votes),
        selectinload(Draft.pods)
        .selectinload(Pod.tournament_cube)
        .selectinload(TournamentCube.cube),
    ]


@router.get("", response_model=list[DraftResponse])
async def list_drafts(
    tournament_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Draft)
        .where(Draft.tournament_id == tournament_id)
        .options(*_draft_load_options())
        .order_by(Draft.round_number)
    )
    drafts = result.scalars().all()
    return [_draft_to_response(d) for d in drafts]


@router.get("/{draft_id}", response_model=DraftResponse)
async def get_draft(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Draft)
        .where(Draft.id == draft_id, Draft.tournament_id == tournament_id)
        .options(*_draft_load_options())
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _draft_to_response(draft)


@router.post("", response_model=DraftResponse, status_code=201)
async def create_draft(
    tournament_id: uuid.UUID,
    body: DraftCreate = DraftCreate(),
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

    if tournament.status not in (TournamentStatus.VOTING, TournamentStatus.DRAFTING):
        raise HTTPException(status_code=400, detail="Tournament not in VOTING or DRAFTING status")

    # Determine round number
    existing = await db.execute(
        select(Draft)
        .where(Draft.tournament_id == tournament_id)
        .order_by(Draft.round_number.desc())
    )
    last_draft = existing.scalars().first()
    round_number = (last_draft.round_number + 1) if last_draft else 1

    # Check RETURNED photos from previous draft
    if last_draft and not body.skip_photo_check:
        pp_result = await db.execute(
            select(PodPlayer).join(Pod).where(Pod.draft_id == last_draft.id)
        )
        player_ids = [pp.tournament_player_id for pp in pp_result.scalars().all()]

        if player_ids:
            returned_result = await db.execute(
                select(DraftPhoto).where(
                    DraftPhoto.draft_id == last_draft.id,
                    DraftPhoto.tournament_player_id.in_(player_ids),
                    DraftPhoto.photo_type == PhotoType.RETURNED,
                )
            )
            returned_photos = {p.tournament_player_id for p in returned_result.scalars().all()}
            missing = [pid for pid in player_ids if pid not in returned_photos]

            if missing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing RETURNED photos for {len(missing)} player(s) from previous draft. Use skip_photo_check to override.",
                )

    if round_number > tournament.max_rounds:
        raise HTTPException(status_code=400, detail="Max rounds reached")

    # Load active players with votes
    tp_result = await db.execute(
        select(TournamentPlayer)
        .where(
            TournamentPlayer.tournament_id == tournament_id,
            TournamentPlayer.dropped.is_(False),
        )
        .options(
            selectinload(TournamentPlayer.votes).selectinload(CubeVote.tournament_cube),
            selectinload(TournamentPlayer.user),
        )
    )
    tournament_players = tp_result.scalars().all()

    if len(tournament_players) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 active players")

    # Load cubes
    tc_result = await db.execute(
        select(TournamentCube)
        .where(TournamentCube.tournament_id == tournament_id)
        .options(selectinload(TournamentCube.cube))
    )
    tournament_cubes = tc_result.scalars().all()
    tc_by_cube_id = {str(tc.cube_id): tc for tc in tournament_cubes}

    if not tournament_cubes:
        raise HTTPException(status_code=400, detail="No cubes in tournament")

    # Determine used cube IDs from previous drafts
    used_cube_ids: set[str] = set()
    if last_draft:
        prev_pods_result = await db.execute(
            select(Pod)
            .join(Draft)
            .where(Draft.tournament_id == tournament_id)
        )
        for pod in prev_pods_result.scalars().all():
            tc = await db.execute(
                select(TournamentCube).where(TournamentCube.id == pod.tournament_cube_id)
            )
            tc_obj = tc.scalar_one_or_none()
            if tc_obj:
                used_cube_ids.add(str(tc_obj.cube_id))

    # Count prior AVOID assignments per player
    prior_avoid_counts: dict[str, int] = {}
    if last_draft:
        for tp in tournament_players:
            count = 0
            # Check all previous pod assignments for this player
            pp_result = await db.execute(
                select(PodPlayer)
                .join(Pod)
                .join(Draft)
                .where(
                    Draft.tournament_id == tournament_id,
                    PodPlayer.tournament_player_id == tp.id,
                )
                .options(
                    selectinload(PodPlayer.pod)
                    .selectinload(Pod.tournament_cube)
                )
            )
            for pp in pp_result.scalars().all():
                tc = pp.pod.tournament_cube
                cube_id_str = str(tc.cube_id)
                # Check player's vote for this cube
                for v in tp.votes:
                    if str(v.tournament_cube.cube_id) == cube_id_str and v.vote.value == "AVOID":
                        count += 1
            prior_avoid_counts[str(tp.id)] = count

    # Build optimizer inputs
    pod_sizes = calculate_pod_sizes(len(tournament_players))

    optimizer_players = []
    tp_by_id: dict[str, TournamentPlayer] = {}
    for tp in tournament_players:
        votes_dict: dict[str, str] = {}
        for v in tp.votes:
            votes_dict[str(v.tournament_cube.cube_id)] = v.vote.value
        optimizer_players.append(PlayerInput(
            id=str(tp.id),
            match_points=tp.match_points,
            votes=votes_dict,
            prior_avoid_count=prior_avoid_counts.get(str(tp.id), 0),
        ))
        tp_by_id[str(tp.id)] = tp

    # Filter available cubes
    available_cubes = [
        tc for tc in tournament_cubes
        if str(tc.cube_id) not in used_cube_ids
    ]
    if len(available_cubes) < len(pod_sizes):
        # Refill with used cubes
        refill = [tc for tc in tournament_cubes if str(tc.cube_id) in used_cube_ids]
        available_cubes = available_cubes + refill

    optimizer_cubes = [
        CubeInput(id=str(tc.cube_id), max_players=tc.max_players)
        for tc in available_cubes
    ]

    config = OptimizerConfig(
        score_want=body.score_want,
        score_avoid=body.score_avoid,
        score_neutral=body.score_neutral,
        match_point_penalty_weight=body.match_point_penalty_weight,
        early_round_bonus=body.early_round_bonus,
        lower_standing_bonus=body.lower_standing_bonus,
        repeat_avoid_multiplier=body.repeat_avoid_multiplier,
    )

    # Run optimizer
    opt_result = optimize_pods(
        optimizer_players, optimizer_cubes, pod_sizes, round_number, config
    )

    # Create draft + pods + pod_players
    draft = Draft(
        tournament_id=tournament_id,
        round_number=round_number,
        status=DraftStatus.ACTIVE,
    )
    db.add(draft)
    await db.flush()

    for k, (player_ids, cube_id) in enumerate(zip(opt_result.pods, opt_result.cube_ids)):
        # Find tournament_cube by cube_id
        tc = tc_by_cube_id.get(cube_id) if cube_id else None
        if not tc:
            tc = tournament_cubes[0]  # fallback

        pod = Pod(
            draft_id=draft.id,
            tournament_cube_id=tc.id,
            pod_number=k + 1,
            pod_size=len(player_ids),
        )
        db.add(pod)
        await db.flush()

        # Assign seats randomly
        shuffled_ids = list(player_ids)
        random.shuffle(shuffled_ids)
        for seat, pid in enumerate(shuffled_ids, 1):
            pp = PodPlayer(
                pod_id=pod.id,
                tournament_player_id=uuid.UUID(pid),
                seat_number=seat,
            )
            db.add(pp)

    # Update tournament status to DRAFTING
    tournament.status = TournamentStatus.DRAFTING
    await db.commit()

    # Reload draft with relationships
    result = await db.execute(
        select(Draft)
        .where(Draft.id == draft.id)
        .options(
            selectinload(Draft.pods)
            .selectinload(Pod.players)
            .selectinload(PodPlayer.tournament_player)
            .selectinload(TournamentPlayer.user),
            selectinload(Draft.pods)
            .selectinload(Pod.tournament_cube)
            .selectinload(TournamentCube.cube),
        )
    )
    draft = result.scalar_one()
    return _draft_to_response(draft)


def _draft_to_response(draft: Draft) -> DraftResponse:
    pods = []
    for pod in sorted(draft.pods, key=lambda p: p.pod_number):
        tc_id = pod.tournament_cube_id
        players = []
        for pp in sorted(pod.players, key=lambda p: p.seat_number):
            vote = None
            for v in pp.tournament_player.votes:
                if v.tournament_cube_id == tc_id:
                    vote = v.vote.value
                    break
            players.append(PodPlayerResponse(
                tournament_player_id=pp.tournament_player_id,
                username=pp.tournament_player.user.username,
                seat_number=pp.seat_number,
                vote=vote,
            ))
        pods.append(PodResponse(
            id=pod.id,
            pod_number=pod.pod_number,
            pod_size=pod.pod_size,
            cube_name=pod.tournament_cube.cube.name,
            cube_id=pod.tournament_cube.cube_id,
            timer_ends_at=pod.timer_ends_at,
            players=players,
        ))
    return DraftResponse(
        id=draft.id,
        round_number=draft.round_number,
        status=draft.status,
        pods=pods,
    )
