# ☁️ Deploy to Azure — free, no credit card

Peekaboo's backend runs on **Azure Container Apps** — a serverless container host
that scales to zero when idle and wakes on demand. With **Azure for Students**
this is **$0 with no credit card**: the signup is verified with your school
email, you get **$100 of credit for 12 months** (renewable while you're a
student), and Container Apps' free allowance (180k vCPU-seconds + 360k GiB-seconds
per month) covers light traffic *even after the credit*.

```
┌─────────────┐   HTTPS    ┌──────────────────────────┐   ┌──────────────────┐
│  Vercel     │ ─────────▶ │  Azure Container Apps    │──▶│  Neon Postgres   │
│  frontend   │            │  FastAPI + InsightFace   │   │  (free, already) │
│  (free)     │            │  (scale-to-zero)         │   └──────────────────┘
└─────────────┘            │                          │   ┌──────────────────┐
                           │  models baked in image   │──▶│  Neon S3 storage │
                           └──────────────────────────┘   │  (free, already) │
                                                           └──────────────────┘
```

---

## Part 1 — Get Azure for Students (no credit card, ~10 min)

1. Go to **https://azure.microsoft.com/free/students** (or search "Azure for
   Students").
2. Click **Start free** → sign in with your **school email** (the
   `@college.edu` / university address). If you don't have one yet, use the
   **"I'm a student" → verify enrollment** path — GitHub Student Pack can also
   hand you access (github.com/education).
3. Verify your age (must be 18+) and **student status** via your school email.
   **No credit card is asked at any point** — Microsoft's policy explicitly
   excludes cards for this offer.
4. You get **$100 Azure credit, valid 12 months** (renews if you're still a
   student) plus access to free services.
5. While logged in, note the **Subscription ID** shown on the Azure portal
   home page — you'll need it for the optional CI/CD setup.

> ⏱️ Verification usually lands within minutes. If it says "pending", check
> your school inbox for the confirmation link.

---

## Part 2 — Install the tools (once)

```bash
# Azure CLI (Linux/macOS)
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Windows: winget install Microsoft.AzureCLI
# macOS:   brew install azure-cli

az version        # sanity check
```

