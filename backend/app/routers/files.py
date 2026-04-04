import json
import mimetypes
import os
import re
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Response, UploadFile
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
THINK_TAG_RE = re.compile(r"<think>.*?</think>", re.IGNORECASE | re.DOTALL)
ZED_MODEL = "qwen3.5-35b-a3b-q4kxl.gguf"
SMART_SEARCH_SYSTEM_PROMPT = (
    'You are a file search assistant. Given a user query and a list of available tags and file types, '
    'return a JSON object with: {"tags": [list of tag names that match the intent], '
    '"keywords": [list of filename keywords/patterns to search], "mime_types": [list of mime type prefixes '
    'to filter]}. Be generous - include anything plausible. Respond ONLY with valid JSON, no markdown.'
)


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

    # Check for duplicate checksum
    existing = db.query(File).filter(File.checksum == checksum).first()
    if existing:
        # Clean up the just-saved file
        delete_file(rel_path)
        raise HTTPException(status_code=409, detail=f"Duplicate file — matches existing file id={existing.id} ({existing.name})")

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


class PaginatedFiles(BaseModel):
    files: list[FileOut]
    total: int
    page: int
    per_page: int
    total_pages: int


def _regular_search_results(db: Session, q: str, page: int = 1, per_page: int = 20) -> list[File]:
    pattern = f"%{q}%"
    offset = (page - 1) * per_page
    return (
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


def _extract_extension(name: str | None, mime_type: str | None) -> str | None:
    if name and "." in name:
        ext = name.rsplit(".", 1)[-1].strip().lower()
        if ext:
            return ext
    if mime_type and "/" in mime_type:
        subtype = mime_type.split("/", 1)[1].split(";", 1)[0].strip().lower()
        subtype = subtype.split("+", 1)[0]
        subtype = subtype.replace("jpeg", "jpg").replace("plain", "txt")
        if subtype.startswith("x-"):
            subtype = subtype[2:]
        if subtype:
            return subtype
    return None


def _strip_model_wrappers(text: str) -> str:
    cleaned = THINK_TAG_RE.sub("", text or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


async def _call_smart_search_llm(query: str, tag_summary: list[str], file_types: list[str], total_files: int) -> dict:
    user_prompt = (
        "/no_thinking\n"
        f"User query: {query}\n"
        f"Total files: {total_files}\n"
        f"Available tags: {', '.join(tag_summary) or 'None'}\n"
        f"Available file types: {', '.join(file_types) or 'None'}\n"
        'Return JSON with keys "tags", "keywords", and "mime_types".'
    )
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.post(
            f"{settings.LLM_URL.rstrip('/')}/v1/chat/completions",
            json={
                "model": ZED_MODEL,
                "messages": [
                    {"role": "system", "content": SMART_SEARCH_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
            },
        )
        response.raise_for_status()

    content = response.json()["choices"][0]["message"]["content"]
    cleaned = _strip_model_wrappers(content)
    payload = json.loads(cleaned)
    return {
        "tags": [str(item).strip() for item in payload.get("tags", []) if str(item).strip()],
        "keywords": [str(item).strip() for item in payload.get("keywords", []) if str(item).strip()],
        "mime_types": [str(item).strip() for item in payload.get("mime_types", []) if str(item).strip()],
    }


@router.get("", response_model=PaginatedFiles)
def list_files(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    tag_id: int | None = Query(None, description="Filter by tag ID"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_dir: str = Query("desc", description="asc or desc"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(File)
    if tag_id is not None:
        q = q.filter(File.tags.any(Tag.id == tag_id))

    # Sorting
    sort_col = getattr(File, sort_by, File.created_at)
    q = q.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())

    total = q.count()
    offset = (page - 1) * per_page
    files = q.offset(offset).limit(per_page).all()
    return PaginatedFiles(
        files=files, total=total, page=page, per_page=per_page,
        total_pages=max(1, -(-total // per_page)),
    )


@router.get("/search", response_model=list[FileOut])
def search_files(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search files by filename or tag name."""
    return _regular_search_results(db, q, page, per_page)


@router.post("/smart-search", response_model=list[FileOut])
async def smart_search_files(
    payload: dict[str, str],
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (payload.get("q") or "").strip()
    if not query:
        raise HTTPException(status_code=422, detail="Query is required")

    tag_rows = (
        db.query(Tag, func.count(file_tags.c.file_id).label("file_count"))
        .outerjoin(file_tags, Tag.id == file_tags.c.tag_id)
        .group_by(Tag.id)
        .order_by(Tag.name)
        .all()
    )
    file_rows = db.query(File.name, File.mime_type).all()
    total_files = db.query(func.count(File.id)).scalar() or 0

    tag_summary = [f"{tag.name} ({file_count})" for tag, file_count in tag_rows]
    tag_lookup = {tag.name.strip().lower(): tag.name for tag, _ in tag_rows}

    file_types = sorted({
        ext.upper()
        for name, mime_type in file_rows
        for ext in [_extract_extension(name, mime_type)]
        if ext
    })

    try:
        semantic_filters = await _call_smart_search_llm(query, tag_summary, file_types, total_files)
        matched_tags = []
        for candidate in semantic_filters["tags"]:
            key = candidate.lower()
            if key in tag_lookup:
                matched_tags.append(tag_lookup[key])
                continue
            matched_tags.extend(
                actual_name
                for actual_key, actual_name in tag_lookup.items()
                if key in actual_key or actual_key in key
            )
        matched_tags = sorted(set(matched_tags), key=str.lower)

        conditions = []
        if matched_tags:
            lowered_tags = [tag_name.lower() for tag_name in matched_tags]
            conditions.append(File.tags.any(func.lower(Tag.name).in_(lowered_tags)))
        if semantic_filters["keywords"]:
            conditions.append(or_(*[File.name.ilike(f"%{keyword}%") for keyword in semantic_filters["keywords"]]))
        if semantic_filters["mime_types"]:
            conditions.append(or_(*[File.mime_type.ilike(f"{mime_prefix}%") for mime_prefix in semantic_filters["mime_types"]]))

        if not conditions:
            response.headers["X-Smart-Search-Used"] = "false"
            return _regular_search_results(db, query)

        results = (
            db.query(File)
            .filter(or_(*conditions))
            .distinct()
            .order_by(File.created_at.desc())
            .limit(100)
            .all()
        )
        response.headers["X-Smart-Search-Used"] = "true"
        return results
    except (httpx.HTTPError, httpx.TimeoutException, json.JSONDecodeError, KeyError, TypeError, ValueError):
        response.headers["X-Smart-Search-Used"] = "false"
        return _regular_search_results(db, query)


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
def download_file(file_id: int, token: str = None, db: Session = Depends(get_db)):
    from jose import jwt, JWTError
    user = None
    if token:
        try:
            payload = jwt.decode(token, settings.SECRET, algorithms=["HS256"])
            username = payload.get("sub")
            if username:
                user = db.query(User).filter(User.username == username).first()
        except JWTError:
            pass
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    f = db.query(File).filter(File.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    abs_path = get_abs_path(f.path)
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="File missing from storage")
    return FileResponse(abs_path, filename=f.name, media_type=f.mime_type)


@router.get("/{file_id}/thumb")
def get_thumbnail(file_id: int, token: str = None, db: Session = Depends(get_db)):
    from jose import jwt, JWTError
    user = None
    if token:
        try:
            payload = jwt.decode(token, settings.SECRET, algorithms=["HS256"])
            username = payload.get("sub")
            if username:
                user = db.query(User).filter(User.username == username).first()
        except JWTError:
            pass
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
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


class BulkTagRequest(BaseModel):
    file_ids: list[int]
    tag_ids: list[int]


@router.post("/bulk/tags")
def bulk_assign_tags(
    req: BulkTagRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Assign tags to multiple files at once."""
    files = db.query(File).filter(File.id.in_(req.file_ids)).all()
    tags = db.query(Tag).filter(Tag.id.in_(req.tag_ids)).all()
    for f in files:
        for tag in tags:
            if tag not in f.tags:
                f.tags.append(tag)
    db.commit()
    return {"detail": f"Tagged {len(files)} files with {len(tags)} tags"}


class BulkDeleteRequest(BaseModel):
    file_ids: list[int]


@router.post("/bulk/delete")
def bulk_delete_files(
    req: BulkDeleteRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete multiple files at once."""
    files = db.query(File).filter(File.id.in_(req.file_ids)).all()
    count = 0
    for f in files:
        try:
            delete_file(f.path)
            if f.thumbnail_path:
                delete_file(f.thumbnail_path)
        except Exception:
            pass
        db.delete(f)
        count += 1
    db.commit()
    return {"detail": f"Deleted {count} files"}
