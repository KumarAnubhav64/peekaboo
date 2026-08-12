"""End-to-end smoke test against a real database (Neon or local pgvector).

Exercises the full loop without the HTTP layer:

    uv run python scripts/smoke_test.py

Prints PASS/FAIL for: upload, per-face tokens, selfie verification, rejection
of a different person, and cross-photo matching.
"""
from __future__ import annotations

import sys
import uuid
from pathlib import Path

# Allow `python scripts/smoke_test.py` from anywhere in the repo.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import pipeline
from app.config import settings
from app.db import SessionLocal, User

SAMPLES = Path(__file__).resolve().parent.parent / "data" / "samples"
PASS, FAIL = 0, 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  ✓ {name}")
    else:
        FAIL += 1
        print(f"  ✗ {name} {detail}")


def read(name: str) -> bytes:
    return (SAMPLES / name).read_bytes()


def main() -> int:
    pipeline.init_pipeline()
    print(f"threshold={settings.match_threshold}")

    # Create a test tenant (the signed-in account that owns the library).
    with SessionLocal() as s:
        tenant = s.scalar(
            s.query(User).filter(User.email == "smoke@test.local")
        ) or User(
            id=str(uuid.uuid4()), email="smoke@test.local", password_hash="x"
        )
        s.add(tenant)
        s.commit()
        tenant_id = tenant.id

    print("\n[1] Upload a photo with two people")
    up = pipeline.process_upload(read("two_people.jpg"), "two_people.jpg", tenant_id)
    check("two faces detected", len(up.faces) == 2, f"got {len(up.faces)}")
    check("unique tokens minted", len({f.token for f in up.faces}) == 2)

    print("\n[2] Claim each face with known selfies")
    obama_hit = biden_hit = False
    for face in up.faces:
        r_obama = pipeline.claim_face(face.token, read("obama.jpg"))
        r_biden = pipeline.claim_face(face.token, read("biden.jpg"))
        print(f"  face {face.face_id[:8]}  sim(obama)={r_obama.similarity:.3f} "
              f"sim(biden)={r_biden.similarity:.3f}")
        if r_obama.status == "verified":
            obama_hit = True
        if r_biden.status == "verified":
            biden_hit = True
    check("obama selfie verified against his face", obama_hit)
    check("biden selfie verified against his face", biden_hit)

    print("\n[3] Cross-person rejection")
    rejected = False
    for face in up.faces:
        if pipeline.claim_face(face.token, read("obama.jpg")).status == "verified":
            r = pipeline.claim_face(face.token, read("biden.jpg"))
            if r.status == "rejected":
                rejected = True
    check("biden rejected on obama's face", rejected)

    print("\n[4] Cross-photo matching (same person, different photos)")
    pipeline.process_upload(read("obama.jpg"), "obama.jpg", tenant_id)
    pipeline.process_upload(read("obama2.jpg"), "obama2.jpg", tenant_id)
    up2 = pipeline.process_upload(read("obama2.jpg"), "obama2_again.jpg", tenant_id)
    result = pipeline.claim_face(up2.faces[0].token, read("obama.jpg"))
    check("claim verified", result.status == "verified", result.status)
    check("multiple photos returned", len(result.photos) >= 2, f"got {len(result.photos)}")

    print("\n[5] Token-gated access control")
    token = up.faces[0].token
    pid = up.photo_id
    check("photo accessible with its own face token", pipeline.photo_accessible(pid, token))
    check(
        "photo NOT accessible with a random token",
        not pipeline.photo_accessible(pid, "totally-bogus-token"),
    )

    print(f"\n{'ALL PASS' if FAIL == 0 else f'{FAIL} FAILURES'}  ({PASS} passed, {FAIL} failed)")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
