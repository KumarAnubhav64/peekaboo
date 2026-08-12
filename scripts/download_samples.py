"""Download a few public-domain sample face photos for manual testing.

Uses the MIT-licensed example images from the `face_recognition` repo so you
can try the full flow without uploading your own face:

    uv run python scripts/download_samples.py

Outputs:
  data/samples/obama.jpg      (face #1)
  data/samples/obama2.jpg     (same person — use as the "selfie")
  data/samples/biden.jpg      (different person — should be REJECTED)
  data/samples/two_people.jpg (two faces in one photo)
"""
from __future__ import annotations

import sys
from pathlib import Path

import urllib.request

BASE = "https://raw.githubusercontent.com/ageitgey/face_recognition/master/examples/"
FILES = {
    "obama.jpg": "obama.jpg",
    "obama2.jpg": "obama2.jpg",
    "biden.jpg": "biden.jpg",
    "two_people.jpg": "two_people.jpg",
}


def main() -> None:
    out_dir = Path(__file__).resolve().parent.parent / "data" / "samples"
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, remote in FILES.items():
        dest = out_dir / name
        if dest.exists():
            print(f"  ✓ {name} (already present)")
            continue
        url = BASE + remote
        print(f"  ↓ {name} from {url}")
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                dest.write_bytes(resp.read())
        except Exception as exc:
            print(f"  ✗ failed to download {name}: {exc}", file=sys.stderr)
            continue
    print("\nSamples ready in data/samples/")


if __name__ == "__main__":
    main()
