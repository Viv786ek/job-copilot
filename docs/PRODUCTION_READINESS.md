# Production readiness report

## 1. Architecture (current)

```
                ┌──────────── GitHub Actions (every 6 h, free) ────────────┐
                │ discover (weekly) → harvest → enrich → dataset → Pages   │
                └──────────────────────────────────────────────────────────┘
 Sources ──► packages/connectors ──► packages/shared (geo · visa · skills · matching · resume parser · guardrails)
                    │                                  │
                    ├──► apps/api worker (BullMQ, Postgres)   ── server edition (Render/Railway + Neon)
                    └──► static dataset ──► apps/web local edition (GitHub Pages, in-browser API)
```

| Layer | Component | Status |
|---|---|---|
| Sources | `packages/connectors`: 7 ATS APIs, 7 keyless feeds, 4 keyed feeds, career-page crawler (JSON-LD → Firecrawl → Playwright), UK & NL sponsor registers, company discovery | Live, smoke-tested |
| Intelligence | `packages/shared`: ISO-3166 location parser, visa/relocation NLP with confidence, deterministic resume parser, JD analyzer, matching engine with work authorization, ATS coverage, honesty guardrails, document generators, prompts | 29 unit tests |
| Server | `apps/api`: NestJS + Prisma + BullMQ; scheduled harvest, per-user matching, filters, insights, apply kit, multi-provider AI with deterministic fallback | Typechecked, migrations generated |
| Web | `apps/web`: Next.js; server edition (Auth.js) and local edition (GitHub Pages) from one codebase | Built and browser-tested |
| Automation | n8n workflows 01–05 + BullMQ schedules + GitHub Actions harvest | Configured |

## 2–4. Gaps found and closed

| Gap | Fix |
|---|---|
| Live site used fictional sample jobs and a sample resume | Removed `seed.ts`; site loads the real harvested dataset and parses the user's own resume in the browser |
| Only 3 job sources; no Workable/SmartRecruiters/Recruitee/Personio/WWR/Himalayas/Jobicy/Arbeitnow/Working Nomads | Added all, each verified live |
| No company list beyond 5 hardcoded boards | Discovery CLI verifies boards for 1,770 candidates (YC hiring + curated); 634 verified boards |
| Countries were a single free-text field | ISO-3166 detection for every country; multi-country filters; remote reach (global / region / country) |
| Visa detection was one regex | Weighted NLP with negations, programme detection, relocation, authorization requirements, confidence, evidence; UK/NL official registers |
| Matching ignored work authorization | Location fit now uses target countries, authorized countries, relocation and visa status |
| Resume parsing, JD analysis and documents required a paid LLM | Deterministic engines by default; free Gemini or local Ollama/LM Studio via `OPENAI_COMPAT_BASE_URL` |
| AI provider chain empty if the primary wasn't configured | Chain now includes every configured provider |
| ATS "before → after" counted skills not written in the resume | Coverage counts only text (with aliases) |
| Resume parser misread Oct/Nov/Dec | Fixed (caught by new tests) |
| No apply workflow | Apply kit: prefilled answers, sponsorship statement, autofill bookmarklet; user submits |
| No recruiter/company insights | Open roles, 30-day hiring velocity, visa-friendly roles, hiring countries, sponsor licence, posting age |
| Seed created a demo user with a hardcoded password | Seed now only loads verified company boards |
| Deploy workflow failed on every push without secrets | Gated by `DEPLOY_ENABLED` |

## 5–6. Files changed

New: `packages/connectors/**`, `packages/shared/src/{geo,visa,resume-parser,templates,prompts,heuristics}.ts`, `apps/api/src/modules/ai/providers/local.provider.ts`, `apps/api/prisma/migrations/20261108000000_job_intelligence`, `apps/web/src/lib/local/{backend,dataset,resume,ai}.ts`, `apps/web/src/components/app/{country-picker,job-panels,edition-banner}.tsx`, `apps/web/scripts/copy-vendor.mjs`, `docs/PRODUCTION_READINESS.md`.
Rewritten: `apps/api/src/modules/jobs/jobs.service.ts`, `apps/web/src/app/(app)/jobs/page.tsx`, `apps/web/src/app/(app)/settings/page.tsx`, `.github/workflows/pages.yml`, `apps/api/prisma/seed.ts`.
Removed: `apps/api/src/modules/jobs/connectors/*` (superseded), `apps/web/src/lib/demo/seed.ts` (sample data).

## 7–8. APIs connected / removed

