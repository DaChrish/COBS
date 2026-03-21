from fastapi import FastAPI
from cobs.routes import auth, cubes, health, tournaments, votes


def create_app() -> FastAPI:
    app = FastAPI(title="COBS", version="2.0.0")
    app.include_router(health.router, tags=["health"])
    app.include_router(auth.router)
    app.include_router(cubes.router)
    app.include_router(tournaments.router)
    app.include_router(votes.router)
    return app


app = create_app()
