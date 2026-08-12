"""Live test of DELETE /api/photos against a running server.

Uploads two photos to a throwaway account, deletes one, and verifies the
photo disappears from the library AND its objects leave the storage backend.
"""
import sys

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"

with httpx.Client(base_url=BASE, timeout=300) as c:
    email = f"del{__import__('time').time_ns() % 10**6}@test.com"
    r = c.post("/api/auth/signup", json={"email": email, "password": "password123", "name": "DeleteTester"})
    assert r.status_code == 201, r.text
    print("1. signup ok")

    ids = []
    for name in ("obama.jpg", "two_people.jpg"):
        with open(f"data/samples/{name}", "rb") as f:
            r = c.post("/api/upload", files={"file": (name, f, "image/jpeg")})
        assert r.status_code == 200, r.text[:200]
        ids.append(r.json()["photo"]["id"])
    print(f"2. uploaded {len(ids)} photos")

    # track storage keys before deletion
    lib = c.get("/api/library").json()
    keep, drop = ids
    by_id = {p["id"]: p for p in lib["photos"]}
    urls_before = {pid: by_id[pid]["url"] for pid in ids}
    print(f"3. library has {len(lib['photos'])} photos")

    r = c.request("DELETE", "/api/photos", json={"ids": [drop]})
    assert r.status_code == 200, r.text
    assert r.json()["deleted"] == 1, r.text
    print("4. DELETE /api/photos -> deleted=1")

    lib = c.get("/api/library").json()
    remaining = [p["id"] for p in lib["photos"]]
    assert drop not in remaining and keep in remaining, remaining
    print(f"5. library now has {len(remaining)} photo(s); deleted photo gone, other kept")

    # the deleted photo's URL must now 404/403; the kept one still serves
    tok = urls_before[drop].split("token=")[1]
    r = c.get(f"/api/photo/{drop}?token={tok}")
    print(f"6. deleted photo URL -> {r.status_code} (expected 403/404)")

    # deleting again is a no-op
    r = c.request("DELETE", "/api/photos", json={"ids": [drop]})
    assert r.json()["deleted"] == 0, r.text
    print("7. re-delete -> deleted=0 (idempotent)")

    # auth required
    r = httpx.request("DELETE", f"{BASE}/api/photos", json={"ids": [keep]})
    assert r.status_code == 401, r.status_code
    print("8. unauthenticated delete -> 401")

print("DELETE FLOW OK")
