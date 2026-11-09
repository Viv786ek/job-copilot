import type { MatchResult } from './schemas';
import { extractKnownSkills, normalizeSkill, skillKey } from './skills';

/**
 * Job Matching Engine — deterministic, explainable, and cheap.
 *
 * LLMs extract structure (skills, years, keywords); the score itself is computed here so it is
 * reproducible, auditable and free to recompute for every (candidate, job) pair at ingest time.
 *
 *   score = Σ weight_i × component_i      (components are 0..1)
 *
 *   requiredSkills  40   coverage of must-have skills
 *   preferredSkills 10   coverage of nice-to-have skills
 *   experience      10   years vs. JD minimum (soft penalty below, small penalty when far above max)
 *   title           15   token overlap between target roles and job title
 *   semantic        15   cosine(profile embedding, job embedding)
 *   location        10   remote/location/visa fit
 *
 * When embeddings are unavailable the semantic weight is redistributed proportionally.
 */
export const WEIGHTS = {
  requiredSkills: 40,
  preferredSkills: 10,
  experience: 10,
  title: 15,
  semantic: 15,
  location: 10,
} as const;

export interface CandidateFeatures {
  skills: string[];
  totalYearsExp: number;
  targetTitles: string[];
  embedding: number[];
  resumeText: string;
  preferredLocations: string[];
  remoteOnly: boolean;
  needsVisaSponsorship: boolean;
  /** ISO codes the candidate wants to work in. */
  targetCountries?: string[];
  /** ISO codes where the candidate already has the right to work (citizenship, PR, existing visa). */
  authorizedCountries?: string[];
  openToRelocation?: boolean;
}

export interface JobFeatures {
  countries?: string[];
  remoteScope?: 'GLOBAL' | 'REGION' | 'COUNTRY' | null;
  visaStatus?: 'SPONSORS' | 'LIKELY' | 'UNKNOWN' | 'NO_SPONSORSHIP';
  title: string;
  requiredSkills: string[];
  preferredSkills: string[];
  atsKeywords: string[];
  minYears: number | null;
  maxYears: number | null;
  embedding: number[];
  location: string | null;
  workMode: 'REMOTE' | 'HYBRID' | 'ONSITE' | null;
  visaSponsorship: boolean | null;
  country: string | null;
}

const STOP = new Set(['and', 'or', 'the', 'of', 'for', 'with', 'in', 'a', 'an', '-', '/', '|', 'i', 'ii', 'iii']);
const SENIORITY_TOKENS = new Set(['senior', 'sr', 'junior', 'jr', 'lead', 'principal', 'staff', 'associate', 'intern', 'trainee']);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t) && !SENIORITY_TOKENS.has(t));
}

export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return NaN;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : NaN;
}

function coverage(have: Set<string>, want: string[]): { ratio: number; matched: string[]; missing: string[] } {
  const uniq = [...new Map(want.map((w) => [skillKey(w), normalizeSkill(w)])).entries()];
  if (!uniq.length) return { ratio: 1, matched: [], missing: [] };
  const matched: string[] = [];
  const missing: string[] = [];
  for (const [key, label] of uniq) (have.has(key) ? matched : missing).push(label);
  return { ratio: matched.length / uniq.length, matched, missing };
}

function experienceFit(years: number, min: number | null, max: number | null): number {
  if (min == null) return 1;
  if (years >= min) {
    // Heavily over-qualified candidates are often screened out for junior roles.
    if (max != null && years > max + 4) return 0.7;
    return 1;
  }
  const gap = min - years;
  return Math.max(0, 1 - gap / Math.max(min, 2));
}

/** Generic role nouns carry little signal on their own ("Sales Engineer" vs "Software Engineer"). */
const GENERIC = new Set(['engineer', 'manager', 'specialist', 'analyst', 'consultant', 'associate', 'officer', 'executive', 'head', 'director', 'team', 'member']);
const SYNONYM: Record<string, string> = { developer: 'engineer', dev: 'engineer', programmer: 'engineer', swe: 'software', sde: 'software', fullstack: 'full', 'full-stack': 'full', frontend: 'front', backend: 'back', 'front-end': 'front', 'back-end': 'back' };
/** Tokens of the same role family partially match each other. */
const FAMILIES: Array<Set<string>> = [
  new Set(['software', 'full', 'stack', 'front', 'back', 'web', 'platform', 'mobile', 'ios', 'android', 'application', 'api', 'cloud', 'infrastructure', 'devops', 'sre', 'systems', 'java', 'python', 'react', 'node', 'javascript', 'typescript', 'golang', '.net']),
  new Set(['data', 'analytics', 'bi', 'business', 'intelligence', 'insights', 'reporting']),
  new Set(['machine', 'learning', 'ml', 'ai', 'research', 'scientist', 'nlp', 'llm', 'vision']),
  new Set(['product', 'program', 'project', 'delivery']),
  new Set(['design', 'designer', 'ux', 'ui', 'visual', 'interaction']),
];

