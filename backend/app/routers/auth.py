import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import LoginRequest, Token
from ..auth import verify_password, create_access_token, get_current_user

router = APIRouter()

# Simple in-memory rate limiter: {ip: [timestamp, ...]}
_login_attempts: dict = defaultdict(list)
_RATE_WINDOW = 300   # 5 minutes
_RATE_MAX = 5        # max attempts per window


def _check_rate_limit(ip: str):
    now = time.time()
    attempts = [t for t in _login_attempts[ip] if now - t < _RATE_WINDOW]
    _login_attempts[ip] = attempts
    if len(attempts) >= _RATE_MAX:
        raise HTTPException(
            status_code=429,
            detail=f"Too many login attempts. Try again in {_RATE_WINDOW // 60} minutes.",
        )
    _login_attempts[ip].append(now)


@router.post("/login", response_model=Token, summary="Login and get JWT token")
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip)
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    # Clear attempts on successful login
    _login_attempts.pop(ip, None)
    return Token(access_token=create_access_token(user.username))


@router.post("/refresh", response_model=Token, summary="Refresh JWT token")
def refresh(user: User = Depends(get_current_user)):
    return Token(access_token=create_access_token(user.username))
