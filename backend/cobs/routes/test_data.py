import random
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cobs.auth.dependencies import require_admin
from cobs.auth.jwt import hash_password
from cobs.database import get_db
from cobs.models.cube import Cube, TournamentCube
from cobs.models.tournament import Tournament, TournamentPlayer, TournamentStatus
from cobs.models.user import User
from cobs.models.vote import CubeVote, VoteType
from cobs.routes.tournaments import _generate_join_code

router = APIRouter(prefix="/test", tags=["test"])


class TestTournamentRequest(BaseModel):
    name: str = "Test Tournament"
    num_players: int = 16
    num_cubes: int = 4
    seed: int | None = None


class TestTournamentResponse(BaseModel):
    tournament_id: uuid.UUID
    join_code: str
    player_count: int
    cube_count: int


@router.post("/tournament", response_model=TestTournamentResponse, status_code=201)
async def create_test_tournament(
    body: TestTournamentRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a test tournament with pre-filled players and random votes."""
    rng = random.Random(body.seed)

    # Create cubes if they don't exist
    cube_names = [f"Test Cube {i+1}" for i in range(body.num_cubes)]
    cubes: list[Cube] = []
    for name in cube_names:
        result = await db.execute(select(Cube).where(Cube.name == name))
        cube = result.scalar_one_or_none()
        if not cube:
            cube = Cube(name=name, description=f"Auto-generated test cube: {name}")
            db.add(cube)
            await db.flush()
        cubes.append(cube)

    # Create tournament
    tournament = Tournament(
        name=body.name,
        join_code=_generate_join_code(),
        status=TournamentStatus.VOTING,
    )
    db.add(tournament)
    await db.flush()

    # Link cubes
    tournament_cubes: list[TournamentCube] = []
    for cube in cubes:
        tc = TournamentCube(tournament_id=tournament.id, cube_id=cube.id)
        db.add(tc)
        await db.flush()
        tournament_cubes.append(tc)

    # Create players
    vote_options = [VoteType.DESIRED, VoteType.NEUTRAL, VoteType.AVOID]
    password_hash = hash_password("test")

    for i in range(body.num_players):
        username = f"test_player_{tournament.join_code}_{i+1}"
        user = User(username=username, password_hash=password_hash)
        db.add(user)
        await db.flush()

        tp = TournamentPlayer(tournament_id=tournament.id, user_id=user.id)
        db.add(tp)
        await db.flush()

        # Random votes
        for tc in tournament_cubes:
            vote = CubeVote(
                tournament_player_id=tp.id,
                tournament_cube_id=tc.id,
                vote=rng.choice(vote_options),
            )
            db.add(vote)

    await db.commit()

    return TestTournamentResponse(
        tournament_id=tournament.id,
        join_code=tournament.join_code,
        player_count=body.num_players,
        cube_count=body.num_cubes,
    )
