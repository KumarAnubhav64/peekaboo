"""Unit tests for pure logic (no database / no model weights needed)."""
from __future__ import annotations

import json

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


# ---------------------------------------------------------------------------
# Photo enrichment (vision + EXIF)
# ---------------------------------------------------------------------------


def _jpeg_with_gps(lat: float, lng: float) -> bytes:
    """A tiny JPEG whose EXIF contains GPSInfo — as a phone camera would emit."""
    from io import BytesIO

    from PIL import Image

    img = Image.new("RGB", (60, 60), (120, 60, 30))
    exif = Image.Exif()
    gps = exif.get_ifd(0x8825)
    gps[1] = "S" if lat < 0 else "N"
    gps[2] = (abs(int(lat * 1000)), 1000)
    gps[3] = "W" if lng < 0 else "E"
    gps[4] = (abs(int(lng * 1000)), 1000)
    exif[0x8825] = gps
    buf = BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


def test_extract_gps_reads_exif() -> None:
    from app.pipeline import extract_gps

    assert extract_gps(_jpeg_with_gps(28.6139, 77.2090)) == pytest.approx((28.613, 77.209))
    # Southern / western hemispheres flip the sign.
    assert extract_gps(_jpeg_with_gps(-33.8688, -151.2093)) == pytest.approx((-33.868, -151.209))


def test_extract_gps_none_without_exif() -> None:
    from io import BytesIO

    from PIL import Image

    from app.pipeline import extract_gps

    buf = BytesIO()
    Image.new("RGB", (40, 40), (10, 10, 10)).save(buf, format="JPEG")
    assert extract_gps(buf.getvalue()) is None
    # Garbage bytes must never raise.
    assert extract_gps(b"not an image") is None


def test_aggregate_things_groups_tags_by_label() -> None:
    from app.db import Photo
    from app.library import _aggregate_things

    def mk(pid: str, tags: list[str]) -> Photo:
        return Photo(
            id=pid,
            tenant_id="t",
            original_name=f"{pid}.jpg",
            storage_key=f"photos/{pid}.jpg",
            width=10,
            height=10,
            tags=json.dumps(tags) if tags else None,
        )

    things = _aggregate_things(
        [
            mk("p1", ["person", "dog"]),
            mk("p2", ["person", "car"]),
            mk("p3", ["dog"]),
            mk("p4", None),  # unenriched photo must not break aggregation
        ]
    )
    by_label = {t["label"]: t for t in things}
    # "person" is excluded — the People view owns that class.
    assert "person" not in by_label
    assert by_label["dog"]["count"] == 2
    assert by_label["dog"]["photo_ids"] == ["p1", "p3"]
    assert by_label["car"]["count"] == 1
    assert by_label["car"]["photo_ids"] == ["p2"]
    # Biggest first (dog x2 before car x1).
    assert [t["label"] for t in things] == ["dog", "car"]


def test_group_places_clusters_gps_and_scenes() -> None:
    from app.db import Photo
    from app.library import _group_places

    def mk(pid: str, lat=None, lng=None, scene=None) -> Photo:
        return Photo(
            id=pid,
            tenant_id="t",
            original_name=f"{pid}.jpg",
            storage_key=f"photos/{pid}.jpg",
            width=10,
            height=10,
            lat=lat,
            lng=lng,
            scene=scene,
        )

    photos = [
        mk("p1", lat=28.61, lng=77.20),
        mk("p2", lat=28.62, lng=77.21),  # within ~2km of p1 -> same cluster
        mk("p3", lat=51.50, lng=-0.12),  # London — far away -> own cluster
        mk("p4", scene="Beach"),  # no GPS -> scene group
        mk("p5", scene="Beach"),
        mk("p6"),  # nothing -> skipped
    ]
    places = _group_places(photos, by_photo={})
    kinds = [p["kind"] for p in places]

    gps = [p for p in places if p["kind"] == "gps"]
    assert len(gps) == 2
    big = max(gps, key=lambda g: g["count"])
    assert big["count"] == 2
    assert set(big["photo_ids"]) == {"p1", "p2"}

    scenes = [p for p in places if p["kind"] == "scene"]
    assert len(scenes) == 1
    assert scenes[0]["label"] == "Beach"
    assert scenes[0]["count"] == 2


def test_scene_label_and_animal_helpers() -> None:
    from app.vision import clean_scene_label, has_animals

    assert clean_scene_label("legislative_chamber") == "Legislative chamber"
    assert clean_scene_label("/a/airport/terminal") == "Terminal"
    assert has_animals(["dog", "car"]) is True
    assert has_animals(["person", "laptop"]) is False
