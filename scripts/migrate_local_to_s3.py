"""One-off: migrate a local-disk library into the S3 bucket.

Copies every file under DATA_DIR/photos, DATA_DIR/crops and DATA_DIR/selfies
into the configured S3 bucket using the same relative keys (photos/<uuid>.jpg,
crops/<uuid>.jpg, selfies/<uuid>.jpg), so photos uploaded before S3 kept
working after STORAGE_BACKEND=s3.

Usage::

    .venv/bin/python scripts/migrate_local_to_s3.py [--dry-run]

Run from the project root. Idempotent: objects that already exist in the
bucket are skipped.
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.storage import S3Storage

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("migrate")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if settings.storage_backend != "s3":
        print("STORAGE_BACKEND is not s3 — nothing to migrate to.")
        return

    store = S3Storage(
        bucket=settings.s3_bucket,
        endpoint_url=settings.s3_endpoint_url or None,
        access_key=settings.s3_access_key,
        secret_key=settings.s3_secret_key,
        region=settings.s3_region,
    )

    files: list[tuple[str, Path]] = []
    for prefix in ("photos", "crops", "selfies"):
        d = settings.data_dir / prefix
        if not d.is_dir():
            continue
        for p in sorted(d.glob("*.jpg")):
            files.append((f"{prefix}/{p.name}", p))

    print(f"{len(files)} local object(s) found")
    if args.dry_run:
        return

    uploaded = skipped = 0
    for key, path in files:
        if store.exists(key):
            skipped += 1
            continue
        store.save(key, path.read_bytes())
        uploaded += 1
        logger.info("uploaded %s", key)
    print(f"done: {uploaded} uploaded, {skipped} already present")


if __name__ == "__main__":
    main()
