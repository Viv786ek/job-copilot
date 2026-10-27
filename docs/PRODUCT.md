# Product: UI/UX, business model, roadmap

## Positioning
**"The honest AI job copilot."** Competitors (resume rewriters, auto-apply bots) either fabricate or spam. We tailor truthfully, show our work (match breakdown, ATS before/after, guardrail log), and keep the human in the loop for every submission.

Name options if you rebrand: **Tailr**, **HireLoop**, **Applyly**, **OfferPath**.

## Personas
| Persona | Main job-to-be-done | Key screens |
|---|---|---|
| Fresher (0–1 yr) | Know which roles are realistic; fix a thin resume | Resume health, JD Analyzer, interview prep |
| Mid-level dev (2–7 yrs) | Apply to 10× more good-fit roles without 10× effort | Job feed, tailored resume, cover letter, tracker |
| Senior / lead | Be selective; reach hiring managers directly | Career-page tracking, outreach, system-design prep |
| Data / AI engineer | Navigate fast-moving skill keywords | Skill-gap insights on dashboard |

## Information architecture
```
/                 Landing
/login /register  Auth (email + Google/GitHub)
/dashboard        KPIs: resume health, avg match, ATS lift, applied, interviews, rejections, response rate, follow-ups due; weekly chart; skill gaps; pipeline
/jobs             Ranked feed · filters (score, source, remote, saved) · import by URL/paste · run search
/jobs/:id         Tabs: Match & gaps · JD analysis · Tailored resume · Cover letter · Outreach · Interview prep · [Track application]
/analyzer         Paste-a-JD → analysis + match without saving
/resumes          Drag-drop upload · parsed profile · health checklist with fixes
/applications     Kanban (Draft→Offer/Rejected) ⇄ table · inline status change · interviews · follow-up flags
/documents        All generated docs, versioned per job · DOCX download
/settings         Search preferences · candidate profile & skills (source of truth for tailoring)
```

## Core UX flows
1. **Onboarding (≤ 2 min to first value):** register → upload resume → parsed profile + health score in ~20s → first matches appear automatically (resume parse triggers a search).
2. **Daily loop:** 8am email digest → open top match → review gaps → generate tailored resume (ATS 54% → 81%) → download DOCX → apply on the original site → "Track application".
3. **Follow-up loop:** day 7 reminder with drafted follow-up → mark sent → day 14 → after 3 nudges, auto-marked Ghosted (keeps the response-rate metric honest).

## Design system
- ShadCN primitives + Tailwind tokens (`--primary` indigo, semantic `--success/--warning/--destructive`), light/dark ready.
- Score color scale everywhere: ≥75 green, 55–74 amber, <55 red.
- Every AI output shows provenance: version, ATS before/after, and what the guardrails removed.
- Mobile: collapsible sidebar, single-column cards, kanban scrolls horizontally.

## Monetization
| Plan | Price (India / Global) | Limits |
|---|---|---|
| Free | ₹0 / $0 | 50 AI generations/month, daily digest, 1 resume |
| Pro | ₹499/mo / $12/mo | Unlimited generations, auto-drafts, career-page tracking, priority queue |
| Team (bootcamps, placement cells) | per seat | Cohort dashboard, shared career pages, bulk resume review |

Unit economics: a full tailored-resume + cover-letter pair costs ≈ $0.01–0.03 on mini/flash-tier models; AI-response caching and deterministic scoring keep match cost ≈ $0.

## Roadmap
- **v1.1** Stripe/Razorpay billing (plan already enforced via `User.plan` + quota) · account deletion · Chrome extension for one-click import.
- **v1.2** Gmail integration: classify recruiter replies → auto-update status (endpoint and n8n webhook already exist).
- **v1.3** pgvector ANN retrieval · salary insights · referral finder.
- **v2** Mock interviews with voice · cohort analytics for placement cells.
