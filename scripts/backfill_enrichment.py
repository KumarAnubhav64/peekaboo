"""Backfill vision enrichment (tags + scene) for photos uploaded before it shipped.

EXIF GPS cannot be backfilled — the re-encoded stored image has no EXIF — but
the SSD object tags and Places365 scene label are recomputed from the stored
photo bytes, so old libraries light up the Places/Things views.

Usage::

    .venv/bin/python scripts/backfill_enrichment.py          # all tenants
    .venv/bin/python scripts/backfill_enrichment.py --dry-run # just report

Run from the project root. Enrichment is optional: a missing model disables
classification (tags/scene stay NULL), never fails the script.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2
import numpy as np
from sqlalchemy import select

from app import vision
from app.db import Photo, SessionLocal
from app.pipeline import decode_image
from app.storage import storage

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="count unenriched photos, change nothing")
    args = ap.parse_args()

    with SessionLocal() as session:
        photos = session.scalars(
            select(Photo).where(Photo.tags.is_(None)).order_by(Photo.uploaded_at)
        ).all()

    print(f"{len(photos)} photo(s) without enrichment")
    if not photos:
        return
    if args.dry_run:
        return

    updated = skipped = 0
    for p in photos:
        try:
            data = storage.read(p.storage_key)
            img_bgr, _, _ = decode_image(data)
        except Exception as exc:
            logging.warning("skip %s: %s", p.id, exc)
            skipped += 1
            continue
        tags = vision.detect_objects(img_bgr)
        scene = vision.classify_scene(img_bgr)
        with SessionLocal() as session:
            row = session.get(Photo, p.id)
            row.tags = json.dumps(tags) if tags else None
            row.scene = scene[0] if scene else None
            row.scene_conf = scene[1] if scene else None
            session.commit()
        updated += 1
        print(f"  {p.original_name}: tags={tags} scene={scene[0] if scene else None}")

    print(f"done: {updated} updated, {skipped} skipped")


if __name__ == "__main__":
    main()