| Connected (free, no key) | Endpoint |
|---|---|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true` |
| Lever | `api.lever.co/v0/postings/{slug}?mode=json` |
| Ashby | `api.ashbyhq.com/posting-api/job-board/{slug}` |
| Workable | `apply.workable.com/api/v1/widget/accounts/{slug}?details=true` |
| SmartRecruiters | `api.smartrecruiters.com/v1/companies/{id}/postings` |
| Recruitee | `{slug}.recruitee.com/api/offers/` |
| Personio | `{slug}.jobs.personio.de/xml` |
| RemoteOK, Remotive, Himalayas, Jobicy, Arbeitnow, Working Nomads | public JSON APIs |
| We Work Remotely | official category RSS feeds |
| Y Combinator hiring companies | `yc-oss.github.io/api/companies/hiring.json` |
| UK sponsor register | gov.uk CSV (Skilled Worker route) |
| NL sponsor register | ind.nl public register |

| Connected (free key) | Adds |
|---|---|
| Adzuna | UK, US, DE, NL, CH, AT, AU, NZ, CA, SG, IN, FR, BE, IT, ES, PL |
| Jooble | UAE, Luxembourg, Saudi Arabia, Qatar and 60+ countries |
| Reed | UK |
| USAJobs | US federal |
| Firecrawl | careers pages without a public ATS API |
| Google Gemini / Ollama | AI writing and parsing |

Not integrated, by design: **LinkedIn, Indeed, Glassdoor, Wellfound, Naukri, Bayt** have no free public job API and their terms prohibit scraping (Wellfound returns a bot challenge). Jobs from them are added by paste (JD Analyzer / Add a job). Paid aggregators (SerpAPI, JSearch, RapidAPI, Proxycurl) were not used. The German Federal Employment Agency API now rejects its public key (HTTP 403) and was left out.

## 9. Sample services replaced

`apps/web/src/lib/demo/*` (fictional companies, sample resume, sample applications) → `apps/web/src/lib/local/*` backed by the harvested dataset and the user's resume.

## 10. Readiness score

| Area | Score |
|---|---|
| Job discovery & data quality | 8/10 (Gulf/Luxembourg coverage needs the free Jooble key) |
| Resume parsing & matching | 8/10 (deterministic parser; 9/10 with a Gemini key) |
| Visa & country intelligence | 8/10 |
| Documents & apply workflow | 7/10 |
| Static edition (GitHub Pages) | 9/10 |
| Server edition | 7/10 (code complete; needs hosting accounts) |
| Security | 8/10 |
| **Overall** | **8/10** |

## 11. Security audit

| Finding | Status |
|---|---|
| Hardcoded demo credentials in seed | Removed |
| SSRF via job/career URL import | Private, loopback and link-local hosts blocked (`assertPublicUrl`) |
| Untrusted HTML/JSON from sources | Converted to text; never rendered as HTML; React escapes output |
| Prompt injection via resumes/JDs | Data wrapped in tags; prompts instruct to ignore embedded instructions; outputs schema-validated |
| Fabricated resume content | Guardrails strip unknown skills, roles, projects and metrics |
| pdf.js script execution (CVE-2024-4367 class) | `isEvalSupported: false`, pdf.js 4.10 |
| Browser-stored Gemini key | Stored only in the user's browser, sent only to Google via header; never in URLs or logs |
| Internal endpoints | `x-internal-key` constant-time compare; JWT for user routes; per-route rate limits |
| Scraping compliance | Only public APIs, RSS, registers and JSON-LD; per-host concurrency limit; identifiable User-Agent |

## 12. Deployment status

| Target | Status |
|---|---|
| GitHub Pages (local edition) | Deployed by `pages.yml`; refreshes every 6 h |
| Render/Railway + Neon + Vercel (server edition) | Ready; requires accounts and secrets (`deploy.yml`, gated by `DEPLOY_ENABLED`) |

## 13. Credentials still required (all free)

| Credential | Where | Unlocks |
|---|---|---|
| `JOOBLE_API_KEY` | jooble.org/api/about → GitHub Actions secret | UAE, Luxembourg, Gulf coverage |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | developer.adzuna.com → secret | Country search in 16 markets |
| `REED_API_KEY` | reed.co.uk/developers → secret | More UK roles |
| `USAJOBS_API_KEY` + `USAJOBS_EMAIL` | developer.usajobs.gov → secret | US federal roles |
| `FIRECRAWL_API_KEY` | firecrawl.dev → secret | Non-ATS career pages |
| Gemini API key | aistudio.google.com → paste in the app's Settings | AI parsing & writing |
| Neon, Render or Railway, Vercel | their dashboards | Server edition (multi-user, email digests) |

## 14. End-to-end results

| Test | Result |
|---|---|
| Unit tests (matching, guardrails, geo, visa, resume parser, work authorization) | 29 / 29 pass |
| Typecheck: shared, connectors, API, web | Pass |
| Live smoke test, every source | 7 ATS APIs + 7 feeds OK; 4 keyed feeds skipped (no keys) |
| Company discovery (1,770 candidates) | 634 verified boards |
| Full live harvest | 28,915 postings → 17,134 unique jobs, 3,185 companies, 137 countries; UK register 123,231 sponsors, NL register 13,089 |
| Visa detection on harvested jobs | 350 explicit sponsors, 954 likely, 639 explicit "no sponsorship", 622 with relocation |
| Static build (GitHub Pages, real dataset) | Pass |
| Browser: PDF resume upload → parse | Name, contact, 2 roles with dates and bullets, education, project, certification; health 85 |
| Browser: DOCX resume upload → parse | Same result |
| Browser: feed filtered to DE/NL/GB/AE, hide no-sponsorship | 4,434 jobs, ranked; visa and relocation badges |
| Browser: job detail → visa panel, recruiter insights | Evidence and company stats shown |
| Browser: tailored resume, cover letter, outreach, interview prep | All generated; guardrails applied |
| Browser: apply kit + autofill bookmarklet on a Greenhouse/Lever/Ashby-style form | 8 / 8 fields filled, user-entered field untouched, nothing submitted |
| Browser: mark applied → tracker → dashboard | Application APPLIED with 7-day follow-up; dashboard updated |

Issues found during E2E and fixed: inflated scores for postings without recognizable skills; title relevance across role families; double-encoded text from RemoteOK; country restrictions stated only in titles; "Git" inferred from GitHub URLs; truncated certification names; strong-match count capped at 200.
