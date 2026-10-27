# Deployment guide

Target topology: **Vercel** (web) · **Render** or **Railway** (API + worker + Redis) · **Neon** (Postgres) · **Cloudflare R2 / AWS S3** (files) · **n8n Cloud or self-hosted** (automation) · **GitHub Actions** (CI/CD).

## 1. Neon Postgres
1. Create a project → database `copilot`.
2. Copy the **pooled** connection string → `DATABASE_URL` (append `?sslmode=require&pgbouncer=true&connect_timeout=15`).
3. Copy the **direct** connection string → `DIRECT_DATABASE_URL` (used for migrations).

## 2. Object storage (Cloudflare R2 recommended — no egress fees)
- Create bucket `job-copilot` (private). Create an API token with Object Read & Write.
- `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_FORCE_PATH_STYLE=true`.
- AWS S3: leave `S3_ENDPOINT` empty, set the region, `S3_FORCE_PATH_STYLE=false`, block public access.

## 3. API + worker
### Render (Blueprint)
1. New → Blueprint → select the repo; Render reads `render.yaml` (API web service, worker, Redis).
2. Create env group `job-copilot-secrets` with every API variable from `.env.example` except `REDIS_URL`/`ENABLE_SCHEDULER` (set by the blueprint). Set `APP_URL` and `CORS_ORIGINS` to your Vercel domain.
3. Copy each service's **Deploy Hook** URL into GitHub secrets `RENDER_API_DEPLOY_HOOK` and `RENDER_WORKER_DEPLOY_HOOK`.

### Railway (alternative)
1. New project → Deploy from repo → service **api** with Dockerfile `apps/api/Dockerfile`, root `/`.
2. Duplicate as **worker** with start command `node dist/worker.js`, `ENABLE_SCHEDULER=true` (API: `false`).
3. Add the Redis plugin; reference `${{Redis.REDIS_URL}}`.

> Only the worker should run `ENABLE_SCHEDULER=true`, so repeatable jobs are registered once.

## 4. Web on Vercel
1. Import the repo, **Root Directory** `apps/web`, framework Next.js. Vercel detects npm workspaces.
2. Env vars: `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL` (both = API public URL), `AUTH_SECRET`, `AUTH_URL` (your domain), `INTERNAL_API_KEY`, optional `AUTH_GOOGLE_ID/SECRET`, `AUTH_GITHUB_ID/SECRET`.
3. OAuth callback URLs: `https://<domain>/api/auth/callback/google` and `/github`.
4. Add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` to GitHub secrets (from `vercel link`).

## 5. n8n
- **n8n Cloud**: set Variables `COPILOT_API_URL`, `COPILOT_APP_URL`, `COPILOT_FROM_EMAIL`, `N8N_SELF_URL`; import `n8n/workflows/*.json`; create the `Copilot Internal Key` (Header Auth) and `SMTP` credentials; activate.
- **Self-hosted** (Railway/Render template): same env as `infra/docker-compose.yml`, `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, Postgres backend.
- Set the API's `N8N_WEBHOOK_BASE_URL=https://<n8n-host>/webhook`.

## 6. CI/CD (GitHub Actions)
- `ci.yml` — on PRs and `main`: install, Prisma generate, migrations applied to a throwaway Postgres, typecheck, unit tests, build both apps.
- `deploy.yml` — on `main`: `prisma migrate deploy` against Neon → trigger Render hooks → `vercel deploy --prod`.

Required repository secrets (environment `production`):
`DATABASE_URL`, `DIRECT_DATABASE_URL`, `RENDER_API_DEPLOY_HOOK`, `RENDER_WORKER_DEPLOY_HOOK`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

## 7. Static demo on GitHub Pages
`pages.yml` builds `apps/web` with `BUILD_TARGET=pages` (`npm run build:pages`) on every push to `main` and publishes it to `https://<user>.github.io/<repo>/`.
In this mode `NEXT_PUBLIC_DEMO_MODE=true` swaps the HTTP client for an in-browser implementation of the API (`src/lib/demo`) backed by localStorage. Auth.js and middleware are left out of the static build.
One-time setup: **Settings → Pages → Source: GitHub Actions**.

The full-stack deploy (`deploy.yml`) stays off until you add its secrets and set the repository variable `DEPLOY_ENABLED=true`.

## 8. Production checklist
- [ ] Secrets are ≥ 32 random bytes; `INTERNAL_API_KEY` identical in API, web and n8n.
- [ ] `NODE_ENV=production` (disables Swagger UI).
- [ ] Redis `maxmemory-policy noeviction` (BullMQ requirement).
- [ ] Bucket is private; CORS on bucket not required (downloads use presigned GET redirects).
- [ ] Sentry/Better Stack wired to API logs (Pino JSON on stdout).
- [ ] Backups: Neon PITR enabled.
- [ ] Spend limits set on every AI provider account.
- [ ] Privacy policy + data deletion flow (DELETE resume/application endpoints exist; add account deletion before launch).
