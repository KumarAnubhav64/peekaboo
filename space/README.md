---
title: Peekaboo
emoji: 🫣
colorFrom: indigo
colorTo: sky
sdk: docker
app_port: 8000
pinned: false
---

# 🫣 Peekaboo

Find any photo in seconds — upload a photo, and every person in it gets a
private claim link. After a selfie challenge, each person sees every photo
containing them. Photos are also classified by **place** (GPS + scene) and
**things** (objects/animals) automatically.

This Space runs the **backend API + the built React app** (served from the
same container). The frontend can also live on **Vercel** with `/api/*`
proxied here — see `DEPLOYMENT.md` in the source repo.

## Secrets (set in Space → Settings → Variables and secrets)

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your Neon Postgres pooled connection string |
| `STORAGE_BACKEND` | `s3` |
| `AWS_ENDPOINT_URL_S3` | Your Neon (or R2) S3 endpoint |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 credentials |
| `AWS_REGION` | e.g. `us-east-2` |
| `S3_BUCKET` | e.g. `pekaboo` |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `COOKIE_SECURE` | `true` (served over HTTPS) |
| `PUBLIC_BASE_URL` | Your public URL (Vercel domain) for absolute links |
| `FACE_MODEL` / `DET_SIZE` | `buffalo_l` / `640` (tune down on weak hardware) |

All models are baked into the image — no download on cold start. The Space
sleeps after 48h idle (free tier); the first request after waking takes up to
~2 minutes.
