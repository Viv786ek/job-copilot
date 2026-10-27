import { createHash } from 'crypto';
import { convert } from 'html-to-text';
import type { JobSource, WorkMode } from '@copilot/shared';

/** Normalized job shape every connector must emit. */
export interface RawJob {
  source: JobSource;
  externalId: string;
  url: string;
  title: string;
  companyName: string;
  location?: string | null;
  country?: string | null;
  workMode?: WorkMode | null;
  employmentType?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  visaSponsorship?: boolean | null;
  description: string;
  postedAt?: Date | null;
}

export interface SearchQuery {
  query: string;
  location?: string;
  remote?: boolean;
  /** ISO-3166 alpha-2, lowercase (e.g. "in", "us", "gb"). */
  country?: string;
  limit?: number;
}

export interface JobConnector {
  readonly source: JobSource;
  isEnabled(): boolean;
  search(q: SearchQuery): Promise<RawJob[]>;
}

export const JOB_CONNECTORS = Symbol('JOB_CONNECTORS');

export const USER_AGENT = 'VPJobCopilotBot/1.0 (+https://github.com/your-org/vp-ai-job-copilot)';

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function htmlToText(html: string): string {
  return convert(html ?? '', {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
    ],
  })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function descriptionHash(text: string): string {
  return createHash('sha256').update(text.toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex');
}

export function detectWorkMode(...texts: Array<string | null | undefined>): WorkMode | null {
  const t = texts.filter(Boolean).join(' ').toLowerCase();
  if (/\bhybrid\b/.test(t)) return 'HYBRID';
  if (/\b(remote|work from home|wfh|anywhere)\b/.test(t)) return 'REMOTE';
  if (/\b(on-?site|in office|work from office|wfo)\b/.test(t)) return 'ONSITE';
  return null;
}

export function detectVisa(text: string): boolean | null {
  const t = text.toLowerCase();
  if (/(no|not|unable to|cannot|can't|do not)\s+(offer|provide|sponsor)[^.]{0,30}(visa|sponsorship)/.test(t)) return false;
  if (/(visa sponsorship (is )?(available|provided|offered)|we (will )?sponsor|sponsorship available|h-?1b sponsorship)/.test(t)) return true;
  return null;
}

export function matchesQuery(title: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const t = title.toLowerCase();
  return words.length === 0 || words.some((w) => t.includes(w));
}