const normTokens = (s: string) => tokens(s.replace(/full[\s-]?stack/gi, 'full stack')).map((t) => SYNONYM[t] ?? t);

function titleFit(targets: string[], jobTitle: string): number {
  const jt = new Set(normTokens(jobTitle));
  if (!jt.size || !targets.length) return 0.5;
  let best = 0;
  for (const t of targets) {
    const tt = [...new Set(normTokens(t))];
    if (!tt.length) continue;
    let got = 0;
    let total = 0;
    for (const tok of tt) {
      const w = GENERIC.has(tok) ? 0.3 : 1;
      total += w;
      if (jt.has(tok)) got += w;
      else if (FAMILIES.some((f) => f.has(tok) && [...jt].some((x) => f.has(x)))) got += 0.7 * w;
    }
    best = Math.max(best, got / total);
  }
  return Math.min(1, best * 1.1);
}

const VISA_FIT: Record<string, number> = { SPONSORS: 1, LIKELY: 0.75, UNKNOWN: 0.35, NO_SPONSORSHIP: 0 };

/**
 * Location + work authorization. A role in a country where the candidate is not authorized
 * is only a fit if the employer sponsors; an explicit "no sponsorship" zeroes it.
 */
function locationFit(c: CandidateFeatures, j: JobFeatures): number {
  const jobCountries = j.countries?.length ? j.countries : j.country ? [j.country] : [];
  const authorized = c.authorizedCountries ?? [];
  const targets = c.targetCountries ?? [];
  const visa = j.visaStatus ?? (j.visaSponsorship === true ? 'SPONSORS' : j.visaSponsorship === false ? 'NO_SPONSORSHIP' : 'UNKNOWN');

  if (j.workMode === 'REMOTE') {
    if (j.remoteScope === 'GLOBAL' || !jobCountries.length) return 1;
    const reachable = [...authorized, ...targets];
    if (!reachable.length || jobCountries.some((cc) => reachable.includes(cc))) return 1;
    // Country-restricted remote: you generally need the right to work there.
    return Math.min(0.6, VISA_FIT[visa]);
  }
  if (c.remoteOnly) return j.workMode === 'HYBRID' ? 0.3 : 0;

  let geo = 0.7;
  if (targets.length && jobCountries.length) geo = jobCountries.some((cc) => targets.includes(cc)) ? 1 : c.openToRelocation ? 0.6 : 0.2;
  else if (c.preferredLocations.length && j.location) {
    const loc = j.location.toLowerCase();
    geo = c.preferredLocations.some((p) => loc.includes(p.toLowerCase())) ? 1 : 0.3;
  }

  const needsSponsorship =
    jobCountries.length > 0 && (authorized.length ? !jobCountries.some((cc) => authorized.includes(cc)) : c.needsVisaSponsorship);
  if (!needsSponsorship) return geo;
  return geo * VISA_FIT[visa];
}

/**
 * Keyword presence in the resume TEXT — what a classic ATS actually checks. A keyword counts
 * if it appears literally or via a known alias written in the text (e.g. "ReactJS" for "React").
 * Skills the candidate has but never wrote down do not count; that gap is what tailoring fixes.
 */
export function atsKeywordCoverage(resumeText: string, keywords: string[]) {
  const text = ` ${resumeText.toLowerCase()} `;
  const writtenSkills = new Set(extractKnownSkills(resumeText).map(skillKey));
  const matched: string[] = [];
  const missing: string[] = [];
  for (const kw of [...new Set(keywords.map((k) => k.trim()).filter(Boolean))]) {
    const present = text.includes(kw.toLowerCase()) || writtenSkills.has(skillKey(kw));
    (present ? matched : missing).push(kw);
  }
  const total = matched.length + missing.length;
  return { ratio: total ? matched.length / total : 1, matched, missing };
}

