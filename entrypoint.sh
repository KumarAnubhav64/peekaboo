#!/usr/bin/env bash
# Seed the small committed ONNX classifiers into the mounted models dir (the
# volume starts empty on a fresh host); insightface downloads buffalo_l into
# the same dir on first use and it persists across restarts.
set -euo pipefail

MODEL_DIR="${MODEL_DIR:-/app/models}"
mkdir -p "$MODEL_DIR"

if [ ! -f "$MODEL_DIR/ssd_mobilenet_v1.onnx" ]; then
  echo "Seeding ONNX classifiers into $MODEL_DIR …"
  cp -n /app/baked-models/* "$MODEL_DIR/" || true
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
