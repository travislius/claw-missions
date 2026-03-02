from datetime import datetime
from pydantic import BaseModel


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

    class Config:
        from_attributes = True


class FileOut(BaseModel):
    id: int
    name: str
    size: int
    mime_type: str | None
    created_at: datetime
    updated_at: datetime
    tags: list[TagOut] = []

    class Config:
        from_attributes = True
