from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import User, Tag, file_tags
from ..schemas import TagCreate, TagOut

router = APIRouter()


@router.get("", response_model=list[TagOut])
def list_tags(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Tag, func.count(file_tags.c.file_id).label("file_count"))
        .outerjoin(file_tags, Tag.id == file_tags.c.tag_id)
        .group_by(Tag.id)
        .order_by(Tag.name)
        .all()
    )
    return [
        TagOut(
            id=tag.id,
            name=tag.name,
            color=tag.color,
            created_at=tag.created_at,
            file_count=file_count,
        )
        for tag, file_count in rows
    ]


@router.post("", response_model=TagOut, status_code=201)
def create_tag(tag: TagCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(Tag).filter(Tag.name == tag.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="Tag already exists")
    db_tag = Tag(name=tag.name, color=tag.color)
    db.add(db_tag)
    db.commit()
    db.refresh(db_tag)
    return db_tag


@router.get("/{tag_id}", response_model=TagOut)
def get_tag(tag_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag


@router.put("/{tag_id}", response_model=TagOut)
def update_tag(tag_id: int, tag: TagCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not db_tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    if tag.name != db_tag.name:
        existing = db.query(Tag).filter(Tag.name == tag.name).first()
        if existing:
            raise HTTPException(status_code=409, detail="Tag name already taken")
    db_tag.name = tag.name
    db_tag.color = tag.color
    db.commit()
    db.refresh(db_tag)
    return db_tag


@router.delete("/{tag_id}")
def delete_tag(tag_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not db_tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.delete(db_tag)
    db.commit()
    return {"detail": "Deleted"}
