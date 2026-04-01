import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cobs.auth.dependencies import require_admin
from cobs.database import get_db
from cobs.logic.optimizer import CubeInput, OptimizerConfig, PlayerInput, optimize_pods
from cobs.logic.pod_sizes import calculate_pod_sizes
from cobs.models.cube import TournamentCube
from cobs.models.simulation import Simulation
from cobs.models.tournament import Tournament, TournamentPlayer
from cobs.models.user import User
from cobs.models.vote import CubeVote
from cobs.schemas.simulation import SimulateDraftRequest, SimulationResponse

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
        match_point_penalty_weight=body.match_point_penalty_weight,
        early_round_bonus=body.early_round_bonus,
        lower_standing_bonus=body.lower_standing_bonus,
        repeat_avoid_multiplier=body.repeat_avoid_multiplier,
        avoid_penalty_scaling=body.avoid_penalty_scaling,
    )

    # Run optimizer with timing
    tournament_seed = tournament.seed or 0
    t0 = time.monotonic()
    opt_result = optimize_pods(
        optimizer_players, optimizer_cubes, pod_sizes, round_number, config,
        seed=tournament_seed + round_number,
    )
    solver_time_ms = int((time.monotonic() - t0) * 1000)

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
        "score_want": body.score_want,
        "score_avoid": body.score_avoid,
        "score_neutral": body.score_neutral,
        "match_point_penalty_weight": body.match_point_penalty_weight,
        "early_round_bonus": body.early_round_bonus,
        "lower_standing_bonus": body.lower_standing_bonus,
        "repeat_avoid_multiplier": body.repeat_avoid_multiplier,
        "avoid_penalty_scaling": body.avoid_penalty_scaling,
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
