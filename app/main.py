from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.db.session import engine, Base
from app.db import models  # noqa: F401 - ensures all models are registered
from app.api.v1.diagnostic import router as diagnostic_router
from app.api.v1.sound_profile import router as sound_profile_router
from app.api.v1.learning_path import router as learning_path_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create DB tables if they don't exist
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Evidence-based, phoneme-level pronunciation diagnostic platform.",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(diagnostic_router, prefix=settings.API_V1_STR)
app.include_router(sound_profile_router, prefix=settings.API_V1_STR)
app.include_router(learning_path_router, prefix=settings.API_V1_STR)

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

# Mount static web UI
static_dir = Path(__file__).resolve().parent.parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

@app.get("/", tags=["UI"])
def serve_ui():
    """Serves the interactive microphone diagnostic testing web app."""
    index_file = static_dir / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"message": "Diagnostic API running. Visit /docs for Swagger."}

@app.get("/test", tags=["UI"])
def serve_test_page():
    """Serves the audio recording test page."""
    test_file = static_dir / "test.html"
    if test_file.exists():
        return FileResponse(str(test_file))
    return {"message": "Test page not found."}

@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "engine": settings.RECOGNIZER_ENGINE,
        "database": settings.DATABASE_URL.split("://")[0]
    }
