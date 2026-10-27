# VP AI Job Copilot

**AI-Powered Job Application Automation Platform** — discover matching jobs, analyze job descriptions, tailor resumes honestly for ATS, generate cover letters and recruiter outreach, prepare for interviews, and track every application.

![stack](https://img.shields.io/badge/Next.js-14-black) ![stack](https://img.shields.io/badge/NestJS-10-e0234e) ![stack](https://img.shields.io/badge/PostgreSQL-Prisma-336791) ![stack](https://img.shields.io/badge/BullMQ-Redis-dc382d) ![stack](https://img.shields.io/badge/AI-OpenAI%20%7C%20Claude%20%7C%20Gemini-6e56cf) ![stack](https://img.shields.io/badge/n8n-workflows-ea4b71)

**🔗 Live demo: https://viv786ek.github.io/job-copilot/** — runs fully in your browser (sample candidate, fictional jobs). The matching engine, ATS scoring and honesty guardrails are the production code; AI writing is template-based in the demo.

## What it does

| | Feature | How |
|---|---|---|
| 1 | **Resume parser** | PDF/DOCX → text → LLM structured extraction (skills, experience, education, projects, certifications) validated by zod, cross-checked by a deterministic skill taxonomy |
| 2 | **JD analyzer** | Required/preferred skills, years, ATS keywords, seniority, visa, work mode → match score + missing skills |
| 3 | **Resume optimizer** | Per-JD tailored resume. **Honesty guardrails in code** strip invented skills, roles, projects and metrics, and show the user what was removed. ATS keyword coverage before → after |
| 4 | **Cover letters** | Specific, achievement-backed, tone-selectable, DOCX export |
| 5 | **Recruiter outreach** | LinkedIn connection note, LinkedIn message, email, day-5 and day-12 follow-ups |
| 6 | **Interview prep** | Technical, behavioral (STAR stories mapped to your resume), system design (scaled to seniority), questions to ask |
| 7 | **Application tracker** | Kanban + table, status timeline, interviews, follow-up scheduling, auto-ghosting after 3 nudges |
| ★ | **Job matching engine** | Deterministic, explainable 0–100 score across 6 components + ATS score; GIN-indexed candidate prefilter |
| ★ | **Job discovery** | Remotive, RemoteOK, Adzuna (India + 15 countries), Greenhouse/Lever/Ashby career pages, RSS via n8n; URL/paste import for LinkedIn, Naukri, Indeed, Wellfound, Instahyre, Hirist, Foundit |
| ★ | **Dashboard** | Resume health, ATS improvement, job match, applied, interviews, rejections, response rate, weekly trend, skill gaps |

## Architecture

```
Next.js (Vercel) ──Bearer JWT──▶ NestJS API (Render) ──▶ PostgreSQL (Neon)
   Auth.js v5                       │      │                Redis (cache, quotas)
                                    │      └─enqueue──▶ BullMQ ──▶ NestJS Worker
                                    ▼                              │  ├─ resume parsing
                       S3 / R2 (resumes, DOCX)                     │  ├─ job ingestion + dedupe
                                                                   │  ├─ JD analysis + match fan-out
              n8n ──x-internal-key──▶ /internal/*                  │  └─ auto-drafts
              (schedules, digests, follow-ups, email)              ▼
                                                     AI router: OpenAI → Claude → Gemini
```

Full HLD, LLD, sequence diagrams, ER diagram and scaling plan: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**

## Repository structure

```
.
├── apps/
│   ├── api/                      NestJS API + worker
│   │   ├── prisma/               schema.prisma, migrations, seed
│   │   └── src/
│   │       ├── common/           auth guard, decorators, zod pipe, error filter
│   │       ├── config/           validated env
│   │       ├── core/             Prisma, Redis cache, S3 storage
│   │       ├── modules/
│   │       │   ├── ai/           provider adapters, router, prompts
│   │       │   ├── matching/     scoring engine (+ tests)
│   │       │   ├── jobs/         connectors, ingestion, JD analysis, feed
│   │       │   ├── resumes/      upload, extraction, parsing, health
│   │       │   ├── documents/    tailoring, guardrails (+ tests), DOCX
│   │       │   ├── applications/ tracker, interviews, follow-ups
│   │       │   ├── dashboard/  profile/  auth/  notifications/  internal/  queue/
│   │       ├── workers/          BullMQ processors
│   │       ├── main.ts           HTTP entry
│   │       └── worker.ts         worker entry
│   └── web/                      Next.js 14 App Router
│       └── src/
│           ├── app/(auth)/       login, register
│           ├── app/(app)/        dashboard, jobs, analyzer, resumes, applications, documents, settings
│           ├── components/ui/    ShadCN components
│           ├── components/app/   sidebar, score ring, doc views
│           ├── auth.ts           Auth.js config
│           └── lib/              API client, types, utils
├── packages/shared/              zod schemas, enums, skill taxonomy (used by API + web)
├── n8n/workflows/                5 importable workflows
├── infra/docker-compose.yml      Postgres, Redis, MinIO, n8n
├── .github/workflows/            ci.yml, deploy.yml, pages.yml (static demo)
├── render.yaml                   Render blueprint
└── docs/                         ARCHITECTURE, API, SETUP, DEPLOYMENT, PRODUCT
```

## Quick start

```bash
npm install && npm run build -w @copilot/shared
npm run infra:up
cp .env.example apps/api/.env && cp .env.example apps/web/.env.local   # then fill secrets + one AI key
(cd apps/api && npx prisma migrate deploy && npm run prisma:seed)
npm run dev -w @copilot/api & npm run dev:worker -w @copilot/api & npm run dev -w @copilot/web
```

Open http://localhost:3000. Detailed guide: **[docs/SETUP.md](docs/SETUP.md)** · Deploy: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** · Endpoints: **[docs/API.md](docs/API.md)** · Product/UX: **[docs/PRODUCT.md](docs/PRODUCT.md)**

## n8n workflows

| # | Workflow | Flow |
|---|---|---|
| 01 | Resume Intake | Upload webhook → queue parse → (event) → email candidate |
| 02 | Scheduled Job Search | Every 6h: search APIs for all users + crawl career pages + RSS → normalize → store; 8am: per-user digest email |
| 03 | New Job Found | Webhook → analyze JD → score → tailored resume → cover letter → application draft (via API queue) |
| 04 | Application Tracking | Weekdays: due follow-ups → drafted reminder → mark sent/reschedule (feeds dashboard); status-update webhook |
| 05 | Notification Router | API events → email by type |

## Responsible sourcing

LinkedIn, Naukri, Indeed and similar boards prohibit automated scraping. This product **does not** log in to or crawl them. It uses public APIs and ATS board feeds, plus user-initiated import (URL → the page's public schema.org `JobPosting` data, pasted text, or HTML the user is already viewing). Users apply on the original site.

## Resume bullets (portfolio)

- Built an **AI-powered job application automation platform** (Next.js, NestJS, PostgreSQL, BullMQ, Redis, n8n) that parses resumes, discovers jobs from 10+ sources, and generates tailored resumes, cover letters and recruiter outreach.
- Designed an **explainable job-matching engine** (skill-alias normalization, experience/title/location fit, embedding similarity) with GIN-indexed candidate prefiltering, scoring every new job against all relevant users in the background.
- Implemented a **multi-provider LLM gateway** (OpenAI, Claude, Gemini) with automatic failover, zod-validated structured output with self-repair, Redis prompt caching and per-plan quotas.
- Enforced **AI honesty guardrails** that diff generated resumes against the source and strip fabricated skills, roles and metrics, while lifting ATS keyword coverage.
- Orchestrated **event-driven workflows** with BullMQ and n8n (scheduled discovery, daily digests, follow-up automation) and shipped CI/CD with GitHub Actions to Vercel, Render and Neon.

## License
MIT
