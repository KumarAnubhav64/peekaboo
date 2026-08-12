"""Verify the self-hosted Docker suite (app on APP_PORT, storage in MinIO)."""
import json
import sys

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"

with httpx.Client(base_url=BASE, timeout=600) as c:
    # 1. landing page (SPA)
    r = c.get("/")
    assert r.status_code == 200 and "Peekaboo" in r.text, ("landing", r.status_code)
    print("1. landing page: 200, SPA served")

    # 2. signup a fresh user (suite DB)
    email = f"stack{__import__('time').time_ns() % 10**6}@test.com"
    r = c.post("/api/auth/signup", json={"email": email, "password": "password123", "name": "Stack User"})
    assert r.status_code == 201, ("signup", r.status_code, r.text[:200])
    print(f"2. signup: 201 ({email}), session cookie set")

    # 3. empty library
    r = c.get("/api/library")
    assert r.status_code == 200, ("library", r.status_code)
    lib = r.json()
    assert lib["photos"] == [] and lib["people"] == [], lib
    print("3. library: empty for the fresh tenant")

    # 4. upload — downloads buffalo_l on first use (~370 MB) inside the container
    with open("data/samples/obama.jpg", "rb") as f:
        r = c.post("/api/upload", files={"file": ("obama.jpg", f, "image/jpeg")})
    assert r.status_code == 200, ("upload", r.status_code, r.text[:300])
    up = r.json()
    photo_id = up["photo"]["id"]
    print(f"4. upload: 200 (photo {photo_id[:8]}…, {len(up['faces'])} face(s))")

    # 5. library now has the photo + enrichment
    r = c.get("/api/library")
    lib = r.json()
    assert any(p["id"] == photo_id for p in lib["photos"]), "photo missing from library"
    photo = next(p for p in lib["photos"] if p["id"] == photo_id)
    print(f"5. library: photo present; tags={photo['tags']} scene={photo['scene']}")

    # 6. the photo streams back through the API
    url = photo["url"]
    r = c.get(url)
    assert r.status_code == 200 and len(r.content) > 1000, ("photo fetch", r.status_code)
    print(f"6. photo streams back: 200 ({len(r.content)} bytes)")

print("STACK OK")
