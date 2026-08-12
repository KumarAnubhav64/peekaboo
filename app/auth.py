"""Self-hosted authentication: email/password + Google SSO.

Sessions are JWT (HS256) stored in an httpOnly, SameSite=Lax cookie — no token
leakage to JS, CSRF mitigated for state-changing requests. Password hashes use
bcrypt. Google SSO is the standard OAuth 2.0 authorization-code flow, done
directly with httpx so there are no framework dependencies.
"""
from __future__ import annotations

import logging
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import httpx
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal, User

logger = logging.getLogger("peekaboo.auth")

SESSION_COOKIE = "peekaboo_session"

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# Session tokens (JWT in httpOnly cookie)
# ---------------------------------------------------------------------------


def create_session_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(days=settings.session_days),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def read_session_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        return payload.get("sub")
    except (jwt.InvalidTokenError, KeyError):
        return None


def set_session_cookie(response: Response, user_id: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=create_session_token(user_id),
        max_age=settings.session_days * 24 * 3600,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


def get_current_user(request: Request) -> User:
    """FastAPI dependency: resolve the logged-in user or raise 401."""
    token = request.cookies.get(SESSION_COOKIE)
    user_id = read_session_token(token) if token else None
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in.")
    with SessionLocal() as session:
        user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account no longer exists.")
    return user


def user_dict(user: User) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name, "avatar_url": user.avatar_url}


# ---------------------------------------------------------------------------
# Rate limiting (tiny in-memory sliding window; fine for a single instance)
# ---------------------------------------------------------------------------


class RateLimiter:
    def __init__(self, max_hits: int, window_seconds: int) -> None:
        self.max_hits = max_hits
        self.window = window_seconds
        self._hits: dict[str, list[float]] = {}

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        hits = [t for t in self._hits.get(key, []) if now - t < self.window]
        if len(hits) >= self.max_hits:
            self._hits[key] = hits
            return False
        hits.append(now)
        self._hits[key] = hits
        return True


login_limiter = RateLimiter(max_hits=10, window_seconds=60)
signup_limiter = RateLimiter(max_hits=5, window_seconds=60)


# ---------------------------------------------------------------------------
# Google SSO (OAuth 2.0 authorization-code flow)
# ---------------------------------------------------------------------------


def google_sso_enabled() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)


def google_redirect_uri() -> str:
    base = settings.public_base_url or "http://localhost:8000"
    return f"{base}/api/auth/google/callback"


def google_authorize_url(state: str) -> str:
    return (
        f"{GOOGLE_AUTH_URL}?client_id={settings.google_client_id}"
        f"&redirect_uri={google_redirect_uri()}"
        f"&response_type=code&scope=openid%20email%20profile&state={state}"
    )


def google_exchange_code(code: str) -> dict:
    """Trade the auth code for tokens, then fetch the user's profile."""
    with httpx.Client(timeout=15) as client:
        token_resp = client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": google_redirect_uri(),
                "grant_type": "authorization_code",
            },
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        user_resp = client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        user_resp.raise_for_status()
        return user_resp.json()


def find_or_create_google_user(profile: dict) -> User:
    """Find a user by google_sub (or email), creating the account if new."""
    sub = profile["sub"]
    email = profile.get("email", "")
    name = profile.get("name")
    picture = profile.get("picture")

    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.google_sub == sub))
        if user is None and email:
            user = session.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                id=str(uuid.uuid4()),
                email=email or f"{sub}@google.local",
                name=name,
                google_sub=sub,
                avatar_url=picture,
            )
            session.add(user)
        else:
            if user.google_sub is None:
                user.google_sub = sub
            if name and not user.name:
                user.name = name
            if picture:
                user.avatar_url = picture
        session.commit()
        session.refresh(user)
        return user


def new_oauth_state() -> str:
    return secrets.token_urlsafe(24)
