import os
import secrets

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import engine, SessionLocal, Base, get_db
from .models import User
from .auth import hash_password
from fastapi import Depends
from sqlalchemy.orm import Session

from .routers import auth as auth_router
from .routers import files as files_router
from .routers import tags as tags_router
from .auth import get_current_user

Base.metadata.create_all(bind=engine)

app = FastAPI(title="OctoVault", version="0.1.0")

app.include_router(auth_router.router, prefix="/api/auth", tags=["auth"])
app.include_router(files_router.router, prefix="/api/files", tags=["files"])
app.include_router(tags_router.router, prefix="/api/tags", tags=["tags"])


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


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/stats")
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
static_dir = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
