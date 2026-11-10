import { countryName } from './geo';
import type { MatchResult } from './schemas';
import { skillKey } from './skills';

export interface InsightJob {
  title: string;
  company: string;
  countries: string[];
  workMode: 'REMOTE' | 'HYBRID' | 'ONSITE' | null;
  remoteScope: 'GLOBAL' | 'REGION' | 'COUNTRY' | null;
  visaStatus: 'SPONSORS' | 'LIKELY' | 'UNKNOWN' | 'NO_SPONSORSHIP';
  relocation: boolean;
  requiredSkills: string[];
  preferredSkills: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  postedAt: string | null;
  minYears: number | null;
}

export interface ExplainContext {
  targetCountries: string[];
  authorizedCountries: string[];
  totalYearsExp: number;
}

/** Plain-language reasons a job was recommended (top first). Built only from facts we computed. */
export function explainMatch(m: MatchResult, j: Pick<InsightJob, 'countries' | 'workMode' | 'remoteScope' | 'visaStatus' | 'relocation' | 'minYears' | 'requiredSkills'>, ctx: ExplainContext): string[] {
  const reasons: Array<[number, string]> = [];
  const req = new Set(j.requiredSkills.map(skillKey)).size;
  const reqMatched = m.matchedSkills.filter((s) => j.requiredSkills.some((r) => skillKey(r) === skillKey(s)));
  // Skills lead when you cover most must-haves: they're the strongest evidence of fit.
  if (req && reqMatched.length) reasons.push([reqMatched.length / req >= 0.5 ? 95 : m.breakdown.requiredSkills, `You have ${reqMatched.length} of ${req} must-have skills (${reqMatched.slice(0, 3).join(', ')}).`]);
  else if (m.matchedSkills.length) reasons.push([80, `Uses your skills: ${m.matchedSkills.slice(0, 3).join(', ')}.`]);
  if (m.breakdown.title >= 70) reasons.push([m.breakdown.title, 'Title lines up with the roles you target.']);
  if (j.minYears != null && ctx.totalYearsExp >= j.minYears) reasons.push([70, `Asks for ${j.minYears}+ years; you have ${Math.floor(ctx.totalYearsExp)}.`]);
  const inTarget = j.countries.filter((c) => ctx.targetCountries.includes(c));
  if (j.workMode === 'REMOTE' && j.remoteScope === 'GLOBAL') reasons.push([75, 'Fully remote, open worldwide.']);
  else if (inTarget.length) reasons.push([72, `In ${inTarget.map(countryName).join(', ')}, one of your target countries.`]);
  const needsVisa = j.countries.length > 0 && ctx.authorizedCountries.length > 0 && !j.countries.some((c) => ctx.authorizedCountries.includes(c));
  if (needsVisa && j.visaStatus === 'SPONSORS') reasons.push([90, 'Employer states it sponsors visas.']);
  else if (needsVisa && j.visaStatus === 'LIKELY') reasons.push([65, 'Visa sponsorship looks likely.']);
  else if (!needsVisa && ctx.authorizedCountries.length && j.countries.some((c) => ctx.authorizedCountries.includes(c))) reasons.push([68, 'You can already work in this country.']);
  if (j.relocation) reasons.push([66, 'Relocation support offered.']);
  return reasons.sort((a, b) => b[0] - a[0]).map(([, r]) => r).slice(0, 3);
}

const quantiles = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  return { p25: q(0.25), median: q(0.5), p75: q(0.75) };
};

export interface CareerInsights {
  scope: { jobsConsidered: number; matching: number; strong: number; newThisWeek: number };
  skillDemand: Array<{ skill: string; jobs: number; share: number; youHaveIt: boolean }>;
  topGaps: Array<{ skill: string; jobs: number }>;
  countries: Array<{ code: string; name: string; jobs: number; visaFriendly: number }>;
  workModes: Record<string, number>;
  visaFriendlyEmployers: Array<{ company: string; roles: number }>;
  hiringNow: Array<{ company: string; roles: number }>;
  salaries: Array<{ currency: string; samples: number; p25: number; median: number; p75: number }>;
}

