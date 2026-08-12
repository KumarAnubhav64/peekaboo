"""Pipeline orchestrator: upload -> detect/embed -> token; claim -> verify -> search.

Kept free of web-framework concerns so it can be reused by the API layer,
CLI scripts, or tests.
"""
from __future__ import annotations

import io
import logging
import secrets
import uuid
from dataclasses import dataclass, field

import cv2
import numpy as np
from PIL import Image
from sqlalchemy import select

from app.config import settings
from app.db import Face, Photo, SessionLocal, init_db
from app.face_engine import DetectedFace, get_engine
from app.storage import storage

logger = logging.getLogger("faceclaim.pipeline")


class PipelineError(Exception):
    """Expected failure with a user-facing message."""


class LinkNotFound(PipelineError):
    """The claim token does not exist (maps to HTTP 404)."""


# ---------------------------------------------------------------------------
# DTOs
# ---------------------------------------------------------------------------


@dataclass
class FaceResult:
    face_id: str
    token: str
    bbox: list[float]
    crop_url: str
    share_url: str


@dataclass
class UploadResult:
    photo_id: str
    width: int
    height: int
    photo_url: str  # viewable with any face token from this photo
    faces: list[FaceResult] = field(default_factory=list)


@dataclass
class ClaimResult:
    status: str  # "verified" | "rejected" | "no_face"
    similarity: float
    threshold: float
    photo_id: str  # photo that originally contained the claimed face
    photos: list[dict] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------


def decode_image(data: bytes) -> tuple[np.ndarray, int, int]:
    """Decode image bytes -> BGR ndarray. Raises PipelineError if invalid."""
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as exc:
        raise PipelineError("Not a valid image file.") from exc

    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    # Downscale very large images to bound CPU/RAM on inference.
    longest = max(img.size)
    if longest > settings.max_image_side:
        scale = settings.max_image_side / longest
        img = img.resize(
            (max(1, int(img.width * scale)), max(1, int(img.height * scale))),
            Image.LANCZOS,
        )
    # Dimensions of the image that will actually be stored (bboxes are in
    # this coordinate space too).
    width, height = img.size

    arr = np.asarray(img)
    if arr.ndim == 2:  # grayscale -> fake RGB
        arr = np.stack([arr] * 3, axis=-1)
    bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    return bgr, width, height


