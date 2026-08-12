"""Peekaboo — FastAPI application.

Flow:
  1. Uploader posts a photo -> every face is detected, embedded (ArcFace 512d)
     and stored in Neon/pgvector. Each face gets a secret claim token.
  2. The uploader shares the per-face link (WhatsApp etc.).
  3. The person in the photo opens /claim/<token> (React SPA), verifies with a
     selfie.
  4. If the selfie matches, they see every photo in the database containing them.

Frontend: a React SPA (web/) built to web/dist and served by this app. During
development you can also run `npm run dev` (port 5173) which proxies /api here.

Privacy: photos are only served when the requester presents a token belonging
to a face in (or matching) that photo.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

import uuid

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, text

from app import auth, library, pipeline
from app.config import settings
from app.db import Face, User, engine, SessionLocal
from app.storage import LocalStorage, storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("peekaboo")

BASE_DIR = Path(__file__).resolve().parent
WEB_DIST = BASE_DIR.parent / "web" / "dist"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.jwt_secret == "dev-only-secret-change-me-in-production":
        logger.warning(
            "JWT_SECRET is the dev default. Generate a real secret before deploying: "
            "python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    pipeline.init_pipeline()
    yield


app = FastAPI(title="Peekaboo", version="0.3.0", lifespan=lifespan)

# Allow the Vite dev server (port 5173) to call the API during development.
# In production the SPA is same-origin, so this is only for `npm run dev`.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        o for o in ("http://localhost:5173", "http://127.0.0.1:5173", settings.public_base_url) if o
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


def base_url(request: Request) -> str:
    if settings.public_base_url:
        return settings.public_base_url
    return str(request.base_url).rstrip("/")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class SignupBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=120)


class LoginBody(BaseModel):
    email: EmailStr
    password: str


@app.post("/api/auth/signup")
def api_signup(body: SignupBody, request: Request):
    if not auth.signup_limiter.allow(auth.client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again shortly.")
    # bcrypt only considers the first 72 bytes — reject longer passwords up
    # front instead of silently treating two different passwords as equal.
    if len(body.password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password must be at most 72 bytes.")
    email = body.email.lower()
    with SessionLocal() as session:
        if session.scalar(select(User).where(User.email == email)) is not None:
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            name=body.name,
            password_hash=auth.hash_password(body.password),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    resp = JSONResponse(status_code=201, content=auth.user_dict(user))
    auth.set_session_cookie(resp, user.id)
    return resp


@app.post("/api/auth/login")
def api_login(body: LoginBody, request: Request):
    if not auth.login_limiter.allow(auth.client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again shortly.")
    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.email == body.email.lower()))
    # Always run bcrypt (against a dummy hash for unknown emails) so the
    # response time doesn't reveal which emails are registered.
    ok = auth.verify_password(body.password, user.password_hash if user else auth.DUMMY_HASH)
    if user is None or not ok:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    resp = JSONResponse(content=auth.user_dict(user))
    auth.set_session_cookie(resp, user.id)
    return resp


@app.get("/api/auth/config")
def api_auth_config():
    """Public capabilities the UI needs (e.g. whether to show Google SSO)."""
    return {"google_sso": auth.google_sso_enabled()}


@app.post("/api/auth/logout")
def api_logout():
    resp = JSONResponse(content={"status": "ok"})
    auth.clear_session_cookie(resp)
    return resp


@app.get("/api/auth/me")
def api_me(user: User = Depends(auth.get_current_user)):
    return auth.user_dict(user)


@app.get("/api/auth/google")
def api_google_start():
    if not auth.google_sso_enabled():
        raise HTTPException(status_code=501, detail="Google sign-in is not configured.")
    state = auth.new_oauth_state()
    resp = RedirectResponse(auth.google_authorize_url(state))
    # Short-lived signed cookie holds the state we must match on the callback.
    resp.set_cookie("oauth_state", state, max_age=600, httponly=True, samesite="lax")
    return resp


@app.get("/api/auth/google/callback")
def api_google_callback(code: str, state: str, request: Request):
    if request.cookies.get("oauth_state") != state:
        raise HTTPException(status_code=400, detail="OAuth state mismatch.")
    try:
        profile = auth.google_exchange_code(code)
    except Exception as exc:
        logger.error("Google OAuth exchange failed: %s", exc)
        raise HTTPException(status_code=502, detail="Google sign-in failed.") from exc
    user = auth.find_or_create_google_user(profile)
    resp = RedirectResponse(url="/photos", status_code=303)
    auth.set_session_cookie(resp, user.id)
    resp.delete_cookie("oauth_state", path="/")
    return resp


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/health")
def health():
    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception as exc:  # pragma: no cover
        logger.error("DB health check failed: %s", exc)
    return {"status": "ok" if db_ok else "degraded", "db": db_ok}


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------


@app.post("/api/upload")
def api_upload(request: Request, file: UploadFile = File(...), user: User = Depends(auth.get_current_user)):
    # Sync endpoint: FastAPI runs it in a threadpool, keeping the blocking
    # face-detection off the event loop. Requires a signed-in account.
    data = file.file.read()
    try:
        result = pipeline.process_upload(data, file.filename or "photo.jpg", user.id)
    except pipeline.PipelineError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    base = base_url(request)
    return {
        "photo": {
            "id": result.photo_id,
            "width": result.width,
            "height": result.height,
            "url": f"{base}{result.photo_url}",
        },
        "faces": [
            {
                "id": f.face_id,
                "bbox": f.bbox,
                "crop_url": f"{base}{f.crop_url}",
                "share_url": f"{base}{f.share_url}",
                "token": f.token,
            }
            for f in result.faces
        ],
    }


@app.get("/api/library")
def api_library(user: User = Depends(auth.get_current_user)):
    """The signed-in user's library: all photos + people clusters."""
    return library.get_library(user.id)


