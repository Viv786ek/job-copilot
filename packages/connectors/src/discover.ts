/**
 * Company discovery: turns company names/websites into verified ATS job boards.
 * Inputs: the public Y Combinator hiring dataset (yc-oss), a curated list of product companies,
 * and anything users add. Every board is verified live against the ATS API before it is kept.
 */
import { BOARD_CONNECTORS } from './ats';
import { getJson, pool } from './http';
import type { AtsType, CompanyBoard } from './types';

export interface CompanyCandidate {
  name: string;
  website?: string | null;
  slugs?: string[];
  origin: string;
  /** Restrict probing to these ATSs (faster). Defaults to all. */
  ats?: AtsType[];
}

const slugify = (s: string, sep = '') =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^${sep}|${sep}$`, 'g'), '');

export function slugCandidates(c: CompanyCandidate): string[] {
  const out = new Set<string>(c.slugs ?? []);
  out.add(slugify(c.name));
  out.add(slugify(c.name, '-'));
  if (c.website) {
    try {
      const host = new URL(c.website.startsWith('http') ? c.website : `https://${c.website}`).hostname.replace(/^www\./, '');
      out.add(host.split('.')[0]);
    } catch {
      /* bad website */
    }
  }
  return [...out].filter((s) => s.length >= 2 && s.length <= 60);
}

export async function loadYcHiring(): Promise<CompanyCandidate[]> {
  const list = await getJson<Array<{ name: string; slug: string; website?: string; isHiring?: boolean; status?: string }>>(
    'https://yc-oss.github.io/api/companies/hiring.json',
  );
  return list
    .filter((c) => c.isHiring !== false && c.status !== 'Inactive')
    .map((c) => ({ name: c.name, website: c.website ?? null, slugs: [c.slug], origin: 'yc', ats: ['ashby', 'greenhouse', 'lever', 'workable'] as AtsType[] }));
}

const ORDER: AtsType[] = ['greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'recruitee', 'personio'];

/** Probes candidates; first ATS+slug with ≥1 open job wins. */
export async function discoverBoards(
  candidates: CompanyCandidate[],
  opts: { concurrency?: number; log?: (m: string) => void } = {},
): Promise<Array<CompanyBoard & { openJobs: number }>> {
  const found: Array<CompanyBoard & { openJobs: number }> = [];
  let done = 0;
  await pool(candidates, opts.concurrency ?? 24, async (c) => {
    const slugs = slugCandidates(c);
    outer: for (const ats of (c.ats ?? ORDER)) {
      for (const slug of slugs) {
        const n = await BOARD_CONNECTORS[ats].probe(slug);
        if (n && n > 0) {
          found.push({ name: c.name, ats, slug, website: c.website ?? null, origin: c.origin, openJobs: n });
          break outer;
        }
      }
    }
    if (++done % 100 === 0) opts.log?.(`discovery: ${done}/${candidates.length} probed, ${found.length} boards found`);
  });
  return found.sort((a, b) => a.name.localeCompare(b.name));
}
