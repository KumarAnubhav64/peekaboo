#!/usr/bin/env bash
# Start the Peekaboo dev server.
#   ./run.sh            -> runs with uv (auto-creates .venv on first run)
#   DATABASE_URL=... ./run.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ] && [ -f .env.example ]; then
  echo "⚠️  No .env found. Copying .env.example to .env — edit DATABASE_URL first!"
  cp .env.example .env
fi

# Ensure dependencies are installed (fast if already up to date).
uv pip install -r requirements.txt --quiet

exec uv run uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --reload