Docker is already on your machine (Peekaboo's self-host suite uses it).

---

## Part 3 — Deploy (one command)

First make sure `.env` has your **Neon** credentials (you already pasted these
in earlier — the Postgres URL and the Neon S3 endpoint/keys). Copy
`.env.example` if needed:

```bash
cp .env.example .env   # then fill in your Neon DATABASE_URL + S3 creds
```

Then:

```bash
az login                              # opens browser, sign in with school account
./scripts/deploy_azure.sh             # builds + deploys everything
```

What the script does (you can also run each step manually):

```bash
az group create --name peekaboo-rg --location eastus

az containerapp up \
  --name peekaboo \
  --resource-group peekaboo-rg \
  --environment peekaboo-env \
  --source . \
  --dockerfile Dockerfile.azure \
  --ingress external \
  --target-port 8000 \
  --cpu 1.0 --memory 2.0Gi \
  --env-vars STORAGE_BACKEND=s3 COOKIE_SECURE=true PUBLIC_BASE_URL=https://peekaboo.peekaboo-env.eastus.azurecontainerapps.io \
  --env-vars DATABASE_URL=... AWS_ENDPOINT_URL_S3=... AWS_ACCESS_KEY_ID=... \
  AWS_SECRET_ACCESS_KEY=... AWS_REGION=us-east-2 S3_BUCKET=pekaboo JWT_SECRET=...
```

> ⚠️ ACA's default FQDN includes the **environment name**:
> `https://<app>.<environment>.<region>.azurecontainerapps.io` — a common
> gotcha. The deploy script builds this exact URL for you and prints it at the
> end.

It builds `Dockerfile.azure` (SPA + app + **models baked in** — no cold-start
download), pushes to an auto-created container registry, and provisions the app.

### Result

```
https://peekaboo.peekaboo-env.eastus.azurecontainerapps.io      ← the API + the React app
https://peekaboo.peekaboo-env.eastus.azurecontainerapps.io/health   ← should return {"status":"ok"}
```

The image is **stateless**: photos go to Neon S3, faces/embeddings to Neon
Postgres. Cold starts re-load the baked-in models in ~10–20 s; the app scales
to zero when idle and wakes on the first request.

---

## Part 4 — Frontend on Vercel (free)

1. Push `web/` to a repo (or keep it in this repo and point Vercel at the
   `web/` directory).
2. Vercel → New Project → import → framework **Vite/React**, root directory
   `web`.
3. Set env var `VITE_API_URL=https://peekaboo.peekaboo-env.eastus.azurecontainerapps.io`
   (the exact URL printed at the end of the deploy script).
4. Deploy. For Google SSO later, add the Vercel URL as an authorized redirect.

---

## Part 5 — Optional: CI/CD from GitHub

Push-to-deploy instead of running the script by hand:

1. Create an Azure service principal (one-time):
   ```bash
   az ad sp create-for-rbac --name "peekaboo-cicd" --role contributor \
     --scopes /subscriptions/<SUBSCRIPTION_ID>/resourceGroups/peekaboo-rg \
     --sdk-auth
   ```
2. Copy the JSON output → GitHub repo **Settings → Secrets and variables →
   Actions** → new secret **`AZURE_CREDENTIALS`**.

   > The CI workflow assumes the **manual deploy has run once first** (it
   > creates the resource group, the environment, and the ACR named
   > `peekabooacr`). CI updates the existing app — it doesn't create the
   > infrastructure. If you ever need to rebuild infra, delete the resource
   > group and run the deploy script again.
3. Add the other secrets: `DATABASE_URL`, `AWS_ENDPOINT_URL_S3`,
   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`,
   `JWT_SECRET`, `PUBLIC_BASE_URL`.
4. The included `.github/workflows/deploy-azure.yml` now builds and deploys on
   every push to `main`.

---

## Cost math (honest)

| Item | Cost | Notes |
|---|---|---|
| Azure Container Apps | **$0** | free allowance (180k vCPU-sec, 360k GiB-sec, 2M req/mo) covers light usage; anything beyond comes out of the **$100 student credit** |
| Container registry | **~$0** | basic SKU is a few dollars/month, covered by the credit |
| Neon Postgres | **$0** | already free tier |
| Neon S3 storage | **$0** | already free tier |
| Vercel frontend | **$0** | hobby plan |
| **Total** | **$0 now**, and for 12 months of real traffic you have the $100 credit as a buffer | |

Scale-to-zero + the free allowance mean a demo/portfolio workload should never
touch the credit. If you ever outgrow it, the *same* image and config move to a
paid plan or back to your own hardware unchanged — nothing about the app changes.

---

## Troubleshooting

- **`/health` 200 but uploads 500** → check the env vars reached the container:
  `az containerapp show --name peekaboo -g peekaboo-rg --query properties.template.containers[0].env` and make sure `STORAGE_BACKEND=s3` and the Neon S3 vars are set.
- **Cold start feels slow** → expected on first request after idle (models
  loading, ~10–20 s). Subsequent calls are fast.
- **Signup rejected** → use the GitHub Student Pack path
  (github.com/education → Azure), or verify enrollment with your university.
- **`az containerapp up` fails to build** → run the build locally first to see
  the error: `docker build -f Dockerfile.azure -t peekaboo:azure .`
- **Reset the app** → `az containerapp delete --name peekaboo -g peekaboo-rg`
  then re-run the deploy script (data stays safe in Neon).

---

## Related docs

- [SELFHOST.md](SELFHOST.md) — the same app on your own machine/NAS (also free, no card at all)
- [DEPLOYMENT.md](DEPLOYMENT.md) — original deployment notes
- [FEATURES.md](FEATURES.md) — what the product does
