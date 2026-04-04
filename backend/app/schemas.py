from datetime import datetime
from pydantic import BaseModel, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    username: str
    password: str


class TagBase(BaseModel):
    name: str
    color: str = "#6366f1"


class TagCreate(TagBase):
    pass


class TagOut(TagBase):
    id: int
    created_at: datetime
    file_count: int = 0

    class Config:
        from_attributes = True


class FileOut(BaseModel):
    id: int
    name: str
    size: int
    mime_type: str | None
    thumbnail_path: str | None = None
    created_at: datetime
    updated_at: datetime
    tags: list[TagOut] = []

    class Config:
        from_attributes = True


class NoteChannelOut(BaseModel):
    id: int
    name: str
    slug: str
    description: str
    color: str
    sort_order: int
    topic_count: int = 0
    latest_activity_at: datetime | None = None


class NoteCategoryUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)
    color: str = Field(default="slate", min_length=1, max_length=32)


class NoteTopicSummaryOut(BaseModel):
    id: int
    channel_id: int
    channel_slug: str
    title: str
    body_preview: str = ""
    author: str
    created_at: datetime
    updated_at: datetime
    reply_count: int = 0


class NoteReplyOut(BaseModel):
    id: int
    topic_id: int
    body: str
    author: str
    created_at: datetime
    updated_at: datetime


class NoteTopicDetailOut(BaseModel):
    id: int
    channel_id: int
    channel_slug: str
    title: str
    body: str
    author: str
    created_at: datetime
    updated_at: datetime
    reply_count: int = 0
    replies: list[NoteReplyOut] = []


class NoteTopicCreate(BaseModel):
    channel_id: int
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)


class NoteTopicUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)


class NoteReplyCreate(BaseModel):
    body: str = Field(min_length=1)


class NoteReplyUpdate(BaseModel):
    body: str = Field(min_length=1)


class NotesSummaryOut(BaseModel):
    total_channels: int
    total_topics: int
    total_replies: int
    latest_activity_at: datetime | None = None
