"""Diagnostic: print the enriched library summary for a signed-in user."""
import json
import sys

import httpx

BASE = "http://localhost:8000"
EMAIL, PASSWORD = sys.argv[1], sys.argv[2]

with httpx.Client(base_url=BASE, timeout=60) as c:
    c.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    d = c.get("/api/library").json()

enriched = [p for p in d["photos"] if p.get("tags")]
print(f"photos: {len(d['photos'])} | enriched: {len(enriched)}")
if enriched:
    p = enriched[0]
    print(f"  sample tags: {p['tags']} | scene: {p['scene']} | lat/lng: {p['lat']}, {p['lng']}")
print(f"places: {len(d['places'])}")
for pl in d["places"][:6]:
    print(f"  {pl['id']}: {pl['label']} ({pl['kind']}) x{pl['count']}")
print(f"things: {len(d['things'])}")
for t in d["things"][:6]:
    print(f"  {t['label']} x{t['count']}")
