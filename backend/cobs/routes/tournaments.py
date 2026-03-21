import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cobs.auth.dependencies import get_current_user, require_admin
from cobs.auth.jwt import create_access_token, hash_password, verify_password
from cobs.database import get_db
from cobs.models.cube import Cube, TournamentCube
from cobs.models.tournament import Tournament, TournamentPlayer, TournamentStatus
from cobs.models.user import User
from cobs.models.vote import CubeVote, VoteType
from cobs.schemas.auth import TokenResponse
from cobs.schemas.tournament import (
    JoinTournamentRequest,
    TournamentCreate,
    TournamentCubeResponse,
    TournamentDetailResponse,
    TournamentPlayerResponse,
    TournamentResponse,
    TournamentUpdate,
)

router = APIRouter(prefix="/tournaments", tags=["tournaments"])


def _generate_join_code() -> str:
    return secrets.token_hex(4).upper()[:8]


@router.get("", response_model=list[TournamentResponse])
async def list_tournaments(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Tournament).order_by(Tournament.created_at.desc())
    )
    tournaments = result.scalars().all()

    responses = []
    for t in tournaments:
        player_count = await db.scalar(
            select(func.count()).where(TournamentPlayer.tournament_id == t.id)
        )
        cube_count = await db.scalar(
            select(func.count()).where(TournamentCube.tournament_id == t.id)
        )
        responses.append(
            TournamentResponse(
                id=t.id,
                name=t.name,
                status=t.status,
                join_code=t.join_code,
                max_rounds=t.max_rounds,
                player_count=player_count or 0,
                cube_count=cube_count or 0,
            )
        )
    return responses


@router.post("", response_model=TournamentResponse, status_code=201)
async def create_tournament(
    body: TournamentCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    tournament = Tournament(
        name=body.name,
        max_rounds=body.max_rounds,
        join_code=_generate_join_code(),
    )
    db.add(tournament)
    await db.flush()

    for cube_id in body.cube_ids:
        result = await db.execute(select(Cube).where(Cube.id == cube_id))
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail=f"Cube {cube_id} not found")
        tc = TournamentCube(tournament_id=tournament.id, cube_id=cube_id)
        db.add(tc)

    await db.commit()
    await db.refresh(tournament)

    return TournamentResponse(
        id=tournament.id,
        name=tournament.name,
        status=tournament.status,
        join_code=tournament.join_code,
        max_rounds=tournament.max_rounds,
        player_count=0,
        cube_count=len(body.cube_ids),
    )


@router.get("/{tournament_id}", response_model=TournamentDetailResponse)
async def get_tournament(
    tournament_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Tournament)
        .where(Tournament.id == tournament_id)
        .options(
            selectinload(Tournament.players).selectinload(TournamentPlayer.user),
            selectinload(Tournament.tournament_cubes).selectinload(TournamentCube.cube),
        )
    )
    tournament = result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

    players = [
        TournamentPlayerResponse(
            id=tp.id,
            user_id=tp.user_id,
            username=tp.user.username,
            match_points=tp.match_points,
            game_wins=tp.game_wins,
            game_losses=tp.game_losses,
            dropped=tp.dropped,
        )
        for tp in tournament.players
    ]

    cubes = [
        TournamentCubeResponse(
            id=tc.id,
            cube_id=tc.cube_id,
            cube_name=tc.cube.name,
            cube_description=tc.cube.description,
            cube_image_url=tc.cube.image_url,
            max_players=tc.max_players,
        )
        for tc in tournament.tournament_cubes
    ]

    return TournamentDetailResponse(
        id=tournament.id,
        name=tournament.name,
        status=tournament.status,
        join_code=tournament.join_code,
        max_rounds=tournament.max_rounds,
        player_count=len(players),
        cube_count=len(cubes),
        players=players,
        cubes=cubes,
    )


@router.patch("/{tournament_id}", response_model=TournamentResponse)
async def update_tournament(
    tournament_id: uuid.UUID,
    body: TournamentUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Tournament).where(Tournament.id == tournament_id)
    )
    tournament = result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tournament, field, value)

    await db.commit()
    await db.refresh(tournament)

    player_count = await db.scalar(
        select(func.count()).where(TournamentPlayer.tournament_id == tournament.id)
    )
    cube_count = await db.scalar(
        select(func.count()).where(TournamentCube.tournament_id == tournament.id)
    )

    return TournamentResponse(
        id=tournament.id,
        name=tournament.name,
        status=tournament.status,
        join_code=tournament.join_code,
        max_rounds=tournament.max_rounds,
        player_count=player_count or 0,
        cube_count=cube_count or 0,
    )


@router.post("/join", response_model=TokenResponse)
async def join_tournament(
    body: JoinTournamentRequest,
    db: AsyncSession = Depends(get_db),
):
    """Join a tournament by code. Creates player account if it doesn't exist."""
    result = await db.execute(
        select(Tournament).where(Tournament.join_code == body.join_code.upper())
    )
    tournament = result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Invalid join code")

    if tournament.status == TournamentStatus.FINISHED:
        raise HTTPException(status_code=400, detail="Tournament is finished")

    # Find or create user
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    if user:
        if not verify_password(body.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid password")
    else:
        user = User(
            username=body.username,
            password_hash=hash_password(body.password),
        )
        db.add(user)
        await db.flush()

    # Check if already joined
    result = await db.execute(
        select(TournamentPlayer).where(
            TournamentPlayer.tournament_id == tournament.id,
            TournamentPlayer.user_id == user.id,
        )
    )
    if result.scalar_one_or_none():
        token = create_access_token(str(user.id))
        return TokenResponse(access_token=token, user_id=user.id, is_admin=False)

    # Create tournament player
    tp = TournamentPlayer(tournament_id=tournament.id, user_id=user.id)
    db.add(tp)
    await db.flush()

    # Auto-create NEUTRAL votes for all cubes in this tournament
    tc_result = await db.execute(
        select(TournamentCube).where(TournamentCube.tournament_id == tournament.id)
    )
    for tc in tc_result.scalars().all():
        vote = CubeVote(
            tournament_player_id=tp.id,
            tournament_cube_id=tc.id,
            vote=VoteType.NEUTRAL,
        )
        db.add(vote)

    await db.commit()

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token, user_id=user.id, is_admin=False)


@router.patch("/{tournament_id}/players/{tp_id}/drop")
async def drop_player(
    tournament_id: uuid.UUID,
    tp_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TournamentPlayer).where(
            TournamentPlayer.id == tp_id,
            TournamentPlayer.tournament_id == tournament_id,
        )
    )
    tp = result.scalar_one_or_none()
    if not tp:
        raise HTTPException(status_code=404, detail="Player not found")

    if tp.user_id != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")

    tp.dropped = True
    await db.commit()
    return {"ok": True}
