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


def test_cluster_faces_groups_by_similarity() -> None:
    """Greedy clustering: same-person faces group, distinct people don't."""
    from app.db import Face
    from app.library import _cluster_faces

    rng = np.random.default_rng(42)

    def mk(i: int, photo_id: str, base: np.ndarray) -> Face:
        f = Face(
            id=f"f{i}",
            photo_id=photo_id,
            bbox="[0,0,100,100]",
            crop_key="x",
            token=f"t{i}",
            vec=base,
        )
        return f

    a = rng.normal(size=512).astype(np.float32)
    a /= np.linalg.norm(a)
    b = rng.normal(size=512).astype(np.float32)
    b /= np.linalg.norm(b)
    c = rng.normal(size=512).astype(np.float32)
    c /= np.linalg.norm(c)

    faces = [
        *[mk(i, "p1", a + rng.normal(scale=0.05, size=512).astype(np.float32)) for i in range(3)],
        *[mk(i, "p2", b + rng.normal(scale=0.05, size=512).astype(np.float32)) for i in range(3, 5)],
        mk(5, "p3", c),
    ]
    clusters = _cluster_faces(faces, 0.42)
    sizes = sorted(len(cl["face_ids"]) for cl in clusters)
    assert sizes == [1, 2, 3]
    # Every face appears in exactly one cluster.
    all_ids = [fid for cl in clusters for fid in cl["face_ids"]]
    assert len(all_ids) == len(set(all_ids)) == 6


def test_storage_key_validator_shared_by_both_backends() -> None:
    # This is the guard S3Storage uses too, so both backends get it.
    validate_key("photos/abc-123_x.jpg")
    validate_key("selfies/uuid.jpg")
    for bad in ("../../etc/passwd", "weird name!.jpg", "no-extension", "UPPER/Path.jpg"):
        with pytest.raises(StorageError):
            validate_key(bad)
