# Local setup

## Prerequisites
- Node.js 20+ and npm 10+
- Docker Desktop (for Postgres, Redis, MinIO, n8n)
- At least one AI key: OpenAI (also enables embeddings), Anthropic, or Gemini

## 1. Install
```bash
git clone https://github.com/<you>/vp-ai-job-copilot.git
cd vp-ai-job-copilot
npm install
npm run build -w @copilot/shared
```

## 2. Start infrastructure
```bash
npm run infra:up
```
Postgres :5432 · Redis :6379 · MinIO :9000 (console :9001, bucket `job-copilot` auto-created) · n8n :5678

## 3. Configure env
```bash
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local
```
- In `apps/api/.env`: set `JWT_SECRET`, `INTERNAL_API_KEY`, and at least one AI key.
- In `apps/web/.env.local`: set `AUTH_SECRET` and the same `INTERNAL_API_KEY` (uncomment it).
- For local n8n events set `N8N_WEBHOOK_BASE_URL=http://localhost:5678/webhook`.

## 4. Database
```bash
cd apps/api
npx prisma migrate deploy
npm run prisma:seed       # demo user + 5 public career boards
cd ../..
```

## 5. Run
Three processes (separate terminals):
```bash
npm run dev -w @copilot/api          # API on :4000, Swagger at /docs
npm run dev:worker -w @copilot/api   # BullMQ worker + schedules
npm run dev -w @copilot/web          # Web on :3000
```

## 6. n8n
1. Open http://localhost:5678 and create the owner account.
2. Credentials → add **Header Auth** named `Copilot Internal Key` (name `x-internal-key`, value = `INTERNAL_API_KEY`) and an **SMTP** credential named `SMTP` (Mailpit, Resend SMTP, SES, etc.).
3. Workflows → Import from file → `n8n/workflows/*.json` (also mounted at `/workflows` in the container), select the credentials in each node, activate.

## 7. Tests
```bash
npm test -w @copilot/api       # matching engine + honesty guardrails
npm run typecheck
```

## Troubleshooting
| Symptom | Fix |
|---|---|
| Resume stuck in "Parsing…" | Worker not running, or no AI key configured (check worker logs) |
| `No AI provider is configured` | Set at least one of `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` |
| Match semantic component is 0 | Embeddings need `OPENAI_API_KEY`; scoring still works without it |
| URL import says sign-in required | Paste the JD text along with the URL |
| `402 Monthly AI quota reached` | Raise `FREE_PLAN_MONTHLY_AI_CALLS` or set the user's plan to `PRO` |
