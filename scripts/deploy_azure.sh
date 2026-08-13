#!/usr/bin/env bash
# ===========================================================================
# Deploy Peekaboo to Azure Container Apps (free with Azure for Students).
#
#   az login                      # once, school account
#   ./scripts/deploy_azure.sh     # builds the image and deploys the app
#
# Prereqs: az CLI, docker, and a .env file with your Neon creds (see
# .env.example). The script reads DATABASE_URL + the S3_*/AWS_* storage vars
# from .env and passes them to the container. Everything else defaults to
# production-safe values.
#
# Cost: within the $100 / 12-month Azure for Students credit; the free
# allowance (180k vCPU-sec + 360k GiB-sec per month) covers light traffic
# even after the credit ends.
# ===========================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

# ---------------------------------------------------------------------------
# Config (overridable via env)
# ---------------------------------------------------------------------------
RG="${RG:-peekaboo-rg}"
LOCATION="${LOCATION:-eastus}"                 # free tier is region-agnostic
ENV_NAME="${ENV_NAME:-peekaboo-env}"
APP_NAME="${APP_NAME:-peekaboo}"
ACR_NAME="${ACR_NAME:-peekabooacr}"           # must match .github/workflows/deploy-azure.yml
DOCKERFILE="${DOCKERFILE:-Dockerfile.azure}"

echo "==> Checking prereqs"
command -v az >/dev/null || { echo "ERROR: az CLI not installed — see DEPLOY-AZURE.md"; exit 1; }
command -v docker >/dev/null || { echo "ERROR: docker not installed"; exit 1; }
[ -f .env ] || { echo "ERROR: .env not found — copy .env.example and fill in Neon creds"; exit 1; }

echo "==> Verifying Azure login"
az account show --output none >/dev/null 2>&1 || {
  echo "Not logged in — running: az login"
  az login
}
SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
echo "    subscription: $(az account show --query name -o tsv) ($SUBSCRIPTION_ID)"

# ---------------------------------------------------------------------------
# Load Neon env vars from .env (skip comments/blank lines). The three keys we
# override below are excluded so there's no ambiguity about the final value.
# ---------------------------------------------------------------------------
echo "==> Reading .env"
# Parse .env with the same semantics as python-dotenv (which the app uses
# locally): strip surrounding quotes, skip comments/blank lines. Docker and
# the az CLI pass env-var values verbatim, so AWS_REGION="us-east-2" must
# arrive as us-east-2 — not the literal string '"us-east-2"', which crashes
# boto3's region AND endpoint validation.
load_env() {
  python3 - <<'PY'
import re
from pathlib import Path
skip = {"STORAGE_BACKEND", "COOKIE_SECURE", "PUBLIC_BASE_URL"}
for raw in Path(".env").read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, _, v = line.partition("=")
    k = k.strip()
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", k) or k in skip:
        continue
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        v = v[1:-1]
    print(f"--env-vars {k}={v}")
PY
}
ENV_ARGS="$(load_env)"

# Production-safe overrides that must NOT come from a dev .env:
#   * COOKIE_SECURE=true  — ACA serves HTTPS on the *.azurecontainerapps.io domain
#   * PUBLIC_BASE_URL     — absolute share links / Google SSO callback
#   * STORAGE_BACKEND=s3  — images must go to Neon S3, never local disk
#
# ACA's default FQDN is <app>.<environment>.<region>.azurecontainerapps.io —
# the environment name is part of the URL (a common gotcha).
PUBLIC_URL="https://${APP_NAME}.${ENV_NAME}.${LOCATION}.azurecontainerapps.io"
ENV_ARGS="$ENV_ARGS --env-vars STORAGE_BACKEND=s3 COOKIE_SECURE=true PUBLIC_BASE_URL=$PUBLIC_URL"

# ---------------------------------------------------------------------------
# Deploy: resource group → container apps environment → build + push + app
# ---------------------------------------------------------------------------
echo "==> Creating resource group: $RG ($LOCATION)"
az group create --name "$RG" --location "$LOCATION" --output none

# ACR is created EXPLICITLY with a fixed name so the GitHub Actions workflow
# (.github/workflows/deploy-azure.yml) and the manual script use the same
# registry. `az containerapp up` would otherwise auto-generate a random name.
echo "==> Ensuring container registry: $ACR_NAME"
az acr create --name "$ACR_NAME" --resource-group "$RG" --sku Basic --output none 2>/dev/null \
  || echo "    (registry already exists)"

# `az containerapp up` builds the image with Docker (respecting .dockerignore),
# pushes it to the ACR above, and provisions the environment + app.
echo "==> Building image (${DOCKERFILE}) and deploying to Container Apps"
az containerapp up \
  --name "$APP_NAME" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --environment "$ENV_NAME" \
  --registry-server "$ACR_NAME.azurecr.io" \
  --source . \
  --dockerfile "$DOCKERFILE" \
  --ingress external \
  --target-port 8000 \
  --cpu 1.0 --memory 2.0Gi \
  $ENV_ARGS

# Scale to zero when idle (Container Apps free tier friendly) — wakes on demand.
echo "==> Enabling scale-to-zero"
az containerapp update \
  --name "$APP_NAME" \
  --resource-group "$RG" \
  --min-replicas 0 --max-replicas 3 \
  --output none || echo "    (scale update skipped — app may already be live)"

echo ""
echo "==> Deployed! Live at:"
echo "    $PUBLIC_URL"
echo "    health:  ${PUBLIC_URL}/health"
echo ""
echo "Next: set COOKIE_SECURE / Google SSO and open the URL in a browser."
