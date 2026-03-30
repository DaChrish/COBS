import logging

from fastapi import FastAPI

from cobs.config import settings
from cobs.routes import auth, cubes, drafts, health, matches, photos, simulate, standings, test_data, timer, tournaments, votes, websocket


def create_app() -> FastAPI:
    logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
    app = FastAPI(title="COBS", version="2.0.0")
    app.include_router(health.router, tags=["health"])
    app.include_router(auth.router)
    app.include_router(cubes.router)
    app.include_router(tournaments.router)
    app.include_router(votes.router)
    app.include_router(drafts.router)
    app.include_router(matches.router)
    app.include_router(standings.router)
    app.include_router(photos.router)
    app.include_router(timer.router)
    app.include_router(websocket.router)
    app.include_router(test_data.router)
    app.include_router(simulate.router)
    return app


app = create_app()
