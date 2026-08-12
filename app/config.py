"""Central configuration for Peekaboo.

All settings come from environment variables (optionally loaded from a .env
file). Keeping this in one place makes the same codebase run on a laptop and
in production with only env-var differences.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def _env(key: str, default: str) -> str:
    return os.environ.get(key, default)


@dataclass(frozen=True)
class Settings:
    # --- Database ---
    # Neon (or any Postgres 14+ with pgvector). See .env.example.
    database_url: str = field(default_factory=lambda: _env("DATABASE_URL", ""))

    # --- Face matching ---
    match_threshold: float = field(
        default_factory=lambda: float(_env("MATCH_THRESHOLD", "0.42"))
    )
    # Maximum number of candidate matches returned by the similarity search.
    search_limit: int = field(default_factory=lambda: int(_env("SEARCH_LIMIT", "200")))

    # --- Storage ---
    # "local" (disk) or "s3" (S3-compatible: MinIO locally, Cloudflare R2 in prod).
    storage_backend: str = field(default_factory=lambda: _env("STORAGE_BACKEND", "local"))
    data_dir: Path = field(default_factory=lambda: Path(_env("DATA_DIR", "data")))
    model_dir: Path = field(default_factory=lambda: Path(_env("MODEL_DIR", "models")))

    # --- S3-compatible storage settings (used when STORAGE_BACKEND=s3) ---
    s3_endpoint_url: str = field(default_factory=lambda: _env("S3_ENDPOINT_URL", ""))
    s3_access_key: str = field(default_factory=lambda: _env("S3_ACCESS_KEY", ""))
    s3_secret_key: str = field(default_factory=lambda: _env("S3_SECRET_KEY", ""))
    s3_bucket: str = field(default_factory=lambda: _env("S3_BUCKET", "faceclaim"))
    s3_region: str = field(default_factory=lambda: _env("S3_REGION", "auto"))

    # --- Face engine ---
    face_model: str = field(default_factory=lambda: _env("FACE_MODEL", "buffalo_l"))
    det_size: int = field(default_factory=lambda: int(_env("DET_SIZE", "640")))

    # --- Upload limits ---
    max_upload_mb: int = field(default_factory=lambda: int(_env("MAX_UPLOAD_MB", "20")))
    max_image_side: int = field(default_factory=lambda: int(_env("MAX_IMAGE_SIDE", "2048")))

    # --- Misc ---
    public_base_url: str = field(default_factory=lambda: _env("PUBLIC_BASE_URL", "").rstrip("/"))

    # Match distance = 1 - similarity. pgvector's <=> operator returns cosine distance.
    @property
    def max_distance(self) -> float:
        return 1.0 - self.match_threshold


settings = Settings()
