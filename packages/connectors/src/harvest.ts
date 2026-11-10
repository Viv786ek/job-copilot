import { fetchCompanyBoard } from './ats';
import { dedupe, enrichJob, type EnrichedJob } from './enrich';
import { FEED_CONNECTORS } from './feeds';
import { mockFeed } from './mock';
import { pool } from './http';
import { loadSponsorRegisters, type SponsorRegisters } from './sponsors';
import type { CompanyBoard, FeedQuery, RawJob } from './types';

export interface SourceStat {
  source: string;
  ok: boolean;
  jobs: number;
  error?: string;
  skipped?: string;
}

export interface HarvestResult {
  jobs: EnrichedJob[];
  stats: SourceStat[];
  boards: { total: number; ok: number; failed: number };
  sponsors: Record<string, number>;
  startedAt: string;
  finishedAt: string;
}

export interface HarvestOptions {
  boards: CompanyBoard[];
  env?: NodeJS.ProcessEnv;
  feedQuery?: FeedQuery;
  /** Drop postings older than this many days (postings without a date are kept). */
  maxAgeDays?: number;
  maxPerCompany?: number;
  concurrency?: number;
  registers?: SponsorRegisters | null;
  /** id → epoch day first seen, carried between harvests for freshness. */
  firstSeen?: Map<string, number>;
  log?: (m: string) => void;
}

/** Runs every board and feed connector, enriches, de-duplicates. Never throws for a single source failure. */
export async function harvest(opts: HarvestOptions): Promise<HarvestResult> {
  const env = opts.env ?? process.env;
  const log = opts.log ?? (() => undefined);
  const startedAt = new Date().toISOString();
  const cutoff = Date.now() - (opts.maxAgeDays ?? 60) * 86_400_000;
  const stats: SourceStat[] = [];

  const mock = env.JOB_SOURCES_MODE === 'mock';
  // Mock mode: offline, deterministic (tests/dev). Never touches the network.
  const registers = mock ? null : opts.registers === undefined ? await loadSponsorRegisters(log) : opts.registers;
  if (registers) log(`sponsor registers: ${JSON.stringify(registers.counts)}`);

  const raw: RawJob[] = [];

  // Company boards (official ATS APIs)
  const perAts = new Map<string, number>();
  const boardRun = await pool(mock ? [] : opts.boards, opts.concurrency ?? 16, async (b) => {
    const jobs = (await fetchCompanyBoard(b)).slice(0, opts.maxPerCompany ?? 400);
    raw.push(...jobs);
    perAts.set(b.ats, (perAts.get(b.ats) ?? 0) + jobs.length);
    return jobs.length;
  });
  for (const [ats, n] of perAts) stats.push({ source: ats.toUpperCase(), ok: true, jobs: n });
  log(`boards: ${boardRun.results.length} ok, ${boardRun.errors.length} failed`);

  // Feeds (boards, RSS, keyed aggregators)
  for (const c of mock ? [mockFeed] : FEED_CONNECTORS) {
    if (!c.enabled(env)) {
      stats.push({ source: c.source, ok: false, jobs: 0, skipped: `needs ${c.requires?.join(', ')}` });
      continue;
    }
    try {
      const jobs = await c.fetchAll(env, opts.feedQuery);
      raw.push(...jobs);
      stats.push({ source: c.source, ok: true, jobs: jobs.length });
      log(`${c.source}: ${jobs.length}`);
    } catch (e) {
      stats.push({ source: c.source, ok: false, jobs: 0, error: (e as Error).message.slice(0, 200) });
      log(`${c.source} failed: ${(e as Error).message}`);
    }
  }

  const fresh = raw.filter((j) => j.title && j.url && (!j.postedAt || Date.parse(j.postedAt) >= cutoff));
  const enriched = fresh.map((j) => enrichJob(j, registers));
  const jobs = dedupe(enriched).map((j) => ({ ...j, firstSeenDay: opts.firstSeen?.get(j.id) ?? Math.floor(Date.now() / 86_400_000) }));
  log(`harvest: ${raw.length} raw → ${fresh.length} fresh → ${jobs.length} unique`);

  return {
    jobs,
    stats,
    boards: { total: opts.boards.length, ok: boardRun.results.length, failed: boardRun.errors.length },
    sponsors: registers?.counts ?? {},
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
