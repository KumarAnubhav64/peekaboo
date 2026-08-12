"""Live end-to-end flow against the running Peekaboo server (currently on Neon)."""
import io
import sys

import httpx

BASE = "http://localhost:8000"
PASS = "password123"


def check(name, cond, extra=""):
    print(f"{'✓' if cond else '✗'} {name} {extra}")
    if not cond:
        sys.exit(1)


def main():
    with httpx.Client(base_url=BASE, follow_redirects=True, timeout=120) as c:
        # 1. signup
        r = c.post("/api/auth/signup", json={"email": "neontest@test.com", "password": PASS, "name": "NeonTester"})
        check("signup (201 + cookie)", r.status_code == 201, f"got {r.status_code} {r.text[:80]}")

        # 2. upload obama.jpg
        with open("data/samples/obama.jpg", "rb") as f:
            r = c.post("/api/upload", files={"file": ("obama.jpg", f, "image/jpeg")})
        check("upload obama.jpg", r.status_code == 200, f"got {r.status_code} {r.text[:120]}")
        up1 = r.json()
        token1 = up1["faces"][0]["token"]
        face1 = up1["faces"][0]["id"]
        check("face token minted", len(token1) > 20)

        # 3. upload obama2.jpg (same person, different photo)
        with open("data/samples/obama2.jpg", "rb") as f:
            r = c.post("/api/upload", files={"file": ("obama2.jpg", f, "image/jpeg")})
        check("upload obama2.jpg", r.status_code == 200, f"got {r.status_code}")

        # 4. claim-info
        r = c.get(f"/api/claim-info/{token1}")
        check("claim-info", r.status_code == 200, f"got {r.status_code}")

        # 5. claim with biden.jpg (wrong person -> 403)
        with open("data/samples/biden.jpg", "rb") as f:
            r = c.post(f"/api/claim/{token1}", files={"file": ("biden.jpg", f, "image/jpeg")})
        check("wrong-person selfie rejected (403)", r.status_code == 403, f"got {r.status_code}")

        # 6. claim with obama2.jpg (right person -> verified, >=2 photos)
        with open("data/samples/obama2.jpg", "rb") as f:
            r = c.post(f"/api/claim/{token1}", files={"file": ("obama2.jpg", f, "image/jpeg")})
        check("right-person selfie verified", r.status_code == 200, f"got {r.status_code} {r.text[:100]}")
        body = r.json()
        check("cross-photo gallery (>=2 photos)", len(body.get("photos", [])) >= 2, f"{len(body.get('photos', []))} photos, sim={body.get('similarity')}")

        # 7. token-gated serving
        r = c.get(f"/api/crop/{face1}", params={"token": token1})
        check("crop served via SPA/gallery token", r.status_code == 200 and r.headers.get("content-type", "").startswith("image"), f"got {r.status_code}")
        r = c.get(f"/api/crop/{face1}", params={"token": "definitely-wrong-token"})
        check("wrong token blocked (403)", r.status_code == 403, f"got {r.status_code}")

        # 8. logout
        r = c.post("/api/auth/logout")
        check("logout", r.status_code == 200)

    print("\nALL PASS (live flow on Neon)")


if __name__ == "__main__":
    main()
