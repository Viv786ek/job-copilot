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
 *   experience      15   years vs. JD minimum (soft penalty below, small penalty when far above max)
 *   title           10   token overlap between target roles and job title
 *   semantic        15   cosine(profile embedding, job embedding)
 *   location        10   remote/location/visa fit
 *
 * When embeddings are unavailable the semantic weight is redistributed proportionally.
 */
export const WEIGHTS = {
  requiredSkills: 40,
  preferredSkills: 10,
  experience: 15,
  title: 10,
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
}

export interface JobFeatures {
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

function titleFit(targets: string[], jobTitle: string): number {
  const jt = new Set(tokens(jobTitle));
  if (!jt.size || !targets.length) return 0.5;
  let best = 0;
  for (const t of targets) {
    const tt = tokens(t);
    if (!tt.length) continue;
    const overlap = tt.filter((x) => jt.has(x)).length;
    best = Math.max(best, overlap / Math.max(tt.length, jt.size));
  }
  return Math.min(1, best * 1.25);
}

function locationFit(c: CandidateFeatures, j: JobFeatures): number {
  if (c.needsVisaSponsorship && j.visaSponsorship === false) return 0;
  if (j.workMode === 'REMOTE') return 1;
  if (c.remoteOnly) return j.workMode === 'HYBRID' ? 0.3 : 0;
  if (!c.preferredLocations.length || !j.location) return 0.7;
  const loc = j.location.toLowerCase();
  return c.preferredLocations.some((p) => loc.includes(p.toLowerCase())) ? 1 : 0.3;
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

  const components = {
    requiredSkills: req.ratio,
    preferredSkills: pref.ratio,
    experience: experienceFit(c.totalYearsExp, j.minYears, j.maxYears),
    title: titleFit(c.targetTitles, j.title),
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

  const atsScore = Math.round((0.7 * ats.ratio + 0.3 * req.ratio) * 100);

  const recommendations: string[] = [];
  if (req.missing.length)
    recommendations.push(`Gap in must-have skills: ${req.missing.slice(0, 6).join(', ')}. Only add them once you genuinely have the experience.`);
  const phrasing = ats.missing.filter((k) => have.has(skillKey(k)));
  if (phrasing.length)
    recommendations.push(`You have these but the resume doesn't say them the way the JD does: ${phrasing.slice(0, 8).join(', ')}.`);
  if (components.experience < 1 && j.minYears != null)
    recommendations.push(`JD asks for ${j.minYears}+ years; lead with your most relevant, highest-impact work.`);
  if (components.title < 0.4) recommendations.push('Align your headline with this role title where it truthfully reflects your work.');

  const round = (n: number) => (Number.isNaN(n) ? 0 : Math.round(n * 100));
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
