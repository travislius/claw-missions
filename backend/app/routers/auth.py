from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import LoginRequest, Token
from ..auth import verify_password, create_access_token, get_current_user

router = APIRouter()


@router.post("/login", response_model=Token)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return Token(access_token=create_access_token(user.username))


@router.post("/refresh", response_model=Token)
def refresh(user: User = Depends(get_current_user)):
    return Token(access_token=create_access_token(user.username))
