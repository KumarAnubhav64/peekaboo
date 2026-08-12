"""Lightweight ONNX vision classifiers for photo enrichment.

* ``detect_objects`` — SSD MobileNet V1 (COCO 80 classes, Apache-2.0) → the
  "Things" tags on a photo (people, animals, vehicles, objects…).
* ``classify_scene`` — Places365 ResNet-18 (MIT/BSD) → the scene/place label
  used by the "Places" view when a photo has no GPS coordinates.

Both run on CPU via onnxruntime and are loaded lazily (first use). They are
strictly optional: if a model file is missing or inference fails, the caller
gets ``None``/``[]`` and the upload still succeeds — classification is an
enrichment, not a gate.
"""
from __future__ import annotations

import logging
import threading

import cv2
import numpy as np

from app.config import settings

logger = logging.getLogger("peekaboo.vision")

# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------

# COCO 80 classes, 0-indexed (SSD outputs 1-indexed class ids — subtract 1).
COCO_LABELS = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck",
    "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench",
    "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra",
    "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
    "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove",
    "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup",
    "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
    "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
    "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
    "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier",
    "toothbrush",
]

# Subset used by the "Animals" section of the Things view.
ANIMAL_LABELS = {
    "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe",
}

_PLACES_LABEL_FILE = "categories_places365.txt"

# ---------------------------------------------------------------------------
# Lazy onnxruntime sessions
# ---------------------------------------------------------------------------

_session_lock = threading.Lock()
_sessions: dict[str, object] = {}


def _session(name: str):
    """Cached onnxruntime session for `name`, or None if the model is unusable.

    Failures are NOT cached: if a model file appears later (e.g. a deployment
    that downloads models after boot), the next call self-heals.
    """
    with _session_lock:
        cached = _sessions.get(name)
        if cached is not None:
            return cached
        path = settings.model_dir / name
        if not path.exists():
            logger.warning("vision model missing: %s (classification disabled)", path)
            return None
        try:
            import onnxruntime as ort

            sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
            _sessions[name] = sess
            return sess
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("failed to load vision model %s: %s", name, exc)
            return None


_places_labels: dict[int, str] | None = None


def _load_places_labels() -> dict[int, str] | None:
    """Parse the 365-label file once, cache the result for the process lifetime."""
    global _places_labels
    if _places_labels is not None:
        return _places_labels
    path = settings.model_dir / _PLACES_LABEL_FILE
    if not path.exists():
        return None
    labels: dict[int, str] = {}
    for line in path.read_text().splitlines():
        parts = line.strip().rsplit(" ", 1)
        if len(parts) == 2 and parts[1].isdigit():
            labels.setdefault(int(parts[1]), parts[0])
    _places_labels = labels or None
    return _places_labels


def clean_scene_label(raw: str) -> str:
    """'legislative_chamber' -> 'Legislative chamber' (strip the /x/ prefix)."""
    name = raw.rsplit("/", 1)[-1].replace("_", " ").strip()
    return name[:1].upper() + name[1:] if name else raw


# ---------------------------------------------------------------------------
# Object detection ("Things")
# ---------------------------------------------------------------------------

# SSD on a low-res input is less confident than modern detectors; 0.4 balances
# precision vs recall for a hobby library.
OBJECT_SCORE_THRESHOLD = 0.40
MAX_OBJECT_TAGS = 6


def detect_objects(img_bgr: np.ndarray) -> list[str]:
    """Return up to MAX_OBJECT_TAGS unique COCO labels present in the image."""
    try:
        sess = _session("ssd_mobilenet_v1.onnx")
        if sess is None:
            return []
        resized = cv2.resize(img_bgr, (300, 300))
        x = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)[None, ...].astype(np.uint8)  # NHWC
        # onnxmodelzoo ssd_mobilenet_v1_10 output order: boxes, classes, scores, num
        _boxes, classes, scores, num = sess.run(None, {"image_tensor:0": x})
        n = int(num[0]) if num is not None else 0
        hits: list[tuple[float, str]] = []
        for i in range(min(n, len(scores[0]))):
            score = float(scores[0][i])
            if score < OBJECT_SCORE_THRESHOLD:
                continue
            cls = int(classes[0][i]) - 1  # 1-indexed COCO -> 0-indexed
            if 0 <= cls < len(COCO_LABELS):
                hits.append((score, COCO_LABELS[cls]))
        seen: set[str] = set()
        out: list[str] = []
        for _score, label in sorted(hits, reverse=True):
            if label not in seen:
                seen.add(label)
                out.append(label)
            if len(out) >= MAX_OBJECT_TAGS:
                break
        return out
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("object detection failed: %s", exc)
        return []


def has_animals(tags: list[str]) -> bool:
    return any(t in ANIMAL_LABELS for t in tags)


# ---------------------------------------------------------------------------
# Scene classification ("Places" fallback)
# ---------------------------------------------------------------------------

_PLACES_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_PLACES_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def classify_scene(img_bgr: np.ndarray) -> tuple[str, float] | None:
    """Return (cleaned scene label, softmax confidence) or None."""
    try:
        sess = _session("places365_resnet18.onnx")
        if sess is None:
            return None
        labels = _load_places_labels()
        if labels is None:
            return None
        resized = cv2.resize(img_bgr, (224, 224))
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        x = ((rgb - _PLACES_MEAN) / _PLACES_STD).transpose(2, 0, 1)[None, ...]  # NCHW
        out = sess.run(None, {"input": x})[0][0]
        probs = np.exp(out - out.max())
        probs /= probs.sum()
        idx = int(np.argmax(out))
        return clean_scene_label(labels.get(idx, f"scene_{idx}")), float(probs[idx])
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("scene classification failed: %s", exc)
        return None
