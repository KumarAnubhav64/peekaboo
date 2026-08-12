"""Unit tests for pure logic (no database / no model weights needed)."""
from __future__ import annotations

import numpy as np
import pytest

from app.face_engine import DetectedFace
from app.pipeline import crop_face, decode_image, encode_jpeg, PipelineError
from app.storage import LocalStorage, StorageError, validate_key


def test_similarity_matches_identical_vectors() -> None:
    vec = np.random.default_rng(0).normal(size=512).astype(np.float32)
    vec /= np.linalg.norm(vec)
    a = DetectedFace([0, 0, 10, 10], vec, 100.0)
    b = DetectedFace([0, 0, 10, 10], vec.copy(), 100.0)
    assert a.similarity(b) == pytest.approx(1.0, abs=1e-5)


def test_similarity_orthogonal_vectors() -> None:
    rng = np.random.default_rng(1)
    a = rng.normal(size=512).astype(np.float32)
    a /= np.linalg.norm(a)
    # Build a vector orthogonal to a.
    b = rng.normal(size=512).astype(np.float32)
    b = b - np.dot(a, b) * a
    b /= np.linalg.norm(b)
    fa = DetectedFace([0, 0, 10, 10], a, 100.0)
    fb = DetectedFace([0, 0, 10, 10], b, 100.0)
    assert fa.similarity(fb) == pytest.approx(0.0, abs=1e-3)


def test_decode_image_rejects_garbage() -> None:
    with pytest.raises(PipelineError):
        decode_image(b"this is not an image at all")


def test_decode_and_encode_roundtrip() -> None:
    rng = np.random.default_rng(2)
    img = (rng.random((60, 80, 3)) * 255).astype(np.uint8)
    bgr = np.ascontiguousarray(img[:, :, ::-1])  # RGB -> BGR
    data = encode_jpeg(bgr)
    decoded, w, h = decode_image(data)
    assert (w, h) == (80, 60)
    assert decoded.shape == (60, 80, 3)


def test_crop_face_with_margin_stays_in_bounds() -> None:
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    # Face occupying most of the image — margin expansion must clamp.
    crop = crop_face(img, [30, 30, 70, 70], margin=0.5)
    assert crop.shape[0] <= 100 and crop.shape[1] <= 100
    assert crop.shape[0] >= 40  # full box with margin


def test_storage_rejects_path_traversal() -> None:
    store = LocalStorage(root="data/test-storage")
    store.save("photos/abc.jpg", b"x")
    assert store.exists("photos/abc.jpg")
    assert store.read("photos/abc.jpg") == b"x"
    with pytest.raises(StorageError):
        store._safe("../../etc/passwd")
    with pytest.raises(StorageError):
        store.save("weird name!.jpg", b"x")


def test_storage_key_validator_shared_by_both_backends() -> None:
    # This is the guard S3Storage uses too, so both backends get it.
    validate_key("photos/abc-123_x.jpg")
    validate_key("selfies/uuid.jpg")
    for bad in ("../../etc/passwd", "weird name!.jpg", "no-extension", "UPPER/Path.jpg"):
        with pytest.raises(StorageError):
            validate_key(bad)
