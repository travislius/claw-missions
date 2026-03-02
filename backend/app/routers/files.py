import mimetypes
import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import User, File, Tag, file_tags
from ..schemas import FileOut, TagOut
from ..config import settings
from ..utils.storage import save_file, get_abs_path, delete_file
from ..utils.thumbnails import generate_thumbnail

router = APIRouter()


class FileUpdate(BaseModel):
    name: str | None = None


@router.post("/upload", response_model=FileOut)
async def upload_file(
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = await file.read()
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.MAX_UPLOAD_MB}MB limit")

    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    rel_path, checksum = save_file(data, file.filename or "unnamed")

    # Generate thumbnail
    thumb_path = generate_thumbnail(rel_path, mime, data)

    db_file = File(
        name=file.filename or "unnamed",
        path=rel_path,
        size=len(data),
        mime_type=mime,
        checksum=checksum,
        thumbnail_path=thumb_path,
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    return db_file


@router.get("", response_model=list[FileOut])
def list_files(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    tag: int | None = Query(None, description="Filter by tag ID"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    offset = (page - 1) * per_page
    q = db.query(File)
    if tag is not None:
        q = q.filter(File.tags.any(Tag.id == tag))
    files = q.order_by(File.created_at.desc()).offset(offset).limit(per_page).all()
    return files


@router.get("/search", response_model=list[FileOut])
def search_files(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search files by filename or tag name."""
    pattern = f"%{q}%"
    offset = (page - 1) * per_page
    results = (
        db.query(File)
        .outerjoin(file_tags, File.id == file_tags.c.file_id)
        .outerjoin(Tag, Tag.id == file_tags.c.tag_id)
        .filter(or_(File.name.ilike(pattern), Tag.name.ilike(pattern)))
        .distinct()
        .order_by(File.created_at.desc())
        .offset(offset)
        .limit(per_page)
        .all()
    )
    return results


@router.get("/{file_id}", response_model=FileOut)
def get_file(file_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = db.query(File).filter(File.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    return f


@router.put("/{file_id}", response_model=FileOut)
def update_file(file_id: int, update: FileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = db.query(File).filter(File.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    if update.name is not None:
        f.name = update.name
    f.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(f)
    return f


@router.get("/{file_id}/download")
def download_file(file_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = db.query(File).filter(File.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    abs_path = get_abs_path(f.path)
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="File missing from storage")
    return FileResponse(abs_path, filename=f.name, media_type=f.mime_type)


@router.get("/{file_id}/thumb")
def get_thumbnail(file_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = db.query(File).filter(File.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    if not f.thumbnail_path:
        raise HTTPException(status_code=404, detail="No thumbnail available")
    abs_path = os.path.join(settings.STORAGE, ".thumbs", f.thumbnail_path)
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="Thumbnail file missing")
    return FileResponse(abs_path, media_type="image/jpeg")


@router.delete("/{file_id}")
def delete_file_endpoint(file_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = db.query(File).filter(File.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    delete_file(f.path)
    # Also delete thumbnail
    if f.thumbnail_path:
        thumb_abs = os.path.join(settings.STORAGE, ".thumbs", f.thumbnail_path)
        if os.path.exists(thumb_abs):
            os.remove(thumb_abs)
    db.delete(f)
    db.commit()
    return {"detail": "Deleted"}


@router.post("/{file_id}/tags", response_model=list[TagOut])
def assign_tags(
    file_id: int,
    tag_ids: list[int],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    f = db.query(File).filter(File.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    tags = db.query(Tag).filter(Tag.id.in_(tag_ids)).all()
    if len(tags) != len(tag_ids):
        raise HTTPException(status_code=404, detail="One or more tags not found")
    for tag in tags:
        if tag not in f.tags:
            f.tags.append(tag)
    db.commit()
    db.refresh(f)
    return f.tags


@router.delete("/{file_id}/tags/{tag_id}")
def remove_tag(
    file_id: int,
    tag_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    f = db.query(File).filter(File.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag or tag not in f.tags:
        raise HTTPException(status_code=404, detail="Tag not assigned to file")
    f.tags.remove(tag)
    db.commit()
    return {"detail": "Tag removed"}
