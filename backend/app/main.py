import os
import secrets

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .config import settings
from .database import engine, SessionLocal, Base, get_db
from .models import User
from .auth import hash_password, get_current_user

from .routers import auth as auth_router
from .routers import files as files_router
from .routers import tags as tags_router
from .routers import system as system_router

Base.metadata.create_all(bind=engine)

tags_metadata = [
    {"name": "auth", "description": "Authentication — login, token refresh"},
    {"name": "files", "description": "File management — upload, download, browse, search, tag assignment"},
    {"name": "tags", "description": "Tag CRUD — create, list, update, delete tags"},
    {"name": "system", "description": "Health check and storage statistics"},
]

app = FastAPI(
    title="Claw Missions",
    version="0.2.0",
    description="Mission control for your OpenClaw — file vault, machine monitor, and more.",
    openapi_tags=tags_metadata,
)

_ALLOWED_ORIGINS = os.getenv(
    "OCTOCLOUD_ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:5679",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix="/api/auth", tags=["auth"])
app.include_router(files_router.router, prefix="/api/files", tags=["files"])
app.include_router(tags_router.router, prefix="/api/tags", tags=["tags"])
app.include_router(system_router.router, prefix="/api/system", tags=["system"])


@app.on_event("startup")
def create_default_user():
    os.makedirs(settings.STORAGE, exist_ok=True)
    db = SessionLocal()
    try:
        if not db.query(User).first():
            user = User(
                username=settings.USERNAME,
                password_hash=hash_password(settings.PASSWORD),
                api_key=secrets.token_hex(16),
            )
            db.add(user)
            db.commit()
    finally:
        db.close()


@app.get("/api/health", tags=["system"], summary="Health check")
def health():
    return {"status": "ok"}


@app.get("/api/stats", tags=["system"], summary="Storage statistics")
def stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from sqlalchemy import func as sa_func
    from .models import File, Tag

    total_files = db.query(sa_func.count(File.id)).scalar() or 0
    total_size = db.query(sa_func.sum(File.size)).scalar() or 0
    total_tags = db.query(sa_func.count(Tag.id)).scalar() or 0

    # Storage dir actual disk usage
    storage_path = settings.STORAGE
    disk_usage = 0
    if os.path.isdir(storage_path):
        for dirpath, _, filenames in os.walk(storage_path):
            for fname in filenames:
                fp = os.path.join(dirpath, fname)
                if os.path.isfile(fp):
                    disk_usage += os.path.getsize(fp)

    return {
        "total_files": total_files,
        "total_size_bytes": total_size,
        "total_size_human": _human_size(total_size),
        "disk_usage_bytes": disk_usage,
        "disk_usage_human": _human_size(disk_usage),
        "total_tags": total_tags,
    }


def _human_size(nbytes: int) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if nbytes < 1024:
            return f"{nbytes:.1f} {unit}"
        nbytes /= 1024
    return f"{nbytes:.1f} PB"


# Serve frontend static files if built — MUST be last (catch-all mount)
# In Docker the dist ends up at /app/frontend/dist; locally it's relative
_candidates = [
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"),
    "/app/frontend/dist",
]
static_dir = next((d for d in _candidates if os.path.isdir(d)), None)
if static_dir:
    from fastapi.responses import FileResponse

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        """SPA fallback — serve index.html for any non-API, non-file route."""
        file_path = os.path.join(static_dir, full_path)
        if full_path and os.path.isfile(file_path):
            from starlette.responses import FileResponse as SFR
            return SFR(file_path)
        return FileResponse(os.path.join(static_dir, "index.html"))

    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")