/**
 * Market view over the jobs relevant to this candidate (score ≥ 50): what the market asks for,
 * where it hires, who sponsors, and pay where postings publish it.
 */
export function computeCareerInsights(jobs: Array<InsightJob & { score: number }>, candidateSkills: string[]): CareerInsights {
  const have = new Set(candidateSkills.map(skillKey));
  const relevant = jobs.filter((j) => j.score >= 50);
  const weekAgo = Date.now() - 7 * 86_400_000;

  const demand = new Map<string, { label: string; n: number }>();
  for (const j of relevant)
    for (const s of new Set([...j.requiredSkills, ...j.preferredSkills])) {
      const k = skillKey(s);
      const cur = demand.get(k) ?? { label: s, n: 0 };
      cur.n++;
      demand.set(k, cur);
    }
  const skillDemand = [...demand.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 15)
    .map(([k, v]) => ({ skill: v.label, jobs: v.n, share: relevant.length ? Math.round((v.n / relevant.length) * 100) : 0, youHaveIt: have.has(k) }));
  const topGaps = [...demand.entries()]
    .filter(([k]) => !have.has(k))
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 8)
    .map(([, v]) => ({ skill: v.label, jobs: v.n }));

  const byCountry = new Map<string, { jobs: number; visa: number }>();
  for (const j of relevant)
    for (const c of j.countries) {
      const cur = byCountry.get(c) ?? { jobs: 0, visa: 0 };
      cur.jobs++;
      if (j.visaStatus === 'SPONSORS' || j.visaStatus === 'LIKELY') cur.visa++;
      byCountry.set(c, cur);
    }

  const count = (list: Array<InsightJob & { score: number }>) => {
    const m = new Map<string, number>();
    for (const j of list) m.set(j.company, (m.get(j.company) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([company, roles]) => ({ company, roles }));
  };

  const salaryBy = new Map<string, number[]>();
  for (const j of relevant) {
    if (!j.salaryCurrency || (!j.salaryMin && !j.salaryMax)) continue;
    const mid = j.salaryMin && j.salaryMax ? (j.salaryMin + j.salaryMax) / 2 : (j.salaryMin ?? j.salaryMax)!;
    if (mid < 1000) continue; // hourly/daily figures would distort annual ranges
    salaryBy.set(j.salaryCurrency, [...(salaryBy.get(j.salaryCurrency) ?? []), mid]);
  }

  const workModes: Record<string, number> = { REMOTE: 0, HYBRID: 0, ONSITE: 0 };
  for (const j of relevant) if (j.workMode) workModes[j.workMode]++;

  return {
    scope: {
      jobsConsidered: jobs.length,
      matching: relevant.filter((j) => j.score >= 60).length,
      strong: relevant.filter((j) => j.score >= 75).length,
      newThisWeek: relevant.filter((j) => j.postedAt && Date.parse(j.postedAt) >= weekAgo).length,
    },
    skillDemand,
    topGaps,
    countries: [...byCountry.entries()]
      .sort((a, b) => b[1].jobs - a[1].jobs)
      .slice(0, 12)
      .map(([code, v]) => ({ code, name: countryName(code), jobs: v.jobs, visaFriendly: v.visa })),
    workModes,
    visaFriendlyEmployers: count(relevant.filter((j) => j.visaStatus === 'SPONSORS' || j.visaStatus === 'LIKELY')),
    hiringNow: count(relevant.filter((j) => j.postedAt && Date.parse(j.postedAt) >= Date.now() - 14 * 86_400_000)),
    salaries: [...salaryBy.entries()]
      .filter(([, v]) => v.length >= 5)
      .map(([currency, v]) => ({ currency, samples: v.length, ...quantiles(v).valueOf() } as { currency: string; samples: number; p25: number; median: number; p75: number }))
      .map((s) => ({ ...s, p25: Math.round(s.p25), median: Math.round(s.median), p75: Math.round(s.p75) }))
      .sort((a, b) => b.samples - a.samples),
  };
}
