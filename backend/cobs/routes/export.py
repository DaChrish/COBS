import io
import os
import re
import uuid
import zipfile

from fastapi import APIRouter, Depends, HTTPException
from starlette.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cobs.auth.dependencies import require_admin
from cobs.config import settings
from cobs.database import get_db
from cobs.logic.pdf import generate_pairings_pdf, generate_pods_pdf, generate_standings_pdf
from cobs.logic.standings import calculate_standings
from cobs.logic.swiss import MatchResult
from cobs.models.cube import TournamentCube
from cobs.models.draft import Draft, Pod, PodPlayer
from cobs.models.match import Match
from cobs.models.photo import DraftPhoto
from cobs.models.tournament import Tournament, TournamentPlayer
from cobs.models.user import User

router = APIRouter(tags=["export"])


def _safe_filename(name: str) -> str:
    """Replace special characters with underscores for filesystem safety."""
    return re.sub(r"[^\w\-.]", "_", name)


async def _build_standings_data(
    tournament: Tournament, db: AsyncSession
) -> tuple[list[dict], dict[uuid.UUID, int]]:
    """Calculate standings and return (standings list for PDF, rank map by tp id)."""
    tp_result = await db.execute(
        select(TournamentPlayer)
        .where(TournamentPlayer.tournament_id == tournament.id)
        .options(selectinload(TournamentPlayer.user))
    )
    tournament_players = tp_result.scalars().all()
    tp_map = {str(tp.id): tp for tp in tournament_players}

    match_result = await db.execute(
        select(Match)
        .join(Pod)
        .join(Draft)
        .where(Draft.tournament_id == tournament.id, Match.reported.is_(True))
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

    standings = []
    rank_map: dict[uuid.UUID, int] = {}
    for i, e in enumerate(entries):
        rank = i + 1
        tp = tp_map[e.player_id]
        rank_map[tp.id] = rank
        standings.append(
            {
                "rank": rank,
                "username": tp.user.username,
                "match_points": e.match_points,
                "record": f"{e.match_wins}-{e.match_losses}-{e.match_draws}",
                "omw": f"{e.omw_percent * 100:.2f}%",
                "gw": f"{e.gw_percent * 100:.2f}%",
                "ogw": f"{e.ogw_percent * 100:.2f}%",
                "dropped": e.dropped,
            }
        )

    return standings, rank_map


async def _build_draft_zip_content(
    tournament: Tournament,
    draft: Draft,
    standings_rank_map: dict[uuid.UUID, int],
    db: AsyncSession,
    prefix: str = "",
) -> list[tuple[str, bytes | str]]:
    """Build all ZIP entries for one draft.

    Returns list of (zip_path, content) where content is bytes (writestr)
    or str filepath on disk (write from disk).
    """
    entries: list[tuple[str, bytes | str]] = []

    # Load draft with pods, players, cubes
    draft_result = await db.execute(
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
    draft = draft_result.scalar_one()

    # --- Pods PDF ---
    pods_data = []
    for pod in sorted(draft.pods, key=lambda p: p.pod_number):
        cube_name = pod.tournament_cube.cube.name if pod.tournament_cube else "?"
        players = [
            {"seat": pp.seat_number, "username": pp.tournament_player.user.username}
            for pp in sorted(pod.players, key=lambda p: p.seat_number)
        ]
        pods_data.append(
            {
                "table": pod.pod_number,
                "pod_name": cube_name,
                "players": players,
            }
        )

    round_label = f"Runde {draft.round_number} - Pods"
    pods_pdf = generate_pods_pdf(tournament.name, round_label, pods_data)
    entries.append((f"{prefix}Pods.pdf", pods_pdf))

    # --- Pairings PDFs per swiss round ---
    matches_result = await db.execute(
        select(Match)
        .join(Pod)
        .where(Pod.draft_id == draft.id)
        .options(
            selectinload(Match.player1).selectinload(TournamentPlayer.user),
            selectinload(Match.player2).selectinload(TournamentPlayer.user),
        )
        .order_by(Match.pod_id, Match.swiss_round)
    )
    all_matches = matches_result.scalars().all()

    if all_matches:
        swiss_rounds = sorted({m.swiss_round for m in all_matches})
        for sr in swiss_rounds:
            round_matches = [m for m in all_matches if m.swiss_round == sr]
            round_label_p = f"Draft {draft.round_number} - Runde {sr} Pairings"

            pairings_pods_data = []
            table_number = 1
            for pod in sorted(draft.pods, key=lambda p: p.pod_number):
                pod_matches = [m for m in round_matches if m.pod_id == pod.id and not m.is_bye]
                pod_byes = [m for m in round_matches if m.pod_id == pod.id and m.is_bye]
                cube_name = pod.tournament_cube.cube.name
                matches_data = []
                for m in pod_matches:
                    matches_data.append(
                        {
                            "table": table_number,
                            "player1": m.player1.user.username,
                            "player2": m.player2.user.username if m.player2 else "\u2014",
                        }
                    )
                    table_number += 1
                byes_data = [m.player1.user.username for m in pod_byes]
                pairings_pods_data.append(
                    {
                        "pod_name": f"Pod {pod.pod_number} \u00b7 {cube_name}",
                        "matches": matches_data,
                        "byes": byes_data,
                    }
                )

            pairings_pdf = generate_pairings_pdf(tournament.name, round_label_p, pairings_pods_data)
            entries.append((f"{prefix}Pairings_Swiss{sr}.pdf", pairings_pdf))

    # --- Photos ---
    # Build pod mapping: tournament_player_id -> pod_number
    pod_map: dict[uuid.UUID, int] = {}
    for pod in draft.pods:
        for pp in pod.players:
            pod_map[pp.tournament_player_id] = pod.pod_number

    # Load photos for this draft
    photo_result = await db.execute(
        select(DraftPhoto)
        .where(DraftPhoto.draft_id == draft.id)
        .options(
            selectinload(DraftPhoto.tournament_player).selectinload(TournamentPlayer.user)
        )
    )
    photos = photo_result.scalars().all()

    for photo in photos:
        tp_id = photo.tournament_player_id
        rank = standings_rank_map.get(tp_id, 99)
        username = _safe_filename(photo.tournament_player.user.username)
        pod_num = pod_map.get(tp_id, 0)
        photo_type = photo.photo_type.value

        folder = f"{prefix}Fotos/Rang{rank:02d}_{username}_Pod{pod_num}"
        filepath = os.path.join(settings.upload_dir, photo.filename)
        if os.path.exists(filepath):
            entries.append((f"{folder}/{photo_type}.jpg", filepath))

    return entries


@router.get("/tournaments/{tournament_id}/drafts/{draft_id}/export")
async def export_draft(
    tournament_id: uuid.UUID,
    draft_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Export a single draft as a ZIP file with PDFs and photos."""
    t_result = await db.execute(
        select(Tournament).where(Tournament.id == tournament_id)
    )
    tournament = t_result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

    d_result = await db.execute(
        select(Draft).where(Draft.id == draft_id, Draft.tournament_id == tournament_id)
    )
    draft = d_result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    standings, rank_map = await _build_standings_data(tournament, db)

    # Standings PDF
    latest_draft_result = await db.execute(
        select(Draft)
        .where(Draft.tournament_id == tournament_id)
        .order_by(Draft.round_number.desc())
    )
    latest_draft = latest_draft_result.scalars().first()
    standings_round_label = f"Runde {latest_draft.round_number}" if latest_draft else "Runde 0"
    standings_pdf = generate_standings_pdf(tournament.name, standings_round_label, standings)

    # Build draft content
    draft_entries = await _build_draft_zip_content(tournament, draft, rank_map, db)

    # Build ZIP
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("Standings.pdf", standings_pdf)
        for zip_path, content in draft_entries:
            if isinstance(content, bytes):
                zf.writestr(zip_path, content)
            else:
                zf.write(content, zip_path)
    buf.seek(0)

    filename = f"Draft{draft.round_number}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/tournaments/{tournament_id}/export")
async def export_tournament(
    tournament_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Export entire tournament as a ZIP file with all drafts, PDFs, and photos."""
    t_result = await db.execute(
        select(Tournament).where(Tournament.id == tournament_id)
    )
    tournament = t_result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

    standings, rank_map = await _build_standings_data(tournament, db)

    # Standings PDF (overall)
    latest_draft_result = await db.execute(
        select(Draft)
        .where(Draft.tournament_id == tournament_id)
        .order_by(Draft.round_number.desc())
    )
    latest_draft = latest_draft_result.scalars().first()
    standings_round_label = f"Runde {latest_draft.round_number}" if latest_draft else "Runde 0"
    standings_pdf = generate_standings_pdf(tournament.name, standings_round_label, standings)

    # Load all drafts
    drafts_result = await db.execute(
        select(Draft)
        .where(Draft.tournament_id == tournament_id)
        .order_by(Draft.round_number)
    )
    drafts = drafts_result.scalars().all()

    # Build ZIP
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("Standings_Gesamt.pdf", standings_pdf)
        for draft in drafts:
            draft_prefix = f"Draft{draft.round_number}/"
            draft_entries = await _build_draft_zip_content(
                tournament, draft, rank_map, db, prefix=draft_prefix
            )
            for zip_path, content in draft_entries:
                if isinstance(content, bytes):
                    zf.writestr(zip_path, content)
                else:
                    zf.write(content, zip_path)
    buf.seek(0)

    filename = f"{_safe_filename(tournament.name)}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
