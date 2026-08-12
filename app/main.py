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

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app import pipeline
from app.config import settings
from app.db import Face, engine, SessionLocal
from app.storage import LocalStorage, storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("peekaboo")

BASE_DIR = Path(__file__).resolve().parent
WEB_DIST = BASE_DIR.parent / "web" / "dist"


@asynccontextmanager
async def lifespan(_app: FastAPI):
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
def api_upload(request: Request, file: UploadFile = File(...)):
    # Sync endpoint: FastAPI runs it in a threadpool, keeping the blocking
    # face-detection off the event loop.
    data = file.file.read()
    try:
        result = pipeline.process_upload(data, file.filename or "photo.jpg")
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
