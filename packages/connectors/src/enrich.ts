import { createHash } from 'crypto';
import { analyzeJdHeuristic, assessVisa, parseLocation, toCountryCode, type JdAnalysis, type RemoteScope, type VisaAssessment } from '@copilot/shared';
import { sponsorFor, type SponsorRegisters } from './sponsors';
import type { RawJob } from './types';

/** A job after location, visa, relocation and requirement analysis. */
export interface EnrichedJob extends RawJob {
  id: string;
  countries: string[];
  regions: string[];
  remoteScope: RemoteScope;
  workMode: 'REMOTE' | 'HYBRID' | 'ONSITE' | null;
  visa: VisaAssessment;
  analysis: JdAnalysis;
  fingerprint: string;
  /** Same role found on other sites (duplicates collapsed into this job). */
  alsoOn?: Array<{ source: string; url: string }>;
  /** Epoch day this job first appeared in our index (freshness when sources omit dates). */
  firstSeenDay?: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function jobId(raw: Pick<RawJob, 'source' | 'externalId'>): string {
  return createHash('sha1').update(`${raw.source}|${raw.externalId}`).digest('hex').slice(0, 16);
}

/** Same role syndicated across boards collapses to one fingerprint. */
export function fingerprint(raw: Pick<RawJob, 'company' | 'title' | 'location'>, countries: string[]): string {
  return createHash('sha1')
    // Primary country only: boards list extra offices inconsistently ("Munich" vs "Munich | Amsterdam").
    .update(`${norm(raw.company)}|${norm(raw.title)}|${[...countries].sort()[0] ?? ''}`)
    .digest('hex')
    .slice(0, 16);
}

/** Repairs UTF-8 text that a source double-encoded as Latin-1 ("Sothebyâ\u0080\u0099s" → "Sotheby's"). */
export function fixMojibake(s: string): string {
  if (!/[ÃÂâ][\u0080-¿]/.test(s)) return s;
  try {
    const fixed = Buffer.from(s, 'latin1').toString('utf8');
    return fixed.includes('�') ? s : fixed;
  } catch {
    return s;
  }
}

export function enrichJob(input: RawJob, regs: SponsorRegisters | null = null): EnrichedJob {
  const raw: RawJob = { ...input, title: fixMojibake(input.title), company: fixMojibake(input.company), description: fixMojibake(input.description) };
  const loc = parseLocation(raw.location, raw.remoteHint ? 'Remote' : null);
  const hinted = toCountryCode(raw.countryHint ?? null);
  const countries = [...new Set([...(hinted ? [hinted] : []), ...loc.countries])];
  const remote = raw.remoteHint ?? loc.remote;
  const hybrid = raw.hybridHint ?? loc.hybrid;
  let remoteScope: RemoteScope = remote ? (loc.remoteScope ?? (countries.length ? 'COUNTRY' : 'GLOBAL')) : null;
  // "Developer Advocate (Germany)" with location "Remote": the title carries the country restriction.
  if (remoteScope === 'GLOBAL') {
    const inTitle = parseLocation(raw.title.match(/\(([^)]+)\)|[-–|]\s*([^-–|]+)$/)?.slice(1).find(Boolean) ?? null).countries;
    if (inTitle.length) {
      countries.push(...inTitle.filter((c) => !countries.includes(c)));
      remoteScope = 'COUNTRY';
    }
  }
  const text = `${raw.title}\n${raw.description}`;
  const analysis = analyzeJdHeuristic(raw.description, raw.title);
  const visa = assessVisa(text, { sponsorRegister: sponsorFor(regs, raw.company, countries) });
  return {
    ...raw,
    id: jobId(raw),
    countries,
    regions: loc.regions,
    remoteScope,
    workMode: remote ? 'REMOTE' : hybrid ? 'HYBRID' : analysis.workMode ?? (countries.length ? 'ONSITE' : null),
    visa,
    analysis,
    fingerprint: fingerprint(raw, countries),
  };
}

/** Prefers the richer/primary copy: ATS > career page > aggregator. */
const SOURCE_RANK: Record<string, number> = {
  GREENHOUSE: 1, LEVER: 1, ASHBY: 1, WORKABLE: 1, SMARTRECRUITERS: 1, RECRUITEE: 1, PERSONIO: 1,
  CAREER_PAGE: 2, FIRECRAWL: 2, ARBEITNOW: 3, HIMALAYAS: 3, REMOTIVE: 3, WEWORKREMOTELY: 3, REMOTEOK: 4, JOBICY: 4, WORKINGNOMADS: 4,
  REED: 4, USAJOBS: 2, ADZUNA: 5, JOOBLE: 5,
};

/**
 * Collapses the same role found on several sites into one job, keeping the best copy
 * and recording where else it was posted (shown to users as "Also on …").
 */
export function dedupe(jobs: EnrichedJob[]): EnrichedJob[] {
  const groups = new Map<string, EnrichedJob[]>();
  for (const j of jobs) {
    const g = groups.get(j.fingerprint);
    if (g) g.push(j);
    else groups.set(j.fingerprint, [j]);
  }
  const rank = (j: EnrichedJob) => SOURCE_RANK[j.source] ?? 9;
  return [...groups.values()].map((g) => {
    const best = g.reduce((a, b) => (rank(b) < rank(a) || (rank(b) === rank(a) && b.description.length > a.description.length) ? b : a));
    const alsoOn = g
      .filter((j) => j !== best && j.url !== best.url)
      .map((j) => ({ source: j.source, url: j.url }))
      .filter((x, i, arr) => arr.findIndex((y) => y.source === x.source) === i);
    return alsoOn.length ? { ...best, alsoOn } : best;
  });
}
