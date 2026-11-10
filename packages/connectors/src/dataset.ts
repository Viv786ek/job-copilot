/**
 * Static dataset format consumed by the browser edition (GitHub Pages).
 *
 *   meta.json            generation time, per-source stats, facets (countries, sources)
 *   index.json           compact columnar list of every job (loaded once, ~150 B/job)
 *   jobs/<xx>.json       detail shards keyed by the first two hex chars of the job id
 */
import { countryName } from '@copilot/shared';
import type { EnrichedJob } from './enrich';
import type { HarvestResult } from './harvest';

export const VISA_CODES = { UNKNOWN: 0, LIKELY: 1, SPONSORS: 2, NO_SPONSORSHIP: 3 } as const;
export const SCOPE_CODES = { null: 0, GLOBAL: 1, REGION: 2, COUNTRY: 3 } as const;
export const MODE_CODES = { null: 0, REMOTE: 1, HYBRID: 2, ONSITE: 3 } as const;

export interface DatasetIndex {
  v: 1;
  companies: string[];
  sources: string[];
  skills: string[];
  /** Column order documented in INDEX_COLUMNS. */
  rows: Array<[string, string, number, string, string, string, number, number, number, number, number[], number, number, string, number, number, number[], number, number, string, number, number]>;
}
export const INDEX_COLUMNS = [
  'id', 'title', 'companyIdx', 'location', 'countries(csv)', 'regions(csv)', 'remoteScope', 'workMode', 'visaStatus', 'visaConfidence',
  'requiredSkillIdx[]', 'postedDay', 'sourceIdx', 'url', 'relocation(0/1)', 'minYears(-1=unknown)', 'preferredSkillIdx[]',
  'salaryMin(-1)', 'salaryMax(-1)', 'salaryCurrency', 'firstSeenDay', 'alsoOnCount',
] as const;

export interface DatasetDetail {
  description: string;
  applyUrl: string | null;
  department: string | null;
  employmentType: string | null;
  salary: { min: number | null; max: number | null; currency: string | null } | null;
  visa: { types: string[]; evidence: string[]; register: string | null; requiresAuthorizationIn: string[] };
  analysis: { requiredSkills: string[]; preferredSkills: string[]; atsKeywords: string[]; seniority: string; minYears: number | null; maxYears: number | null };
  ats: string | null;
  alsoOn: Array<{ source: string; url: string }>;
}

export function buildDataset(result: HarvestResult, opts: { maxDescription?: number } = {}) {
  const companies: string[] = [];
  const cIdx = new Map<string, number>();
  const sources: string[] = [];
  const sIdx = new Map<string, number>();
  const skills: string[] = [];
  const kIdx = new Map<string, number>();
  const idx = <T>(map: Map<T, number>, arr: T[], v: T) => {
    let i = map.get(v);
    if (i === undefined) {
      i = arr.length;
      arr.push(v);
      map.set(v, i);
    }
    return i;
  };

  const jobs = [...result.jobs].sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));
  const rows: DatasetIndex['rows'] = [];
  const shards = new Map<string, Record<string, DatasetDetail>>();
  const countryCounts = new Map<string, number>();

  for (const j of jobs) {
    for (const c of j.countries) countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1);
    rows.push([
      j.id,
      j.title.slice(0, 160),
      idx(cIdx, companies, j.company.trim().slice(0, 80)),
      (j.location ?? '').slice(0, 120),
      j.countries.join(','),
      j.regions.join(','),
      SCOPE_CODES[String(j.remoteScope) as keyof typeof SCOPE_CODES] ?? 0,
      MODE_CODES[String(j.workMode) as keyof typeof MODE_CODES] ?? 0,
      VISA_CODES[j.visa.status],
      j.visa.confidence,
      j.analysis.requiredSkills.map((s) => idx(kIdx, skills, s)),
      j.postedAt ? Math.floor(Date.parse(j.postedAt) / 86_400_000) : 0,
      idx(sIdx, sources, j.source),
      j.url,
      j.visa.relocation ? 1 : 0,
      j.analysis.minYearsExperience ?? -1,
      j.analysis.preferredSkills.map((s) => idx(kIdx, skills, s)),
      j.salaryMin ? Math.round(j.salaryMin) : -1,
      j.salaryMax ? Math.round(j.salaryMax) : -1,
      j.salaryMin || j.salaryMax ? (j.salaryCurrency ?? '') : '',
      j.firstSeenDay ?? Math.floor(Date.now() / 86_400_000),
      j.alsoOn?.length ?? 0,
    ]);
    const shard = j.id.slice(0, 2);
    const bucket = shards.get(shard) ?? {};
    bucket[j.id] = toDetail(j, opts.maxDescription ?? 6000);
    shards.set(shard, bucket);
  }

  const index: DatasetIndex = { v: 1, companies, sources, skills, rows };
  const meta = {
    generatedAt: result.finishedAt,
    totalJobs: rows.length,
    companies: companies.length,
    boards: result.boards,
    sources: result.stats,
    sponsorRegisters: result.sponsors,
    countries: [...countryCounts.entries()].map(([code, count]) => ({ code, name: countryName(code), count })).sort((a, b) => b.count - a.count),
    columns: INDEX_COLUMNS,
  };
  return { meta, index, shards };
}

function toDetail(j: EnrichedJob, maxDescription: number): DatasetDetail {
  return {
    description: j.description.length > maxDescription ? `${j.description.slice(0, maxDescription)}…` : j.description,
    applyUrl: j.applyUrl ?? null,
    department: j.department ?? null,
    employmentType: j.employmentType ?? null,
    salary: j.salaryMin || j.salaryMax ? { min: j.salaryMin ?? null, max: j.salaryMax ?? null, currency: j.salaryCurrency ?? null } : null,
    visa: { types: j.visa.visaTypes, evidence: j.visa.evidence, register: j.visa.sponsorRegister, requiresAuthorizationIn: j.visa.requiresAuthorizationIn },
    analysis: {
      requiredSkills: j.analysis.requiredSkills,
      preferredSkills: j.analysis.preferredSkills,
      atsKeywords: j.analysis.atsKeywords,
      seniority: j.analysis.seniority,
      minYears: j.analysis.minYearsExperience ?? null,
      maxYears: j.analysis.maxYearsExperience ?? null,
    },
    ats: j.ats ?? null,
    alsoOn: j.alsoOn ?? [],
  };
}
