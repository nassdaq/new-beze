from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .art.routes import router as art_router
from .generation.routes import router as generation_router
from .settings import settings


def create_app() -> FastAPI:
    app = FastAPI(title="Beze API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    app.include_router(generation_router)
    app.include_router(art_router)

    @app.get("/api/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "provider": settings.ai_provider}

    return app


app = create_app()
