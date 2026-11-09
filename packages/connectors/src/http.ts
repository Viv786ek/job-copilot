import { convert } from 'html-to-text';

export const USER_AGENT = 'JobCopilotBot/1.0 (+https://github.com/Viv786ek/job-copilot)';

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

/** Per-host politeness: at most N concurrent requests to the same host. */
const hostSlots = new Map<string, { active: number; queue: Array<() => void> }>();
const MAX_PER_HOST = 4;

async function withHostSlot<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const host = new URL(url).host;
  const slot = hostSlots.get(host) ?? { active: 0, queue: [] };
  hostSlots.set(host, slot);
  if (slot.active >= MAX_PER_HOST) await new Promise<void>((r) => slot.queue.push(r));
  slot.active++;
  try {
    return await fn();
  } finally {
    slot.active--;
    slot.queue.shift()?.();
  }
}

export async function http(
  url: string,
  opts: { headers?: Record<string, string>; method?: string; body?: string; timeoutMs?: number; retries?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await withHostSlot(url, () =>
        fetch(url, {
          method: opts.method ?? 'GET',
          body: opts.body,
          headers: { 'user-agent': USER_AGENT, accept: 'application/json, text/xml, application/xml, text/html;q=0.8, */*;q=0.5', ...opts.headers },
          signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
          redirect: 'follow',
        }),
      );
      if (res.status === 429 || res.status >= 500) {
        lastErr = new HttpError(res.status, url);
        const wait = Number(res.headers.get('retry-after')) * 1000 || 1500 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, Math.min(wait, 20_000)));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastErr;
}

export async function getJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const res = await http(url, { headers });
  if (!res.ok) throw new HttpError(res.status, url);
  return (await res.json()) as T;
}

export async function getText(url: string, headers?: Record<string, string>): Promise<string> {
  const res = await http(url, { headers });
  if (!res.ok) throw new HttpError(res.status, url);
  return res.text();
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  const src = /&lt;\w/.test(html) ? decodeEntities(html) : html;
  return convert(src, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
      { selector: 'h1', options: { uppercase: false } },
      { selector: 'h2', options: { uppercase: false } },
      { selector: 'h3', options: { uppercase: false } },
    ],
  })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function toIso(v: unknown): string | null {
  if (v == null || v === '') return null;
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Runs `fn` over items with bounded concurrency, never rejecting; failures are collected. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<{ results: R[]; errors: Array<{ item: T; error: string }> }> {
  const results: R[] = [];
  const errors: Array<{ item: T; error: string }> = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const item = items[i++];
        try {
          results.push(await fn(item));
        } catch (e) {
          errors.push({ item, error: (e as Error).message });
        }
      }
    }),
  );
  return { results, errors };
}