def encode_jpeg(img_bgr: np.ndarray, quality: int = 90) -> bytes:
    ok, buf = cv2.imencode(".jpg", img_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise PipelineError("Could not encode image.")
    return buf.tobytes()


def crop_face(img_bgr: np.ndarray, bbox: list[float], margin: float = 0.30) -> np.ndarray:
    """Crop a face with `margin` expansion, clamped to image bounds."""
    h, w = img_bgr.shape[:2]
    x1, y1, x2, y2 = bbox
    bw, bh = x2 - x1, y2 - y1
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    half = max(bw, bh) / 2 * (1 + margin)
    nx1 = max(0, int(cx - half))
    ny1 = max(0, int(cy - half))
    nx2 = min(w, int(cx + half))
    ny2 = min(h, int(cy + half))
    return img_bgr[ny1:ny2, nx1:nx2]


# ---------------------------------------------------------------------------
# Upload flow
# ---------------------------------------------------------------------------


def process_upload(data: bytes, original_name: str) -> UploadResult:
    """Detect every face in an uploaded photo, store crops + embeddings, and
    mint one claim token per face. Returns the tokens so the uploader can
    share a link with each person in the photo."""
    if not data:
        raise PipelineError("Empty upload.")
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise PipelineError(
            f"File too large (max {settings.max_upload_mb} MB)."
        )

    img_bgr, width, height = decode_image(data)
    faces = get_engine().detect(img_bgr)
    if not faces:
        raise PipelineError("No face detected in this image.")

    photo_id = str(uuid.uuid4())
    photo_key = f"photos/{photo_id}.jpg"
    saved_keys: list[str] = []
    try:
        storage.save(photo_key, encode_jpeg(img_bgr, 92))
        saved_keys.append(photo_key)

        with SessionLocal() as session:
            session.add(
                Photo(
                    id=photo_id,
                    original_name=original_name or "photo.jpg",
                    storage_key=photo_key,
                    width=width,
                    height=height,
                    num_faces=len(faces),
                )
            )

            results: list[FaceResult] = []
            first_token = ""
            for face in faces:
                face_id = str(uuid.uuid4())
                token = secrets.token_urlsafe(18)
                if not first_token:
                    first_token = token
                crop_key = f"crops/{face_id}.jpg"
                storage.save(crop_key, encode_jpeg(crop_face(img_bgr, face.bbox)))
                saved_keys.append(crop_key)
                session.add(
                    Face(
                        id=face_id,
                        photo_id=photo_id,
                        bbox=str([round(v, 1) for v in face.bbox]),
                        crop_key=crop_key,
                        vec=face.embedding.tolist(),
                        token=token,
                    )
                )
                results.append(
                    FaceResult(
                        face_id=face_id,
                        token=token,
                        bbox=[round(v, 1) for v in face.bbox],
                        crop_url=f"/api/crop/{face_id}?token={token}",
                        share_url=f"/claim/{token}",
                    )
                )
            session.commit()
    except BaseException:
        # Don't leave orphaned objects behind if the DB transaction failed.
        for key in saved_keys:
            try:
                storage.delete(key)
            except Exception:
                pass
        raise

    logger.info("Uploaded photo %s with %d face(s)", photo_id, len(faces))
    return UploadResult(
        photo_id=photo_id,
        width=width,
        height=height,
        photo_url=f"/api/photo/{photo_id}?token={first_token}",
        faces=results,
    )


# ---------------------------------------------------------------------------
# Claim flow
# ---------------------------------------------------------------------------


def claim_face(token: str, selfie_data: bytes) -> ClaimResult:
    """Verify that the person uploading `selfie_data` is the person in the
    photo that `token` points to, then find every photo containing them."""
    with SessionLocal() as session:
        face = session.scalar(select(Face).where(Face.token == token))
        if face is None:
            raise LinkNotFound("Invalid or expired link.")
        if len(selfie_data) > settings.max_upload_mb * 1024 * 1024:
            raise PipelineError(f"Selfie too large (max {settings.max_upload_mb} MB).")

        selfie_bgr, _, _ = decode_image(selfie_data)
        selfie_faces = get_engine().detect(selfie_bgr)
        if not selfie_faces:
            return ClaimResult(
                status="no_face",
                similarity=0.0,
                threshold=settings.match_threshold,
                photo_id=face.photo_id,
            )

        # Use the largest face in the selfie.
        selfie_face: DetectedFace = max(selfie_faces, key=lambda f: f.area)
        target_face = DetectedFace(bbox=[0.0, 0.0, 0.0, 0.0], embedding=face.vec, area=0.0)
        sim = selfie_face.similarity(target_face)

        if sim < settings.match_threshold:
            return ClaimResult(
                status="rejected",
                similarity=round(sim, 4),
                threshold=settings.match_threshold,
                photo_id=face.photo_id,
            )

        # Verified! Record the selfie for audit and mark the face.
        selfie_key = f"selfies/{face.id}.jpg"
        storage.save(selfie_key, encode_jpeg(selfie_bgr))
        face.verified = True
        face.best_sim = round(sim, 4)
        face.selfie_key = selfie_key
        session.commit()

        # Find every face in the database that matches this person.
        matches = _search_matches(session, face.vec, settings.max_distance)
        # One entry per distinct photo (keep the best-matching face for the thumb).
        best_face: dict[str, str] = {}
        for photo_id, face_id in matches:
            if photo_id not in best_face:
                best_face[photo_id] = face_id
        photo_list = [
            {
                "photo_id": pid,
                "url": f"/api/photo/{pid}?token={token}",
                "thumb": f"/api/crop/{best_face[pid]}?token={token}",
            }
            for pid in best_face
        ]

        logger.info(
            "Claim %s verified (sim=%.3f), %d matching photo(s) found",
            token,
            sim,
            len(photo_list),
        )
        return ClaimResult(
            status="verified",
            similarity=round(sim, 4),
            threshold=settings.match_threshold,
            photo_id=face.photo_id,
            photos=photo_list,
        )


def _search_matches(session, vec, max_dist: float) -> list[tuple[str, str]]:
    """pgvector HNSW cosine search. Returns (photo_id, face_id) pairs."""
    from pgvector import Vector as PgVector
    from sqlalchemy import text

    rows = session.execute(
        text(
            """
            SELECT photo_id, id
            FROM faces
            WHERE vec <=> :q < :max_dist
            ORDER BY vec <=> :q
            LIMIT :limit
            """
        ),
        {"q": PgVector(vec), "max_dist": max_dist, "limit": settings.search_limit},
    ).all()
    return [(r[0], r[1]) for r in rows]


# ---------------------------------------------------------------------------
# Access control (token-gated image serving)
# ---------------------------------------------------------------------------


def photo_accessible(photo_id: str, token: str) -> bool:
    """A token grants access to a photo if the token's face is IN that photo,
    or the photo contains a face matching the token's face embedding."""
    with SessionLocal() as session:
        face = session.scalar(select(Face).where(Face.token == token))
        if face is None:
            return False
        photo_faces = session.scalars(
            select(Face).where(Face.photo_id == photo_id)
        ).all()
        for pf in photo_faces:
            if pf.token == token:
                return True
        for pf in photo_faces:
            if np.dot(face.vec, pf.vec) >= settings.match_threshold:
                return True
        return False


def face_crop_accessible(face_id: str, token: str) -> bool:
    with SessionLocal() as session:
        target = session.scalar(select(Face).where(Face.id == face_id))
        if target is None:
            return False
        claimer = session.scalar(select(Face).where(Face.token == token))
        if claimer is None:
            return False
        if target.token == token:
            return True
        return np.dot(claimer.vec, target.vec) >= settings.match_threshold


def get_photo_storage_key(photo_id: str) -> str | None:
    with SessionLocal() as session:
        photo = session.get(Photo, photo_id)
        return photo.storage_key if photo else None


def get_face_crop_key(face_id: str) -> str | None:
    with SessionLocal() as session:
        face = session.get(Face, face_id)
        return face.crop_key if face else None


def init_pipeline() -> None:
    init_db()
