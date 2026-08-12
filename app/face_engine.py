"""Face engine wrapper around InsightFace (SCRFD detection + ArcFace embedding).

The model pack is auto-downloaded from GitHub on first use into MODEL_DIR.
Embeddings are L2-normalized 512-dim float vectors, so cosine similarity is a
simple dot product — this is what we compare with pgvector's `<=>` operator.

Design notes for the local (laptop) vs deployed variant:
  * Laptop: buffalo_l + det_size 640 for maximum accuracy (this machine).
  * Deployed: set FACE_MODEL=buffalo_s / DET_SIZE=512 via env to cut model
    memory and CPU time on free-tier hosts without changing code.
"""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass

import cv2
import numpy as np

from app.config import settings

logger = logging.getLogger("faceclaim.engine")


@dataclass
class DetectedFace:
    # [x1, y1, x2, y2] in the coordinates of the image passed to `embed`.
    bbox: list[float]
    # L2-normalized ArcFace embedding (512 floats).
    embedding: np.ndarray
    # Area of the bounding box — used to pick the "main" face in a selfie.
    area: float

    def similarity(self, other: "DetectedFace") -> float:
        return float(np.dot(self.embedding, other.embedding))


class FaceEngine:
    """Lazy singleton around insightface.FaceAnalysis.

    Loads on first use (models are several hundred MB), guarded by a lock so a
    cold start doesn't try to initialize twice under concurrent requests.
    """

    _instance: "FaceEngine | None" = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        from insightface.app import FaceAnalysis

        self.app = FaceAnalysis(
            name=settings.face_model,
            root=str(settings.model_dir),
            providers=["CPUExecutionProvider"],
        )
        self.app.prepare(ctx_id=-1, det_size=(settings.det_size, settings.det_size))
        logger.info(
            "Face engine loaded: model=%s det_size=%s", settings.face_model, settings.det_size
        )

    @classmethod
    def get(cls) -> "FaceEngine":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def detect(self, img_bgr: np.ndarray) -> list[DetectedFace]:
        """Detect faces and compute embeddings for a BGR uint8 image."""
        faces = self.app.get(img_bgr)
        result: list[DetectedFace] = []
        for f in faces:
            x1, y1, x2, y2 = (float(v) for v in f.bbox)
            result.append(
                DetectedFace(
                    bbox=[x1, y1, x2, y2],
                    embedding=np.asarray(f.normed_embedding, dtype=np.float32),
                    area=(x2 - x1) * (y2 - y1),
                )
            )
        return result


def get_engine() -> FaceEngine:
    return FaceEngine.get()
