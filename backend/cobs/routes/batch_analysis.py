import csv
import io
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cobs.auth.dependencies import require_admin
from cobs.database import get_db
from cobs.logic.batch_simulator import (
    PlayerProfile,
    TournamentConfig,
    VoteDistribution,
    simulate_tournament,
)
from cobs.models.batch_analysis import BatchAnalysis
from cobs.models.user import User
from cobs.schemas.batch_analysis import BatchAnalysisRequest, BatchAnalysisResponse

router = APIRouter(prefix="/batch-analysis", tags=["batch-analysis"])


@router.post("", response_model=BatchAnalysisResponse, status_code=201)
async def run_batch_analysis(
    body: BatchAnalysisRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Run N tournament simulations and persist aggregated results."""
    config = TournamentConfig(
        num_players=body.num_players,
        num_cubes=body.num_cubes,
        max_rounds=body.max_rounds,
        swiss_rounds_per_draft=body.swiss_rounds_per_draft,
        vote_distribution=VoteDistribution(
            desired=body.vote_distribution.desired,
            neutral=body.vote_distribution.neutral,
            avoid=body.vote_distribution.avoid,
        ),
        player_profiles=[
            PlayerProfile(
                count=p.count,
                desired_pct=p.desired_pct,
                neutral_pct=p.neutral_pct,
                avoid_pct=p.avoid_pct,
            )
            for p in body.player_profiles
        ],
        optimizer_config=body.optimizer_config,
    )

    start = time.perf_counter()

    desired_pcts: list[float] = []
    neutral_pcts: list[float] = []
    avoid_pcts: list[float] = []
    sim_results: list[dict] = []

    for i in range(body.num_simulations):
        seed = body.base_seed + i * 1000
        result = simulate_tournament(config, seed=seed)
        summary = result["summary"]
        desired_pcts.append(summary["desired_pct"])
        neutral_pcts.append(summary["neutral_pct"])
        avoid_pcts.append(summary["avoid_pct"])
        sim_results.append({
            "seed": seed,
            "desired_pct": summary["desired_pct"],
            "neutral_pct": summary["neutral_pct"],
            "avoid_pct": summary["avoid_pct"],
            "total_desired": summary["total_desired"],
            "total_neutral": summary["total_neutral"],
            "total_avoid": summary["total_avoid"],
            "objective": summary.get("objective", 0),
            "drafts": result["drafts"],
            "cube_votes": result.get("cube_votes", []),
            "player_votes": result.get("player_votes", {}),
        })

    elapsed_ms = int((time.perf_counter() - start) * 1000)

    analysis = BatchAnalysis(
        label=body.label,
        num_players=body.num_players,
        num_cubes=body.num_cubes,
        max_rounds=body.max_rounds,
        swiss_rounds_per_draft=body.swiss_rounds_per_draft,
        num_simulations=body.num_simulations,
        vote_distribution=body.vote_distribution.model_dump(),
        player_profiles=[p.model_dump() for p in body.player_profiles],
        optimizer_config=body.optimizer_config,
        avg_desired_pct=round(sum(desired_pcts) / len(desired_pcts), 1),
        avg_neutral_pct=round(sum(neutral_pcts) / len(neutral_pcts), 1),
        avg_avoid_pct=round(sum(avoid_pcts) / len(avoid_pcts), 1),
        min_desired_pct=min(desired_pcts),
        max_desired_pct=max(desired_pcts),
        min_avoid_pct=min(avoid_pcts),
        max_avoid_pct=max(avoid_pcts),
        simulations=sim_results,
        total_time_ms=elapsed_ms,
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    return _to_response(analysis)


@router.get("", response_model=list[BatchAnalysisResponse])
async def list_batch_analyses(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all batch analyses."""
    result = await db.execute(
        select(BatchAnalysis).order_by(BatchAnalysis.created_at.desc())
    )
    rows = result.scalars().all()
    return [_to_response(r) for r in rows]


@router.delete("/{analysis_id}", status_code=204)
async def delete_batch_analysis(
    analysis_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a batch analysis."""
    result = await db.execute(
        select(BatchAnalysis).where(BatchAnalysis.id == analysis_id)
    )
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Batch analysis not found")
    await db.delete(analysis)
    await db.commit()


@router.get("/{analysis_id}/csv")
async def export_csv(
    analysis_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Export simulation results as CSV."""
    result = await db.execute(
        select(BatchAnalysis).where(BatchAnalysis.id == analysis_id)
    )
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Batch analysis not found")

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "simulation", "desired_pct", "neutral_pct", "avoid_pct",
        "total_desired", "total_neutral", "total_avoid",
    ])
    for idx, sim in enumerate(analysis.simulations):
        writer.writerow([
            idx + 1,
            sim["desired_pct"],
            sim["neutral_pct"],
            sim["avoid_pct"],
            sim["total_desired"],
            sim["total_neutral"],
            sim["total_avoid"],
        ])

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=batch_{analysis_id}.csv"},
    )


def _to_response(analysis: BatchAnalysis) -> BatchAnalysisResponse:
    return BatchAnalysisResponse(
        id=analysis.id,
        label=analysis.label,
        num_players=analysis.num_players,
        num_cubes=analysis.num_cubes,
        max_rounds=analysis.max_rounds,
        swiss_rounds_per_draft=analysis.swiss_rounds_per_draft,
        num_simulations=analysis.num_simulations,
        vote_distribution=analysis.vote_distribution,
        player_profiles=analysis.player_profiles,
        optimizer_config=analysis.optimizer_config,
        avg_desired_pct=analysis.avg_desired_pct,
        avg_neutral_pct=analysis.avg_neutral_pct,
        avg_avoid_pct=analysis.avg_avoid_pct,
        min_desired_pct=analysis.min_desired_pct,
        max_desired_pct=analysis.max_desired_pct,
        min_avoid_pct=analysis.min_avoid_pct,
        max_avoid_pct=analysis.max_avoid_pct,
        simulations=analysis.simulations,
        total_time_ms=analysis.total_time_ms,
        created_at=str(analysis.created_at) if analysis.created_at else None,
    )