export function computeMatch(c: CandidateFeatures, j: JobFeatures): MatchResult {
  const have = new Set(c.skills.map(skillKey));
  const req = coverage(have, j.requiredSkills);
  const pref = coverage(have, j.preferredSkills);
  const ats = atsKeywordCoverage(c.resumeText, j.atsKeywords);

  const sem = cosine(c.embedding, j.embedding);
  // text-embedding-3 cosine for related docs typically lands in 0.2..0.7; rescale to 0..1.
  const semantic = Number.isNaN(sem) ? NaN : Math.min(1, Math.max(0, (sem - 0.2) / 0.5));

  const title = titleFit(c.targetTitles, j.title);
  const reqCount = new Set(j.requiredSkills.map(skillKey)).size;
  const prefCount = new Set(j.preferredSkills.map(skillKey)).size;
  const knownSkills = reqCount + prefCount;
  // Few listed skills = weak evidence: shrink coverage toward neutral so "1 of 1" isn't a perfect fit.
  const shrink = (ratio: number, n: number) => (n >= 3 ? ratio : (ratio * n + 0.5 * (3 - n)) / 3);

  const components = {
    // With no recognizable skills at all, title relevance stands in for skill coverage.
    requiredSkills: knownSkills === 0 ? title : shrink(req.ratio, reqCount || (prefCount ? 3 : 0)),
    preferredSkills: prefCount ? shrink(pref.ratio, prefCount) : NaN,
    experience: experienceFit(c.totalYearsExp, j.minYears, j.maxYears),
    title,
    semantic,
    location: locationFit(c, j),
  };

  let totalWeight = 0;
  let acc = 0;
  for (const [k, w] of Object.entries(WEIGHTS) as Array<[keyof typeof WEIGHTS, number]>) {
    const v = components[k];
    if (Number.isNaN(v)) continue;
    totalWeight += w;
    acc += w * v;
  }
  let score = Math.round((acc / totalWeight) * 100);
  // Hard gate: missing more than half the must-haves caps the score.
  if (j.requiredSkills.length >= 4 && req.ratio < 0.5) score = Math.min(score, 55);
  // Unrelated role family (e.g. "Mechanical Design Engineer" for a software profile) can't rank high.
  if (title < 0.3 && components.requiredSkills < 0.7) score = Math.min(score, 50);
  if (knownSkills === 0) score = Math.min(score, 70);

  // Same keyword measure the tailored-resume before/after uses, so the two numbers always agree.
  const atsScore = knownSkills === 0 && !j.atsKeywords.length ? Math.round(title * 100) : Math.round(ats.ratio * 100);

  const recommendations: string[] = [];
  if (knownSkills === 0) recommendations.push('This posting lists few concrete skills, so the score leans on title, experience and location. Read the full description.');
  if (req.missing.length)
    recommendations.push(`Gap in must-have skills: ${req.missing.slice(0, 6).join(', ')}. Only add them once you genuinely have the experience.`);
  const phrasing = ats.missing.filter((k) => have.has(skillKey(k)));
  if (phrasing.length)
    recommendations.push(`You have these but the resume doesn't say them the way the JD does: ${phrasing.slice(0, 8).join(', ')}.`);
  if (components.experience < 1 && j.minYears != null)
    recommendations.push(`JD asks for ${j.minYears}+ years; lead with your most relevant, highest-impact work.`);
  if (components.title < 0.4) recommendations.push('Align your headline with this role title where it truthfully reflects your work.');

  // -1 marks a component that did not apply (no preferred skills listed, no embeddings).
  const round = (n: number) => (Number.isNaN(n) ? -1 : Math.round(n * 100));
  return {
    score,
    atsScore,
    breakdown: {
      requiredSkills: round(components.requiredSkills),
      preferredSkills: round(components.preferredSkills),
      experience: round(components.experience),
      title: round(components.title),
      semantic: round(components.semantic),
      location: round(components.location),
    },
    matchedSkills: [...new Set([...req.matched, ...pref.matched])],
    missingRequiredSkills: req.missing,
    missingPreferredSkills: pref.missing,
    matchedKeywords: ats.matched,
    missingKeywords: ats.missing,
    recommendations,
  };
}
