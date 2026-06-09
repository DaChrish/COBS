import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cobs.auth.dependencies import require_admin
from cobs.database import get_db
from cobs.logic.batch_simulator import simulate_real_vote_rounds
from cobs.logic.optimizer import CubeInput, OptimizerConfig, PlayerInput, is_infeasible, optimize_pods
from cobs.logic.pod_sizes import calculate_pod_sizes
from cobs.models.cube import TournamentCube
from cobs.models.simulation import Simulation
from cobs.models.tournament import Tournament, TournamentPlayer
from cobs.models.user import User
from cobs.models.vote import CubeVote
from cobs.schemas.simulation import (
    MultiRoundPlayer,
    MultiRoundPod,
    MultiRoundResult,
    SimulateDraftRequest,
    SimulateMultiRoundRequest,
    SimulateMultiRoundResponse,
    SimulationResponse,
)

router = APIRouter(prefix="/tournaments/{tournament_id}", tags=["simulations"])


@router.post("/simulate-draft", response_model=SimulationResponse, status_code=201)
async def simulate_draft(
    tournament_id: uuid.UUID,
    body: SimulateDraftRequest = SimulateDraftRequest(),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Run the optimizer without creating a real draft. Persists result as a Simulation."""
    # Load tournament
    t_result = await db.execute(
        select(Tournament).where(Tournament.id == tournament_id)
    )
    tournament = t_result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

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
    tc_by_cube_id: dict[str, TournamentCube] = {str(tc.cube_id): tc for tc in tournament_cubes}

    if not tournament_cubes:
        raise HTTPException(status_code=400, detail="No cubes in tournament")

    # Build optimizer inputs
    pod_sizes = calculate_pod_sizes(len(tournament_players))
    round_number = body.round_number

    optimizer_players: list[PlayerInput] = []
    tp_by_id: dict[str, TournamentPlayer] = {}
    for tp in tournament_players:
        votes_dict: dict[str, str] = {}
        for v in tp.votes:
            votes_dict[str(v.tournament_cube.cube_id)] = v.vote.value
        optimizer_players.append(PlayerInput(
            id=str(tp.id),
            match_points=tp.match_points,
            votes=votes_dict,
            prior_avoid_count=0,
        ))
        tp_by_id[str(tp.id)] = tp

    optimizer_cubes = [
        CubeInput(id=str(tc.cube_id), max_players=tc.max_players)
        for tc in tournament_cubes
    ]

    config = OptimizerConfig(
        score_want=body.score_want,
        score_avoid=body.score_avoid,
        score_neutral=body.score_neutral,
        early_round_bonus=body.early_round_bonus,
        lower_standing_bonus=body.lower_standing_bonus,
        repeat_avoid_multiplier=body.repeat_avoid_multiplier,
        avoid_penalty_scaling=body.avoid_penalty_scaling,
        avoid_penalty_formula=body.avoid_penalty_formula,
    )

    # Reproducibility: by default mirror the real draft generation, which uses
    # the tournament seed (see routes/drafts.py). An explicit request seed
    # overrides it for a fixed, shareable result that is directly comparable to
    # the multi-round sim (same seed + round_number => identical pods).
    effective_seed = body.seed if body.seed is not None else (tournament.seed or 0)
    t0 = time.monotonic()
    opt_result = optimize_pods(
        optimizer_players, optimizer_cubes, pod_sizes, round_number, config,
        seed=effective_seed + round_number,
    )
    solver_time_ms = int((time.monotonic() - t0) * 1000)

    if is_infeasible(opt_result.status):
        raise HTTPException(
            status_code=422,
            detail=(
                "Konnte keine gültige Pod-Aufteilung finden. Mögliche Ursachen: "
                "zu wenige Cubes für die Anzahl der Pods oder zu geringe "
                f"max_players-Kapazität der Cubes. (Solver-Status: {opt_result.status})"
            ),
        )

    # Build result JSON and compute metrics
    total_desired = 0
    total_neutral = 0
    total_avoid = 0
    max_standings_diff = 0
    pods_data: list[dict] = []

    for k, (player_ids, cube_id) in enumerate(zip(opt_result.pods, opt_result.cube_ids)):
        tc = tc_by_cube_id.get(cube_id) if cube_id else None
        cube_name = tc.cube.name if tc else "?"

        pod_players_data: list[dict] = []
        match_points_in_pod: list[int] = []

        for pid in player_ids:
            tp = tp_by_id[pid]
            username = tp.user.username

            # Find this player's vote for the assigned cube
            vote = "NEUTRAL"
            if cube_id:
                for v in tp.votes:
                    if str(v.tournament_cube.cube_id) == cube_id:
                        vote = v.vote.value
                        break

            if vote == "DESIRED":
                total_desired += 1
            elif vote == "AVOID":
                total_avoid += 1
            else:
                total_neutral += 1

            match_points_in_pod.append(tp.match_points)
            pod_players_data.append({
                "tournament_player_id": str(tp.id),
                "username": username,
                "vote": vote,
                "match_points": tp.match_points,
            })

        if match_points_in_pod:
            diff = max(match_points_in_pod) - min(match_points_in_pod)
            if diff > max_standings_diff:
                max_standings_diff = diff

        pods_data.append({
            "pod_number": k + 1,
            "cube_name": cube_name,
            "cube_id": cube_id,
            "pod_size": len(player_ids),
            "players": pod_players_data,
        })

    result_json = {"pods": pods_data}
    config_json = {
        "round_number": body.round_number,
        "seed": effective_seed,
        "score_want": body.score_want,
        "score_avoid": body.score_avoid,
        "score_neutral": body.score_neutral,
        "early_round_bonus": body.early_round_bonus,
        "lower_standing_bonus": body.lower_standing_bonus,
        "repeat_avoid_multiplier": body.repeat_avoid_multiplier,
        "avoid_penalty_scaling": body.avoid_penalty_scaling,
        "avoid_penalty_formula": body.avoid_penalty_formula,
    }

    simulation = Simulation(
        tournament_id=tournament_id,
        label=body.label,
        config=config_json,
        result=result_json,
        total_desired=total_desired,
        total_neutral=total_neutral,
        total_avoid=total_avoid,
        objective_score=opt_result.objective,
        max_standings_diff=max_standings_diff,
        player_count=len(tournament_players),
        pod_count=len(opt_result.pods),
        solver_time_ms=solver_time_ms,
    )
    db.add(simulation)
    await db.commit()
    await db.refresh(simulation)

    return SimulationResponse(
        id=simulation.id,
        tournament_id=simulation.tournament_id,
        label=simulation.label,
        config=simulation.config,
        result=simulation.result,
        total_desired=simulation.total_desired,
        total_neutral=simulation.total_neutral,
        total_avoid=simulation.total_avoid,
        objective_score=simulation.objective_score,
        max_standings_diff=simulation.max_standings_diff,
        player_count=simulation.player_count,
        pod_count=simulation.pod_count,
        solver_time_ms=simulation.solver_time_ms,
        created_at=simulation.created_at.isoformat() if simulation.created_at else None,
    )


@router.post("/simulate-draft-multi", response_model=SimulateMultiRoundResponse)
async def simulate_draft_multi(
    tournament_id: uuid.UUID,
    body: SimulateMultiRoundRequest = SimulateMultiRoundRequest(),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Chain several draft rounds with real votes and random results between.

    Deterministic per seed. Not persisted — purely a playground exploration.
    """
    if body.num_rounds < 1:
        raise HTTPException(status_code=400, detail="num_rounds must be >= 1")

    t_result = await db.execute(select(Tournament).where(Tournament.id == tournament_id))
    tournament = t_result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

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

    tc_result = await db.execute(
        select(TournamentCube)
        .where(TournamentCube.tournament_id == tournament_id)
        .options(selectinload(TournamentCube.cube))
    )
    tournament_cubes = tc_result.scalars().all()
    if not tournament_cubes:
        raise HTTPException(status_code=400, detail="No cubes in tournament")

    # Build inputs keyed by cube_id (string) — matches optimizer/vote convention.
    cube_ids = [str(tc.cube_id) for tc in tournament_cubes]
    cube_max_players = {str(tc.cube_id): tc.max_players for tc in tournament_cubes}
    cube_name_by_id = {str(tc.cube_id): tc.cube.name for tc in tournament_cubes}

    player_ids: list[str] = []
    votes: dict[str, dict[str, str]] = {}
    initial_match_points: dict[str, int] = {}
    username_by_id: dict[str, str] = {}
    for tp in tournament_players:
        pid = str(tp.id)
        player_ids.append(pid)
        username_by_id[pid] = tp.user.username
        initial_match_points[pid] = tp.match_points
        votes[pid] = {str(v.tournament_cube.cube_id): v.vote.value for v in tp.votes}

    config = OptimizerConfig(
        score_want=body.score_want,
        score_avoid=body.score_avoid,
        score_neutral=body.score_neutral,
        early_round_bonus=body.early_round_bonus,
        lower_standing_bonus=body.lower_standing_bonus,
        repeat_avoid_multiplier=body.repeat_avoid_multiplier,
        avoid_penalty_scaling=body.avoid_penalty_scaling,
        avoid_penalty_formula=body.avoid_penalty_formula,
    )

    # Default to the tournament seed so round 1 reproduces the real draft and
    # matches the single sim; an explicit request seed overrides it.
    effective_seed = body.seed if body.seed is not None else (tournament.seed or 0)
    rounds_raw = simulate_real_vote_rounds(
        player_ids=player_ids,
        votes=votes,
        initial_match_points=initial_match_points,
        cube_ids=cube_ids,
        cube_max_players=cube_max_players,
        num_rounds=body.num_rounds,
        swiss_rounds_per_draft=body.swiss_rounds_per_draft,
        config=config,
        seed=effective_seed,
    )

    for r in rounds_raw:
        empty = sum(p["size"] for p in r["pods"]) == 0
        if is_infeasible(r["solver_status"]) or empty:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Konnte für Runde {r['round']} keine gültige Pod-Aufteilung "
                    "finden. Mögliche Ursachen: zu wenige Cubes für die Anzahl der "
                    "Pods oder zu geringe max_players-Kapazität der Cubes. "
                    f"(Solver-Status: {r['solver_status']})"
                ),
            )

    rounds = [
        MultiRoundResult(
            round=r["round"],
            objective=r["objective"],
            solver_status=r["solver_status"],
            solver_time=r["solver_time"],
            pods=[
                MultiRoundPod(
                    pod=pod["pod"],
                    cube_name=cube_name_by_id.get(pod["cube"], "?"),
                    cube_id=pod["cube"],
                    size=pod["size"],
                    players=[
                        MultiRoundPlayer(
                            username=username_by_id.get(p["id"], "?"),
                            vote=p["vote"],
                            match_points=p["match_points"],
                        )
                        for p in pod["players"]
                    ],
                )
                for pod in r["pods"]
            ],
        )
        for r in rounds_raw
    ]

    return SimulateMultiRoundResponse(
        seed=effective_seed,
        num_rounds=body.num_rounds,
        player_count=len(player_ids),
        config={
            "score_want": body.score_want,
            "score_avoid": body.score_avoid,
            "score_neutral": body.score_neutral,
            "early_round_bonus": body.early_round_bonus,
            "lower_standing_bonus": body.lower_standing_bonus,
            "repeat_avoid_multiplier": body.repeat_avoid_multiplier,
            "avoid_penalty_scaling": body.avoid_penalty_scaling,
            "avoid_penalty_formula": body.avoid_penalty_formula,
            "swiss_rounds_per_draft": body.swiss_rounds_per_draft,
        },
        rounds=rounds,
    )


