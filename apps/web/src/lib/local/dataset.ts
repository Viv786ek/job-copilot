/**
 * Loads the harvested job dataset published alongside the site (see packages/connectors/src/dataset.ts):
 * a compact index of every job, plus on-demand detail shards.
 */
import { BASE_PATH } from '../session';

export type VisaStatus = 'UNKNOWN' | 'LIKELY' | 'SPONSORS' | 'NO_SPONSORSHIP';
export type RemoteScope = 'GLOBAL' | 'REGION' | 'COUNTRY' | null;
export type WorkMode = 'REMOTE' | 'HYBRID' | 'ONSITE' | null;

export interface IndexedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  countries: string[];
  regions: string[];
  remoteScope: RemoteScope;
  workMode: WorkMode;
  visaStatus: VisaStatus;
  visaConfidence: number;
  requiredSkills: string[];
  preferredSkills: string[];
  postedAt: string | null;
  source: string;
  url: string;
  relocation: boolean;
  minYears: number | null;
}

export interface JobDetail {
  description: string;
  applyUrl: string | null;
  department: string | null;
  employmentType: string | null;
  salary: { min: number | null; max: number | null; currency: string | null } | null;
  visa: { types: string[]; evidence: string[]; register: string | null; requiresAuthorizationIn: string[] };
  analysis: { requiredSkills: string[]; preferredSkills: string[]; atsKeywords: string[]; seniority: string; minYears: number | null; maxYears: number | null };
  ats: string | null;
}

export interface DatasetMeta {
  generatedAt: string;
  totalJobs: number;
  companies: number;
  boards: { total: number; ok: number; failed: number };
  sources: Array<{ source: string; ok: boolean; jobs: number; error?: string; skipped?: string }>;
  sponsorRegisters: Record<string, number>;
  countries: Array<{ code: string; name: string; count: number }>;
}

const VISA: VisaStatus[] = ['UNKNOWN', 'LIKELY', 'SPONSORS', 'NO_SPONSORSHIP'];
const SCOPE: RemoteScope[] = [null, 'GLOBAL', 'REGION', 'COUNTRY'];
const MODE: WorkMode[] = [null, 'REMOTE', 'HYBRID', 'ONSITE'];

type Row = [string, string, number, string, string, string, number, number, number, number, number[], number, number, string, number, number, number[]];

let indexPromise: Promise<{ meta: DatasetMeta; jobs: IndexedJob[]; byId: Map<string, IndexedJob> }> | null = null;
const shardCache = new Map<string, Promise<Record<string, JobDetail>>>();

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_PATH}/data/${path}`, { cache: 'default' });
  if (!res.ok) throw new Error(`Job dataset unavailable (${res.status}). The harvester may not have run yet.`);
  return res.json() as Promise<T>;
}

export function loadIndex() {
  indexPromise ??= (async () => {
    const [meta, index] = await Promise.all([
      getJson<DatasetMeta>('meta.json'),
      getJson<{ companies: string[]; sources: string[]; skills: string[]; rows: Row[] }>('index.json'),
    ]);
    const jobs = index.rows.map(
      (r): IndexedJob => ({
        id: r[0],
        title: r[1],
        company: index.companies[r[2]],
        location: r[3],
        countries: r[4] ? r[4].split(',') : [],
        regions: r[5] ? r[5].split(',') : [],
        remoteScope: SCOPE[r[6]] ?? null,
        workMode: MODE[r[7]] ?? null,
        visaStatus: VISA[r[8]] ?? 'UNKNOWN',
        visaConfidence: r[9],
        requiredSkills: r[10].map((i) => index.skills[i]),
        postedAt: r[11] ? new Date(r[11] * 86_400_000).toISOString() : null,
        source: index.sources[r[12]],
        url: r[13],
        relocation: r[14] === 1,
        minYears: r[15] >= 0 ? r[15] : null,
        preferredSkills: (r[16] ?? []).map((i) => index.skills[i]),
      }),
    );
    return { meta, jobs, byId: new Map(jobs.map((j) => [j.id, j])) };
  })();
  indexPromise.catch(() => (indexPromise = null));
  return indexPromise;
}

export async function loadDetail(id: string): Promise<JobDetail | null> {
  const shard = id.slice(0, 2);
  let p = shardCache.get(shard);
  if (!p) {
    p = getJson<Record<string, JobDetail>>(`jobs/${shard}.json`);
    shardCache.set(shard, p);
    p.catch(() => shardCache.delete(shard));
  }
  return (await p)[id] ?? null;
}
