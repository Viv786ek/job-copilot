# AI Job Discovery: competitor analysis, product plan and implementation

## 1. Competitor analysis: The Anti Job Board (theantijobboard.com)

Studied from the 63-second screen recording provided (Nov 2026) and the public site.

### User journey (as recorded)
| t | Screen | What happens |
|---|---|---|
| 0–4 s | Landing: "Your job search, on autopilot." | One input: *LinkedIn link, or drop your CV* + "Get started". Secondary: "No link handy? Find me by name". |
| 8 s | "antijob is on it" (timer) → "Read Vivek's LinkedIn" | Profile card: headline, past employers, years of experience, skill chips. |
| 13–21 s | "Five quick ones" | One question per screen, tap answers: **where** (remote / New York / San Francisco / London / anywhere), **salary** ($140k+), **company size** (tiny startup / scale-up / big tech / don't mind), **role** (suggested from profile: staff AI engineer, eng manager, ML engineer, AI architect), **email tone**. |
| 25 s | "Got it. Personalising your hunt…" | Answer chips summarised. |
| 29–31 s | "Searched YC, X, Reddit and 4,797 career pages" | Per-source counts: YC 337, Wellfound 6,076, Greenhouse 37,132, Ashby 24,715, Lever 8,735, Workable 9,294; X/Reddit hiring threads. |
| 34–58 s | "Found 91 staff AI engineer jobs" | Swipeable cards (company, title, remote, "yesterday"); several locked "members only". Filter chips: anywhere · $140k+ · any size · this week. |
| 34 s | "Found who to email at 3 companies" | Head of Engineering / Head of Data with (blurred) personal emails. |
| 53 s | "3 startups just raised and will be hiring" | Funding signals with amount and recency. |
| 39–47 s | "91 confident emails written" → signup wall | Emails "sealed until you open your dashboard"; account required (Google or email). Personal page `theantijobboard.com/in/<handle>`. |

Site positioning: roles **posted today** at funded startups; sources YC Work at a Startup, Wellfound, and Greenhouse/Ashby/Lever/Workable career pages; drafts a short email to the hiring manager; user sends from Gmail (optional "Hybrid/Full autopilot" sends up to 10 each weekday). Pricing is not shown on the page.

### What makes it work
1. **Zero-form onboarding.** One input, then the product *shows* it understood you before asking anything.
2. **Five tap-only questions** instead of a filter form.
3. **Visible effort.** Live source counts make the search feel exhaustive and fresh.
4. **Outcome, not a list.** The deliverable is "emails to the person who can hire you", not "jobs".
5. **Paywall after value is demonstrated** (results visible, details locked).

### Limitations and openings for us
| Their gap | Our opportunity |
|---|---|
| Startup/US-centric (SF, NY, London presets; $ salaries) | **Any country** via ISO-3166, multi-country targets, remote reach (worldwide/region/country) |
| No work-authorization or visa logic | **Visa sponsorship detection** with evidence, programme types, relocation, official UK/NL sponsor registers, scoring by where you can already work |
| Match quality is implicit | **Explainable match score**: reasons, missing skills, ATS keyword gaps |
| "Read your LinkedIn" from a URL: LinkedIn offers no public API to read profiles, so this relies on access LinkedIn doesn't grant third parties | **Permitted inputs only**: LinkedIn's own *Save to PDF* export (parsed natively), pasted profile text, resume upload; URL stored as a link only |
| Results locked behind signup | Results free; account only needed for the server edition |
| Cold emails to personal addresses found by enrichment: deliverability, privacy (GDPR) and anti-spam risk | We draft outreach the user sends themselves and never harvest personal emails |
| No application tracking, tailoring, interview prep | Already in our product: tracker, honest tailored resumes, cover letters, interview prep, apply kit |

## 2. Our product: assessment before the change

| Area | State |
|---|---|
| Vision / users | AI job-search copilot for software, data and AI professionals targeting global, remote and visa-sponsored roles |
| Frontend | Next.js 14 App Router, ShadCN-style components, React Query; two editions from one codebase: server (Auth.js) and local (GitHub Pages, in-browser API) |
| Backend | NestJS + Prisma (Postgres) + BullMQ workers; modules for auth, profile, resumes, jobs, matching, documents, applications, dashboard, internal (n8n) |
| Job data | `packages/connectors`: 7 ATS APIs, 7 public feeds, 4 keyed aggregators, careers-page crawler, sponsor registers; harvested every 6 h |
| Intelligence | `packages/shared`: location/visa NLP, deterministic resume parser, matching engine, guardrails, generators |
| AI | Optional: Gemini/OpenAI/Claude/OpenAI-compatible (Ollama) with deterministic fallback |
| Gaps vs the vision | No guided onboarding; LinkedIn input not supported; no Saved Jobs or Career Insights view; matches lacked plain-language reasons; no salary/experience/freshness filters; duplicates silently dropped |

## 3. Feature comparison

| Capability | Anti Job Board | Ours (after this change) |
|---|---|---|
| Resume upload | ✅ | ✅ PDF/DOCX/TXT, parsed in browser |
| LinkedIn input | URL | ✅ LinkedIn PDF export + pasted text; URL saved as link (no scraping) |
| Guided questions | ✅ 5 | ✅ 5 (where, work authorization, work mode, role + level, salary) |
| Live source counts | ✅ | ✅ real index counts per source |
| Sources | YC, Wellfound, X, Reddit, 4.8k career pages | 634 verified career boards (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee, Personio) + RemoteOK, WWR, Remotive, Himalayas, Jobicy, Arbeitnow, Working Nomads; Adzuna/Jooble/Reed/USAJobs with keys |
| Countries | presets | ✅ every ISO country |
| Visa sponsorship | ❌ | ✅ detection + registers + scoring |
| Match explanation | ❌ | ✅ reasons, gaps, ATS score |
| Salary / experience filters | salary chip | ✅ where data exists |
| Duplicate detection | — | ✅ merged with "Also on N sites" |
| Freshness | "posted today" | ✅ posted date or first-seen-by-us date, "found in last 24 h" filter |
| Saved jobs | ? | ✅ |
| Application tracker | ❌ | ✅ |
| Tailored resume / cover letter / interview prep | email only | ✅ |
| Hiring-manager emails | ✅ (enrichment) | ❌ by design (recruiter outreach drafts instead) |
| Funding signals | ✅ | Phase 2 |
| Career insights | ❌ | ✅ |

## 4. Navigation

```
Dashboard
AI Job Discovery      ← new: guided onboarding + top matches
Recommended Jobs      ← renamed "Job Matches", same powerful filters
Saved Jobs            ← new
Application Tracker
Career Insights       ← new
── Tools ──
JD Analyzer · Generated Docs
── Account ──
My Profile (resumes & LinkedIn exports) · Settings
```
Rationale: discovery → triage → act → learn flows top to bottom; tools that need a selected job sit below; profile/settings are account concerns.

## 5. Roadmap (scored on pain, value, effort, differentiation)

### MVP: built now
| Feature | Why now |
|---|---|
| AI Job Discovery flow (input → review → 5 questions → results) | Biggest activation lever; competitor's best idea; low effort on our engine |
| LinkedIn PDF export + pasted-profile parsing | Most users have LinkedIn, not an updated resume; legal path |
| Plain-language "why this matches" | Trust; cheap (computed from existing scores) |
| Saved Jobs page | Basic triage need |
| Career Insights (skill demand, gaps, where hiring, visa-friendly employers, pay) | Differentiator; reuses index; no new data |
| Experience, salary, "new in index" filters | Requested; data already harvested |
| Duplicate merge with "Also on" | Reduces noise across 14 sources |
| First-seen freshness tracking | Many sources omit dates |
| Mock provider with the connector contract | Offline dev/tests; consistent contracts |

### Phase 2: next
| Feature | Notes |
|---|---|
| Funding signals ("just raised") | Free RSS (TechCrunch, Crunchbase News) + company match; boost those companies |
| Company size / stage | From YC dataset (team size, stage) and Wikidata; enables competitor's "startup vs big tech" question |
| Email digest of new matches | n8n workflow 02 already exists in server edition |
| Gmail draft creation for outreach | User-authorised OAuth, user clicks send |
| Link liveness check | Server-side HEAD checks on apply URLs during harvest |
| Cloudflare Pages deploy | Commercial-use-compatible static hosting |
| Jooble, Adzuna (commercial terms), Reed keys | More country coverage (Gulf, Luxembourg) |

### Future
Semantic matching with embeddings (pgvector), salary normalisation by period/currency, personal public profile page, browser extension that captures jobs from any site the user views, team/placement-cell plans, interview scheduling assistant.

### Monetisation
Free: discovery, matching, insights, tracker. Pro: AI writing at volume, daily digests, Gmail drafts, priority harvest, unlimited saved searches. Teams: cohort dashboards for bootcamps/universities.

## 6. Free providers

Verified Nov 2026; terms change, so re-check before launch.

| Provider | Type | Free tier / limits | Key | Commercial use | Effort | Status in code |
|---|---|---|---|---|---|---|
| Greenhouse Job Board API | ATS | Public, per-company, no published hard limit | No | Public data published by employers; link back | Low | ✅ live |
| Lever Postings API | ATS | Public | No | Same | Low | ✅ live |
| Ashby Posting API | ATS | Public | No | Same | Low | ✅ live |
| Workable widget API | ATS | Public | No | Same | Low | ✅ live |
| SmartRecruiters Posting API | ATS | Public; detail call per posting | No | Same | Low | ✅ live |
| Recruitee, Personio feeds | ATS | Public | No | Same | Low | ✅ live |
| RemoteOK API | Feed | Public JSON | No | Must link back & credit RemoteOK | Low | ✅ live |
| We Work Remotely RSS | Feed | Public RSS | No | Attribute; link to original | Low | ✅ live |
| Remotive API | Feed | Max ~2 requests/min; asks for low frequency | No | Attribute; link back | Low | ✅ live |
| Himalayas, Jobicy, Working Nomads | Feed | Public | No | Attribute | Low | ✅ live |
| Arbeitnow API | Feed | Public, rate-limited (paced in code) | No | Attribute | Low | ✅ live |
| YC companies (yc-oss) | Company list | Community dataset on GitHub | No | Unofficial; used only to discover public ATS boards | Low | ✅ live |
| UK sponsor register | Gov data | Public CSV | No | Open Government Licence | Low | ✅ live |
| NL IND sponsor register | Gov data | Public page | No | Public register | Low | ✅ live |
| Adzuna | Aggregator | 25/min, 250/day, 2,500/month | Yes (free) | Free tier for evaluation; commercial use needs agreement; attribution; snippet descriptions | Low | ✅ adapter, needs key |
| Jooble | Aggregator | Key on request | Yes | Per their agreement | Low | ✅ adapter, needs key |
| Reed | Aggregator (UK) | Free key | Yes | Attribution | Low | ✅ adapter, needs key |
| USAJobs | Gov (US) | Free key | Yes | Public data | Low | ✅ adapter, needs key |
| Firecrawl | Career-page extraction | Free credits, then paid | Yes | Yes | Low | ✅ adapter, needs key |
| Google Gemini API | LLM | Free tier with rate limits (prompts may be used to improve Google products on the free tier) | Yes | Paid tier recommended for commercial privacy | Low | ✅ browser + server |
| Ollama / LM Studio | Local LLM | Free, your hardware | No | Model-licence dependent (Llama, Qwen, Mistral) | Medium | ✅ server (`OPENAI_COMPAT_*`) |
| GitHub Pages | Static hosting | 1 GB site, 100 GB/month soft | No | **Not allowed for commercial SaaS** | Done | ✅ current host (portfolio) |
| Cloudflare Pages | Static hosting | Free plan | No | Allowed | Low | Phase 2 |
| Neon Postgres | DB | Free plan | Yes | Allowed | Low | Server edition |
| Upstash Redis | Cache/queue | Free plan | Yes | Allowed | Low | Server edition |
| Cloudflare R2 | Storage | Free 10 GB | Yes | Allowed | Low | Server edition |

**Not used, by design:** LinkedIn (no public job or profile read API; scraping prohibited), Wellfound (no API; bot-protected), Indeed (publisher API closed), paid aggregators (SerpAPI, JSearch/RapidAPI, Proxycurl).

## 7. Architecture and data flow

```
          ┌──────────────── GitHub Actions, every 6 h ────────────────┐
Sources → connectors (ATS · feeds · keyed · mock) → enrich (geo, visa, skills, salary)
        → dedupe (+ alsoOn) → first-seen state (cache) → static dataset (index + shards)
          └────────────────────────────────────────────────────────────┘
                                   │
     Browser edition (Pages)       │      Server edition (Nest + Postgres + BullMQ)
     ──────────────────────        │      ─────────────────────────────────────────
     Resume / LinkedIn PDF / text  │      Same connectors in the worker; JobMatch per user
       → parseResumeText (shared)  │      /resumes, /resumes/text, /jobs/feed, /insights
     Preferences (5 questions)     │      same request/response contracts
       → computeMatch + explainMatch (shared) → Recommended / Saved / Insights
```
Contracts: both editions implement the same REST routes (`/jobs/feed`, `/jobs/:id`, `/resumes`, `/resumes/text`, `/profile`, `/insights`, …), so every page works against either backend. New providers implement `FeedConnector` or `BoardConnector` and are registered in one list.

## 8. Implementation status

| Feature | Status |
|---|---|
| AI Job Discovery page (4 steps) | ✅ Implemented, real data |
| Resume upload (PDF/DOCX/TXT) | ✅ |
| LinkedIn "Save to PDF" export parsing | ✅ (unit-tested layout incl. grouped roles) |
| Pasted profile text | ✅ |
| LinkedIn URL | ✅ stored as a link; **does not fetch** (no permitted API) |
| Five quick questions → preferences | ✅ |
| Live source counts | ✅ (real index counts) |
| Explainable matches | ✅ |
| Saved Jobs | ✅ |
| Career Insights | ✅ |
| Experience / salary / freshness filters | ✅ (salary only where postings publish it) |
| Duplicate detection with "Also on" | ✅ |
| First-seen freshness | ✅ (needs two scheduled runs to accumulate) |
| Mock provider | ✅ offline, `JOB_SOURCES_MODE=mock`, used by tests only |
| Adzuna / Jooble / Reed / USAJobs / Firecrawl | ⏳ adapters ready, **need your keys** |
| AI-written parsing/documents | ⏳ optional Gemini key in Settings |
| Funding signals, company size, Gmail drafts, digests | 📋 Phase 2 |
