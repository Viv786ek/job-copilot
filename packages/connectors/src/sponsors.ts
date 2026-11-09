/**
 * Official immigration sponsor registers, refreshed from the government sources on each harvest:
 *  - UK Home Office "Register of licensed sponsors: workers" (CSV, Skilled Worker route)
 *  - Netherlands IND "Public register of recognised sponsors" (regular labour & highly skilled migrants)
 */
import { normalizeCompanyName } from '@copilot/shared';
import { getText } from './http';

export interface SponsorRegisters {
  /** normalized company name -> register label */
  byName: Map<string, string>;
  counts: Record<string, number>;
  fetchedAt: string;
}

export const UK_LABEL = 'UK Home Office register of licensed sponsors';
export const NL_LABEL = 'Netherlands IND register of recognised sponsors';

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export async function fetchUkSponsors(): Promise<string[]> {
  const page = await getText('https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers', { accept: 'text/html' });
  const csvUrl = /https:\/\/assets\.publishing\.service\.gov\.uk\/[^"]+\.csv/.exec(page)?.[0];
  if (!csvUrl) throw new Error('UK sponsor register CSV link not found');
  const csv = await getText(csvUrl, { accept: 'text/csv' });
  const lines = csv.split(/\r?\n/);
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const nameIdx = header.findIndex((h) => h.includes('organisation'));
  const routeIdx = header.findIndex((h) => h.includes('route'));
  const names = new Set<string>();
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (routeIdx >= 0 && !/skilled worker|global business mobility|scale-up/i.test(cols[routeIdx] ?? '')) continue;
    if (cols[nameIdx]) names.add(cols[nameIdx]);
  }
  return [...names];
}

export async function fetchNlSponsors(): Promise<string[]> {
  const html = await getText('https://ind.nl/en/public-register-recognised-sponsors/public-register-regular-labour-and-highly-skilled-migrants', {
    accept: 'text/html',
  });
  const names: string[] = [];
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const cell = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/.exec(row)?.[1];
    const name = cell?.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
    if (name && !/^organisation/i.test(name)) names.push(name);
  }
  return names;
}

export async function loadSponsorRegisters(log: (m: string) => void = () => undefined): Promise<SponsorRegisters> {
  const byName = new Map<string, string>();
  const counts: Record<string, number> = {};
  for (const [label, loader] of [
    [UK_LABEL, fetchUkSponsors],
    [NL_LABEL, fetchNlSponsors],
  ] as const) {
    try {
      const names = await loader();
      counts[label] = names.length;
      for (const n of names) {
        const key = normalizeCompanyName(n);
        if (key.length >= 3 && !byName.has(key)) byName.set(key, label);
      }
    } catch (e) {
      log(`sponsor register failed (${label}): ${(e as Error).message}`);
      counts[label] = 0;
    }
  }
  return { byName, counts, fetchedAt: new Date().toISOString() };
}

/** Register applies only if the job is in that register's country. */
export function sponsorFor(regs: SponsorRegisters | null, company: string, jobCountries: string[]): string | null {
  if (!regs) return null;
  const label = regs.byName.get(normalizeCompanyName(company));
  if (!label) return null;
  if (label === UK_LABEL && (jobCountries.includes('GB') || !jobCountries.length)) return label;
  if (label === NL_LABEL && (jobCountries.includes('NL') || !jobCountries.length)) return label;
  return null;
}
