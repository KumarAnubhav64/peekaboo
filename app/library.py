"""Library view: a tenant's photos + "people" (face clusters).

Powers the redesigned Google-Photos-style library UI. Everything is scoped to
one tenant (the signed-in user).

People clustering is a simple greedy pass: faces are ordered by detection
size (larger, more reliable crops first) and each face joins the first
cluster whose representative embedding is within MATCH_THRESHOLD (cosine). It
is O(N * C) numpy dot products — plenty for a hobby-scale library, and it
reuses the exact same similarity semantics as the claim pipeline.
"""
from __future__ import annotations

import json
import logging

import numpy as np
from sqlalchemy import select

from app.config import settings
from app.db import Face, Photo, SessionLocal

logger = logging.getLogger("peekaboo.library")

# GPS clustering: photos within ~0.02° (~2 km) of a cluster centroid join it.
PLACE_RADIUS_DEG = 0.02


def _thumb(photo: Photo, by_photo: dict[str, Face]) -> str | None:
    f = by_photo.get(photo.id)
    return f"/api/crop/{f.id}?token={f.token}" if f else None


def _group_places(photos: list[Photo], by_photo: dict[str, Face]) -> list[dict]:
    """Group photos into 'places': GPS clusters for photos with coordinates,
    scene-label groups for the rest."""
    places: list[dict] = []

    # 1. GPS clusters (greedy centroid join within ~2 km).
    #    Note: joins against the RUNNING centroid with a Manhattan (deg)
    #    distance — fine for a hobby library, but the centroid drifts as
    #    photos join, so a far photo can merge into a big cluster or a revisit
    #    can split into two. Acceptable at this scale; a fixed-anchor +
    #    haversine pass is the upgrade path if clustering quality matters.
    gps_photos = [p for p in photos if p.lat is not None and p.lng is not None]
    clusters: list[dict] = []  # {lat, lng, ids, n}
    for p in gps_photos:
        placed = False
        for c in clusters:
            if abs(c["lat"] - p.lat) < PLACE_RADIUS_DEG and abs(c["lng"] - p.lng) < PLACE_RADIUS_DEG:
                n = c["n"]
                c["lat"] = (c["lat"] * n + p.lat) / (n + 1)
                c["lng"] = (c["lng"] * n + p.lng) / (n + 1)
                c["n"] += 1
                c["ids"].append(p.id)
                placed = True
                break
        if not placed:
            clusters.append({"lat": p.lat, "lng": p.lng, "n": 1, "ids": [p.id]})

    for i, c in enumerate(sorted(clusters, key=lambda x: -x["n"])):
        rep = next((p for p in gps_photos if p.id == c["ids"][0]), None)
        places.append(
            {
                "id": f"gps-{i}",
                "kind": "gps",
                "label": f"Place {i + 1}",
                "sub": f"{c['lat']:.4f}, {c['lng']:.4f}",
                "lat": round(c["lat"], 6),
                "lng": round(c["lng"], 6),
                "count": c["n"],
                "photo_ids": c["ids"],
                "thumb": _thumb(rep, by_photo) if rep else None,
            }
        )

    # 2. Scene groups for photos without GPS (most phone-less uploads).
    scene_groups: dict[str, list[Photo]] = {}
    for p in photos:
        if p.lat is None and p.scene:
            scene_groups.setdefault(p.scene, []).append(p)
    for scene, sps in sorted(scene_groups.items(), key=lambda kv: -len(kv[1])):
        rep = sps[0]
        places.append(
            {
                "id": f"scene-{scene.lower().replace(' ', '-')}",
                "kind": "scene",
                "label": scene,
                "sub": "Detected scene",
                "lat": None,
                "lng": None,
                "count": len(sps),
                "photo_ids": [p.id for p in sps],
                "thumb": _thumb(rep, by_photo),
            }
        )
    return places


# 'person' is COCO class 1, but the People view already clusters people —
# listing it under "Things" would be redundant, so it's excluded here.
EXCLUDED_THINGS = {"person"}


def _aggregate_things(photos: list[Photo]) -> list[dict]:
    """COCO tags across the library -> [{label, count, photo_ids}], biggest first.

    ``person`` is deliberately excluded (the People view owns that class);
    search-by-tag still matches it since photo.tags keeps it.
    """
    by_label: dict[str, list[str]] = {}
    for p in photos:
        if not p.tags:
            continue
        try:
            tags = json.loads(p.tags)
        except Exception:
            continue
        for t in tags:
            if t in EXCLUDED_THINGS:
                continue
            by_label.setdefault(t, []).append(p.id)
    return [
        {"label": label, "count": len(ids), "photo_ids": ids}
        for label, ids in sorted(by_label.items(), key=lambda kv: -len(kv[1]))
    ]