class DeletePhotosBody(BaseModel):
    ids: list[str]


@app.delete("/api/photos")
def api_delete_photos(body: DeletePhotosBody, user: User = Depends(auth.get_current_user)):
    """Hard-delete photos (and their faces + stored files) for the signed-in user."""
    if not body.ids:
        raise HTTPException(status_code=400, detail="No photo ids given.")
    deleted = library.delete_photos(user.id, body.ids)
    return {"deleted": deleted}


@app.get("/api/claim-info/{token}")
def api_claim_info(token: str):
    """Public data the claim SPA needs: which face a token points to."""
    with SessionLocal() as session:
        face = session.scalar(
            text("SELECT id, photo_id FROM faces WHERE token = :t").bindparams(t=token)
        )
    if face is None:
        raise HTTPException(status_code=404, detail="Invalid or expired link.")
    face_id = face[0]
    return {
        "token": token,
        "face_id": face_id,
        "crop_url": f"/api/crop/{face_id}?token={token}",
    }


@app.post("/api/claim/{token}")
def api_claim(token: str, file: UploadFile = File(...)):
    data = file.file.read()
    try:
        result = pipeline.claim_face(token, data)
    except pipeline.LinkNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except pipeline.PipelineError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if result.status in ("rejected", "no_face"):
        return JSONResponse(
            status_code=403,
            content={
                "status": result.status,
                "similarity": result.similarity,
                "threshold": result.threshold,
            },
        )
    return {
        "status": "verified",
        "similarity": result.similarity,
        "threshold": result.threshold,
        "photos": result.photos,
    }


@app.get("/api/photo/{photo_id}")
def api_photo(photo_id: str, token: str):
    if not pipeline.photo_accessible(photo_id, token):
        raise HTTPException(status_code=403, detail="Not allowed to view this photo.")
    key = pipeline.get_photo_storage_key(photo_id)
    if not key:
        raise HTTPException(status_code=404, detail="Photo not found.")
    return _serve_image(key)


@app.get("/api/crop/{face_id}")
def api_crop(face_id: str, token: str):
    if not pipeline.face_crop_accessible(face_id, token):
        raise HTTPException(status_code=403, detail="Not allowed to view this face.")
    key = pipeline.get_face_crop_key(face_id)
    if not key:
        raise HTTPException(status_code=404, detail="Face not found.")
    return _serve_image(key)


def _serve_image(key: str, media_type: str = "image/jpeg"):
    """Stream an object from whichever storage backend is active."""
    if not storage.exists(key):
        raise HTTPException(status_code=404, detail="Not found.")
    if isinstance(storage, LocalStorage):
        return FileResponse(storage.path(key), media_type=media_type)
    return Response(content=storage.read(key), media_type=media_type)


# ---------------------------------------------------------------------------
# React SPA (served from web/dist when built)
# ---------------------------------------------------------------------------


if WEB_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", response_class=HTMLResponse)
    def spa(full_path: str):
        # API routes are registered above and take precedence; anything else is
        # the SPA. React Router handles /claim/<token> client-side.
        # Don't let the SPA fallback swallow unknown API paths.
        if full_path.startswith("api/") or full_path == "health":
            raise HTTPException(status_code=404, detail="Not found.")
        index = WEB_DIST / "index.html"
        if not index.is_file():
            raise HTTPException(status_code=503, detail="Frontend not built yet (run `npm run build` in web/).")
        return FileResponse(index, media_type="text/html")
else:
    @app.get("/", response_class=HTMLResponse)
    def spa_not_built():
        return HTMLResponse(
            "<h2>Peekaboo frontend not built.</h2>"
            "<p>Run <code>cd web && npm install && npm run build</code>, "
            "then restart this server.</p>"
        )