@router.get("/simulations", response_model=list[SimulationResponse])
async def list_simulations(
    tournament_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all simulations for a tournament."""
    result = await db.execute(
        select(Simulation)
        .where(Simulation.tournament_id == tournament_id)
        .order_by(Simulation.created_at.desc())
    )
    sims = result.scalars().all()
    return [
        SimulationResponse(
            id=s.id,
            tournament_id=s.tournament_id,
            label=s.label,
            config=s.config,
            result=s.result,
            total_desired=s.total_desired,
            total_neutral=s.total_neutral,
            total_avoid=s.total_avoid,
            objective_score=s.objective_score,
            max_standings_diff=s.max_standings_diff,
            player_count=s.player_count,
            pod_count=s.pod_count,
            solver_time_ms=s.solver_time_ms,
            created_at=s.created_at.isoformat() if s.created_at else None,
        )
        for s in sims
    ]


@router.delete("/simulations/{simulation_id}", status_code=204)
async def delete_simulation(
    tournament_id: uuid.UUID,
    simulation_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a simulation."""
    result = await db.execute(
        select(Simulation).where(
            Simulation.id == simulation_id,
            Simulation.tournament_id == tournament_id,
        )
    )
    sim = result.scalar_one_or_none()
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")
    await db.delete(sim)
    await db.commit()
    return Response(status_code=204)
