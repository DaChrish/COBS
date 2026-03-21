from fastapi import FastAPI
from cobs.routes import health


def create_app() -> FastAPI:
    app = FastAPI(title="COBS", version="2.0.0")
    app.include_router(health.router, tags=["health"])
    return app


app = create_app()
