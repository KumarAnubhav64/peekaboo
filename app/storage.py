"""Object storage abstraction.

Two backends behind one interface, selected by ``STORAGE_BACKEND``:

* ``local`` — files on disk (default; laptop development).
* ``s3``    — any S3-compatible service. MinIO locally (free, same S3 API),
              Cloudflare R2 in production (free tier: 10 GB + zero egress).

Keys (e.g. ``photos/ab12...jpg``) are identical across backends, so switching
is a single env var. All keys are validated against a strict pattern to keep
path traversal impossible.
"""
from __future__ import annotations

import logging
import re
import threading
from pathlib import Path
from typing import Protocol

from app.config import settings

logger = logging.getLogger("faceclaim.storage")

# Only safe, generated keys: dirs/letters/digits/_/- plus one extension.
_KEY_RE = re.compile(r"^[a-z0-9_\-/]+\.[a-z0-9]+$")


class StorageError(Exception):
    pass


class StorageBackend(Protocol):
    def save(self, key: str, data: bytes) -> str: ...
    def read(self, key: str) -> bytes: ...
    def exists(self, key: str) -> bool: ...
    def delete(self, key: str) -> None: ...
    def path(self, key: str) -> Path: ...  # local-only; S3 raises


def validate_key(key: str) -> None:
    if not _KEY_RE.match(key):
        raise StorageError(f"Invalid storage key: {key!r}")


class LocalStorage:
    def __init__(self, root: Path | str | None = None) -> None:
        self.root = Path(root or settings.data_dir).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _safe(self, key: str) -> Path:
        validate_key(key)
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):
            raise StorageError(f"Storage key escapes root: {key!r}")
        return path

    def save(self, key: str, data: bytes) -> str:
        path = self._safe(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return key

    def read(self, key: str) -> bytes:
        path = self._safe(key)
        if not path.is_file():
            raise StorageError(f"Missing object: {key!r}")
        return path.read_bytes()

    def exists(self, key: str) -> bool:
        return self._safe(key).is_file()

    def delete(self, key: str) -> None:
        try:
            self._safe(key).unlink(missing_ok=True)
        except StorageError:
            pass

    def path(self, key: str) -> Path:
        """Resolved filesystem path — used to stream via FileResponse."""
        path = self._safe(key)
        if not path.is_file():
            raise StorageError(f"Missing object: {key!r}")
        return path


class S3Storage:
    """S3-compatible object storage (MinIO / Cloudflare R2 / Backblaze B2)."""

    def __init__(
        self,
        bucket: str,
        endpoint_url: str | None = None,
        access_key: str = "",
        secret_key: str = "",
        region: str = "auto",
    ) -> None:
        import boto3
        from botocore.client import Config

        self.bucket = bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key or None,
            aws_secret_access_key=secret_key or None,
            region_name=region,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
                connect_timeout=5,
                read_timeout=30,
                retries={"max_attempts": 2},
            ),
        )
        self._bucket_ready = False
        self._lock = threading.Lock()

    # -- bucket bootstrap (lazy, so import never needs the service running) --

    def _ensure_bucket(self) -> None:
        if self._bucket_ready:
            return
        with self._lock:
            if self._bucket_ready:
                return
            try:
                self.client.head_bucket(Bucket=self.bucket)
            except Exception:
                try:
                    self.client.create_bucket(Bucket=self.bucket)
                    logger.info("Created S3 bucket %r", self.bucket)
                except Exception as exc:
                    # R2/MinIO both allow create_bucket; if the credentials
                    # forbid it, assume the bucket already exists.
                    logger.warning("Bucket %r not auto-creatable (%s)", self.bucket, exc)
            self._bucket_ready = True

    # -- S3 API -------------------------------------------------------------

    def save(self, key: str, data: bytes) -> str:
        validate_key(key)
        self._ensure_bucket()
        self.client.put_object(
            Bucket=self.bucket, Key=key, Body=data, ContentType="image/jpeg"
        )
        return key

    def read(self, key: str) -> bytes:
        validate_key(key)
        self._ensure_bucket()
        resp = self.client.get_object(Bucket=self.bucket, Key=key)
        return resp["Body"].read()

    def exists(self, key: str) -> bool:
        validate_key(key)
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False

    def delete(self, key: str) -> None:
        validate_key(key)
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except Exception as exc:  # pragma: no cover - best-effort cleanup
            logger.warning("Could not delete %r: %s", key, exc)

    def path(self, key: str) -> Path:
        raise StorageError("path() is not available for S3 storage")


def get_storage() -> StorageBackend:
    if settings.storage_backend == "s3":
        logger.info(
            "Using S3 storage (bucket=%s endpoint=%s)", settings.s3_bucket, settings.s3_endpoint_url or "<default>"
        )
        return S3Storage(
            bucket=settings.s3_bucket,
            endpoint_url=settings.s3_endpoint_url or None,
            access_key=settings.s3_access_key,
            secret_key=settings.s3_secret_key,
            region=settings.s3_region,
        )
    return LocalStorage()


storage = get_storage()
