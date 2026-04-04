import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import NoteChannel, NoteReply, NoteTopic, User
from ..schemas import (
    NoteCategoryUpdate,
    NoteReplyCreate,
    NoteReplyUpdate,
    NoteTopicCreate,
    NoteTopicUpdate,
)

router = APIRouter()


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return slug or "notes"


def _unique_channel_slug(db: Session, name: str, exclude_id: int | None = None) -> str:
    base = _slugify(name)
    slug = base
    index = 2
    while True:
        query = db.query(NoteChannel).filter(NoteChannel.slug == slug)
        if exclude_id is not None:
            query = query.filter(NoteChannel.id != exclude_id)
        if not query.first():
            return slug
        slug = f"{base}-{index}"
        index += 1


def _topic_preview(body: str, limit: int = 180) -> str:
    compact = " ".join((body or "").split())
    if len(compact) <= limit:
        return compact
    return f"{compact[: limit - 1].rstrip()}…"


def _topic_summary(topic: NoteTopic) -> dict:
    return {
        "id": topic.id,
        "channel_id": topic.channel_id,
        "channel_slug": topic.channel.slug if topic.channel else "",
        "title": topic.title,
        "body_preview": _topic_preview(topic.body),
        "author": topic.author,
        "created_at": topic.created_at,
        "updated_at": topic.updated_at,
        "reply_count": len(topic.replies),
    }


def _topic_detail(topic: NoteTopic) -> dict:
    return {
        "id": topic.id,
        "channel_id": topic.channel_id,
        "channel_slug": topic.channel.slug if topic.channel else "",
        "title": topic.title,
        "body": topic.body,
        "author": topic.author,
        "created_at": topic.created_at,
        "updated_at": topic.updated_at,
        "reply_count": len(topic.replies),
        "replies": [
            {
                "id": reply.id,
                "topic_id": reply.topic_id,
                "body": reply.body,
                "author": reply.author,
                "created_at": reply.created_at,
                "updated_at": reply.updated_at,
            }
            for reply in topic.replies
        ],
    }


def _category_payload(channel: NoteChannel, latest_activity_at: datetime | None = None) -> dict:
    return {
        "id": channel.id,
        "name": channel.name,
        "slug": channel.slug,
        "description": channel.description,
        "color": channel.color,
        "sort_order": channel.sort_order,
        "topic_count": len(channel.topics),
        "latest_activity_at": latest_activity_at or channel.updated_at,
    }