def _face_area(face: Face) -> float:
    try:
        x1, y1, x2, y2 = json.loads(face.bbox)
        return float((x2 - x1) * (y2 - y1))
    except Exception:
        return 0.0


def _cluster_faces(faces: list[Face], threshold: float) -> list[dict]:
    """Greedy clustering of faces by embedding similarity.

    Returns a list of clusters: {face_ids, photo_ids, rep (representative
    face id)}. Faces are grouped if cosine similarity to a cluster's
    representative is >= threshold.
    """
    if not faces:
        return []
    ordered = sorted(faces, key=_face_area, reverse=True)
    reps: list[list] = []  # [ [rep_vec, [face_ids], {photo_ids}] ]
    for f in ordered:
        v = np.asarray(f.vec, dtype=np.float32)
        best = -1
        best_sim = threshold
        for i, (rv, _ids, _pids) in enumerate(reps):
            sim = float(np.dot(v, rv))
            if sim > best_sim:
                best = i
                best_sim = sim
        if best == -1:
            reps.append([v, [f.id], {f.photo_id}])
        else:
            reps[best][1].append(f.id)
            reps[best][2].add(f.photo_id)
    return [
        {"face_ids": ids, "photo_ids": sorted(pids), "rep": ids[0]}
        for _v, ids, pids in reps
    ]


def get_library(tenant_id: str) -> dict:
    """All of a tenant's photos + people clusters, ready for the UI."""
    with SessionLocal() as session:
        photos = session.scalars(
            select(Photo).where(Photo.tenant_id == tenant_id).order_by(Photo.uploaded_at.desc())
        ).all()
        faces = session.scalars(
            select(Face).where(Face.tenant_id == tenant_id).order_by(Face.created_at.desc())
        ).all()

        # Largest face per photo -> best thumb + a token that unlocks it.
        by_photo: dict[str, Face] = {}
        by_face: dict[str, Face] = {}
        faces_by_photo: dict[str, list[Face]] = {}
        for f in faces:
            by_face[f.id] = f
            faces_by_photo.setdefault(f.photo_id, []).append(f)
            cur = by_photo.get(f.photo_id)
            if cur is None or _face_area(f) > _face_area(cur):
                by_photo[f.photo_id] = f

        photo_list = [
            {
                "id": p.id,
                "url": f"/api/photo/{p.id}?token={by_photo[p.id].token}" if p.id in by_photo else None,
                "thumb": f"/api/crop/{by_photo[p.id].id}?token={by_photo[p.id].token}" if p.id in by_photo else None,
                "width": p.width,
                "height": p.height,
                "num_faces": p.num_faces,
                "uploaded_at": p.uploaded_at.isoformat() if p.uploaded_at else None,
                "original_name": p.original_name,
                "share_url": f"/claim/{by_photo[p.id].token}" if p.id in by_photo else None,
                # Enrichment from vision + EXIF.
                "lat": p.lat,
                "lng": p.lng,
                "tags": json.loads(p.tags) if p.tags else [],
                "scene": p.scene,
                # Detected people in this photo. Tokens stay URL-only (they're
                # embedded in crop_url/share_url) — never returned as raw fields.
                "faces": [
                    {
                        "id": pf.id,
                        "crop_url": f"/api/crop/{pf.id}?token={pf.token}",
                        "share_url": f"/claim/{pf.token}",
                    }
                    for pf in sorted(faces_by_photo.get(p.id, []), key=_face_area, reverse=True)
                ],
            }
            for p in photos
        ]

        places = _group_places(photos, by_photo)
        things = _aggregate_things(photos)

        # People strip: one cluster per detected person. The representative
        # face's own token unlocks its crop.
        people = []
        for c in _cluster_faces(faces, settings.match_threshold):
            rep = by_face.get(c["rep"])
            people.append(
                {
                    "id": c["rep"],
                    "avatar": f"/api/crop/{c['rep']}?token={rep.token}" if rep else None,
                    "count": len(c["face_ids"]),
                    "face_ids": c["face_ids"],
                    "photo_ids": c["photo_ids"],
                }
            )

        return {"photos": photo_list, "people": people, "places": places, "things": things}
