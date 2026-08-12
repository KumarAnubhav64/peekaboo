"""Database layer: Postgres + pgvector (Neon-compatible).

Stores:
  * photos   — original uploads
  * faces    — one row per detected face, with a 512-dim ArcFace embedding
               stored as a pgvector `vector(512)` column + HNSW index.

The same code runs against Neon (production) or a local Postgres 16 with the
pgvector extension (development) — only DATABASE_URL changes.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    event,
    text,
)
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker
from pgvector.sqlalchemy import Vector

from app.config import settings

logger = logging.getLogger("faceclaim.db")


class Base(DeclarativeBase):
    pass


class User(Base):
    """A registered account. Each user is their own tenant: they own the photo
    library, and claim links only ever search inside their tenant's pool."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # bcrypt hash; NULL for accounts created purely via Google SSO.
    password_hash: Mapped[str | None] = mapped_column(String(100), nullable=True)
    google_sub: Mapped[str | None] = mapped_column(String(100), unique=True, index=True, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    photos: Mapped[list["Photo"]] = relationship(back_populates="owner")


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # Multi-tenant scoping: every row belongs to exactly one account.
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    original_name: Mapped[str] = mapped_column(String(255))
    storage_key: Mapped[str] = mapped_column(String(500))
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    num_faces: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationship drives unit-of-work insert ordering (parent before child).
    owner: Mapped["User"] = relationship(back_populates="photos")
    faces: Mapped[list["Face"]] = relationship(back_populates="photo")


class Face(Base):
    __tablename__ = "faces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    photo_id: Mapped[str] = mapped_column(
        ForeignKey("photos.id", ondelete="CASCADE"), index=True
    )
    # Denormalized tenant id so every query (incl. the vector search) can be
    # scoped with a simple WHERE clause.
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # JSON array [x1, y1, x2, y2] in pixel coordinates of the original photo.
    bbox: Mapped[str] = mapped_column(Text)
    crop_key: Mapped[str] = mapped_column(String(500))
    # 512-dim ArcFace embedding (normed).
    vec: Mapped[Vector] = mapped_column(Vector(512))
    # Secret claim link token — one per face. This IS the access credential.
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Similarity of the winning verification selfie.
    best_sim: Mapped[float | None] = mapped_column(Float, nullable=True)
    selfie_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    photo: Mapped["Photo"] = relationship(back_populates="faces")


def _require_database_url() -> str:
    if not settings.database_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Create a free Neon project "
            "(https://console.neon.tech) and copy the pooled connection string, "
            "or run a local pgvector Postgres — see .env.example."
        )
    return settings.database_url


def _register_pgvector_adapter(dbapi_conn, _conn_record) -> None:
    """Let psycopg3 parse/serialize `vector` columns in raw text queries."""
    try:
        from pgvector.psycopg import register_vector

        register_vector(dbapi_conn)
    except Exception:  # pragma: no cover - defensive
        logger.warning("Could not register pgvector psycopg adapter", exc_info=True)


def build_engine(url: str | None = None, echo: bool = False) -> Engine:
    """Create the SQLAlchemy engine for a Postgres + pgvector backend."""
    url = url or _require_database_url()
    # Accept plain postgresql:// (what Neon hands you) and force psycopg3.
    parsed = make_url(url)
    if parsed.drivername == "postgresql":
        parsed = parsed.set(drivername="postgresql+psycopg")
    # Pool settings tuned for Neon's serverless scale-to-zero + PgBouncer.
    engine = create_engine(
        parsed,
        echo=echo,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
    )
    event.listen(engine, "connect", _register_pgvector_adapter)
    return engine


engine = build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def _column_exists(conn, table: str, column: str) -> bool:
    return conn.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    ).scalar() is not None


def init_db() -> None:
    """Create the pgvector extension, tables, and the HNSW similarity index.

    Includes a tiny built-in migration: tables created before multi-tenancy
    existed get a nullable tenant_id column (pre-launch data is dev-only, so
    those rows are cleared rather than guessed at).
    """
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        Base.metadata.create_all(conn)

        for table in ("photos", "faces"):
            if not _column_exists(conn, table, "tenant_id"):
                conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN tenant_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE")
                )
                # Pre-multi-tenancy rows have no owner; this is dev-only data.
                conn.execute(text(f"TRUNCATE {table} CASCADE"))
                logger.info("Migrated %s: added tenant_id column", table)

        has_index = conn.execute(
            text("SELECT 1 FROM pg_indexes WHERE indexname = 'ix_faces_vec_hnsw'")
        ).scalar()
        if not has_index:
            conn.execute(
                text(
                    "CREATE INDEX ix_faces_vec_hnsw "
                    "ON faces USING hnsw (vec vector_cosine_ops)"
                )
            )
            logger.info("Created HNSW index on faces.vec")
    # The pool may hold a connection that was opened BEFORE the vector type
    # existed (its pgvector adapter failed to register). Drop all pooled
    # connections so fresh ones reconnect with the vector type available.
    engine.dispose()
    logger.info("Database ready (postgres + pgvector)")


def get_session() -> Session:
    return SessionLocal()