@router.get("/categories")
def list_categories(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    channels = db.query(NoteChannel).order_by(NoteChannel.sort_order.asc(), NoteChannel.name.asc()).all()
    payload = []
    for channel in channels:
        latest_topic = (
            db.query(NoteTopic.updated_at)
            .filter(NoteTopic.channel_id == channel.id)
            .order_by(NoteTopic.updated_at.desc())
            .first()
        )
        payload.append(_category_payload(channel, latest_topic[0] if latest_topic else None))
    return payload


@router.put("/categories/{category_id}")
def update_category(
    category_id: int,
    body: NoteCategoryUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = db.query(NoteChannel).filter(NoteChannel.id == category_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Category not found")

    channel.name = body.name.strip()
    channel.slug = _unique_channel_slug(db, channel.name, exclude_id=channel.id)
    channel.description = body.description.strip()
    channel.color = body.color.strip() or channel.color
    channel.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(channel)
    return _category_payload(channel)


@router.get("/categories/{category_id}/notes")
def list_notes(category_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    channel = db.query(NoteChannel).filter(NoteChannel.id == category_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Category not found")
    topics = (
        db.query(NoteTopic)
        .filter(NoteTopic.channel_id == category_id)
        .order_by(NoteTopic.updated_at.desc(), NoteTopic.created_at.desc())
        .all()
    )
    return [_topic_summary(topic) for topic in topics]


@router.get("/notes/{note_id}")
def get_note(note_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    topic = db.query(NoteTopic).filter(NoteTopic.id == note_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Note not found")
    return _topic_detail(topic)


@router.post("/notes", status_code=201)
def create_note(body: NoteTopicCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    channel = db.query(NoteChannel).filter(NoteChannel.id == body.channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Category not found")

    now = datetime.utcnow()
    topic = NoteTopic(
        channel_id=body.channel_id,
        title=body.title.strip(),
        body=body.body.strip(),
        author=user.username,
        created_at=now,
        updated_at=now,
    )
    channel.updated_at = now
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return _topic_detail(topic)


@router.put("/notes/{note_id}")
def update_note(
    note_id: int,
    body: NoteTopicUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    topic = db.query(NoteTopic).filter(NoteTopic.id == note_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Note not found")

    now = datetime.utcnow()
    topic.title = body.title.strip()
    topic.body = body.body.strip()
    topic.updated_at = now
    if topic.channel:
        topic.channel.updated_at = now
    db.commit()
    db.refresh(topic)
    return _topic_detail(topic)


@router.post("/notes/{note_id}/replies", status_code=201)
def create_reply(
    note_id: int,
    body: NoteReplyCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    topic = db.query(NoteTopic).filter(NoteTopic.id == note_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Note not found")

    now = datetime.utcnow()
    reply = NoteReply(
        topic_id=note_id,
        body=body.body.strip(),
        author=user.username,
        created_at=now,
        updated_at=now,
    )
    topic.updated_at = now
    if topic.channel:
        topic.channel.updated_at = now
    db.add(reply)
    db.commit()
    db.refresh(topic)
    return _topic_detail(topic)


@router.put("/replies/{reply_id}")
def update_reply(
    reply_id: int,
    body: NoteReplyUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reply = db.query(NoteReply).filter(NoteReply.id == reply_id).first()
    if not reply:
        raise HTTPException(status_code=404, detail="Reply not found")

    now = datetime.utcnow()
    reply.body = body.body.strip()
    reply.updated_at = now
    if reply.topic:
        reply.topic.updated_at = now
        if reply.topic.channel:
            reply.topic.channel.updated_at = now
    db.commit()
    db.refresh(reply)
    db.refresh(reply.topic)
    return _topic_detail(reply.topic)


@router.get("/summary")
def notes_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    total_channels = db.query(func.count(NoteChannel.id)).scalar() or 0
    total_topics = db.query(func.count(NoteTopic.id)).scalar() or 0
    total_replies = db.query(func.count(NoteReply.id)).scalar() or 0
    latest_topic = db.query(NoteTopic.updated_at).order_by(NoteTopic.updated_at.desc()).first()
    latest_reply = db.query(NoteReply.updated_at).order_by(NoteReply.updated_at.desc()).first()
    latest_activity_at = max(
        [value for value in [latest_topic[0] if latest_topic else None, latest_reply[0] if latest_reply else None] if value],
        default=None,
    )
    return {
        "total_channels": total_channels,
        "total_topics": total_topics,
        "total_replies": total_replies,
        "latest_activity_at": latest_activity_at,
    }


# Legacy aliases for the first Notes rollout.
@router.get("/channels")
def list_channels(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list_categories(user=user, db=db)


@router.put("/channels/{channel_id}")
def update_channel(
    channel_id: int,
    body: NoteCategoryUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return update_category(category_id=channel_id, body=body, user=user, db=db)


@router.get("/channels/{channel_id}/topics")
def list_topics(channel_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list_notes(category_id=channel_id, user=user, db=db)


@router.get("/topics/{topic_id}")
def get_topic(topic_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_note(note_id=topic_id, user=user, db=db)


@router.post("/topics", status_code=201)
def create_topic(body: NoteTopicCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return create_note(body=body, user=user, db=db)


@router.put("/topics/{topic_id}")
def update_topic(
    topic_id: int,
    body: NoteTopicUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return update_note(note_id=topic_id, body=body, user=user, db=db)


@router.post("/topics/{topic_id}/replies", status_code=201)
def create_topic_reply(
    topic_id: int,
    body: NoteReplyCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return create_reply(note_id=topic_id, body=body, user=user, db=db)
