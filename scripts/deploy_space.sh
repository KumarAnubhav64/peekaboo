#!/usr/bin/env bash
# Deploy Peekaboo to a Hugging Face Space (Docker SDK).
#
#   HF_TOKEN=hf_xxx ./scripts/deploy_space.sh <your-username>/<space-name>
#
# What it does:
#   1. Creates the Space if it doesn't exist (sdk=docker).
#   2. Clones the Space repo and assembles the app into it:
#        Dockerfile (from Dockerfile.space), README.md (Space metadata),
#        app/, web/, scripts/, requirements.txt, and the baked ML models.
#   3. Commits and pushes — HF builds the image from the Space repo.
#
# After it finishes: set the secrets listed in space/README.md (or in
# DEPLOYMENT.md) in Space → Settings → Variables and secrets, then reload.
#
# Requires: git, curl, an HF token with write access (HF_TOKEN env var, or run
# `huggingface-cli login` first for the git credential helper).
set -euo pipefail

SPACE_ID="${1:?usage: HF_TOKEN=... ./scripts/deploy_space.sh <user>/<space>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

GIT_URL="https://huggingface.co/spaces/${SPACE_ID}"
AUTH_URL="$GIT_URL"
if [ -n "${HF_TOKEN:-}" ]; then
  AUTH_URL="https://user:${HF_TOKEN}@huggingface.co/spaces/${SPACE_ID}"
fi

echo "==> Ensuring Space ${SPACE_ID} exists (sdk=docker)…"
if [ -n "${HF_TOKEN:-}" ]; then
  curl -fsS -X POST "https://huggingface.co/api/spaces" \
    -H "Authorization: Bearer ${HF_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"space\",\"name\":\"${SPACE_ID##*/}\",\"namespace\":\"${SPACE_ID%/*}\",\"sdk\":\"docker\"}" \
    >/dev/null 2>&1 || echo "    (create failed — it may already exist, continuing)"
fi

echo "==> Cloning Space repo…"
git clone --quiet "$AUTH_URL" "$TMP/space"

echo "==> Assembling app files into the Space repo…"
DEST="$TMP/space"
cp "$REPO_ROOT/Dockerfile.space" "$DEST/Dockerfile"
cp "$REPO_ROOT/space/README.md" "$DEST/README.md"
cp "$REPO_ROOT/requirements.txt" "$DEST/"
cp -r "$REPO_ROOT/app" "$DEST/app"
cp -r "$REPO_ROOT/scripts" "$DEST/scripts"
cp -r "$REPO_ROOT/web" "$DEST/web"
rm -rf "$DEST/web/node_modules" "$DEST/web/dist" "$DEST/web/tsconfig.tsbuildinfo"
# Baked ML models (exclude the downloaded zip).
mkdir -p "$DEST/models/models"
cp -r "$REPO_ROOT/models/models/buffalo_l" "$DEST/models/models/buffalo_l"
rm -f "$DEST/models/models/buffalo_l/buffalo_l.zip"
cp "$REPO_ROOT/models/ssd_mobilenet_v1.onnx" "$REPO_ROOT/models/places365_resnet18.onnx" "$REPO_ROOT/models/categories_places365.txt" "$DEST/models/"

cat > "$DEST/.dockerignore" <<'EOF'
.git
data
.venv
__pycache__
*.pyc
web/node_modules
web/dist
EOF

echo "==> Committing + pushing (HF will build the image)…"
cd "$DEST"
git add -A
git -c user.name="deploy" -c user.email="deploy@localhost" \
  commit --quiet -m "Deploy Peekaboo (app + baked models)" || true
git push --quiet origin HEAD

echo ""
echo "✅  Pushed to https://huggingface.co/spaces/${SPACE_ID}"
echo "    Next: set the secrets (space/README.md list) in Space Settings, then reload."
echo "    Watch the build at https://huggingface.co/spaces/${SPACE_ID}/settings"
