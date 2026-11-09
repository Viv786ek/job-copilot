/**
 * Career pages that are not on a supported ATS API. Three tiers, cheapest first:
 *   1. schema.org JobPosting JSON-LD in the page HTML (published by most career sites for Google Jobs)
 *   2. Firecrawl structured extraction (FIRECRAWL_API_KEY; free tier available)
 *   3. Headless Chromium via playwright-core (PLAYWRIGHT_ENABLED=true) for JS-rendered pages,
 *      then tier 1 again on the rendered DOM
 * Only public pages are fetched; nothing logs in or bypasses bot protection.
 */
import { createHash } from 'crypto';
import { isIP } from 'net';
import { detectAtsFromUrl, fetchCompanyBoard } from './ats';
import { decodeEntities, htmlToText, http, toIso } from './http';
import type { RawJob, SourceId } from './types';

export function assertPublicUrl(raw: string): URL {
  const u = new URL(raw);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http(s) URLs are supported');
  const h = u.hostname.toLowerCase();
  const blocked =
    h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') ||
    (isIP(h) !== 0 && /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1$|f[cd]|fe80)/i.test(h));
  if (blocked) throw new Error('Private or local addresses are not allowed');
  return u;
}

const SOURCE_BY_HOST: Array<[RegExp, SourceId]> = [
  [/greenhouse\.io$/, 'GREENHOUSE'],
  [/lever\.co$/, 'LEVER'],
  [/ashbyhq\.com$/, 'ASHBY'],
  [/workable\.com$/, 'WORKABLE'],
  [/smartrecruiters\.com$/, 'SMARTRECRUITERS'],
  [/recruitee\.com$/, 'RECRUITEE'],
  [/personio\.(de|com)$/, 'PERSONIO'],
];

function sourceFor(url: URL): SourceId {
  return SOURCE_BY_HOST.find(([re]) => re.test(url.hostname))?.[1] ?? 'CAREER_PAGE';
}

const id = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 20);

/** All JobPosting objects in a page's JSON-LD blocks (handles arrays and @graph). */
export function extractJsonLdPostings(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const json = JSON.parse(m[1].trim());
      const nodes = (Array.isArray(json) ? json : [json]).flatMap((n: any) => (n?.['@graph'] ? n['@graph'] : [n]));
      for (const n of nodes) {
        const type = n?.['@type'];
        if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) out.push(n);
        if (n?.['@type'] === 'ItemList') for (const it of n.itemListElement ?? []) if (it?.item?.['@type'] === 'JobPosting') out.push(it.item);
      }
    } catch {
      /* malformed block */
    }
  }
  return out;
}

export function postingToRawJob(p: any, pageUrl: string, source: SourceId = 'CAREER_PAGE'): RawJob {
  const locs = (Array.isArray(p.jobLocation) ? p.jobLocation : [p.jobLocation]).filter(Boolean);
  const location = locs
    .map((l: any) => {
      const a = l.address ?? {};
      const country = typeof a.addressCountry === 'string' ? a.addressCountry : a.addressCountry?.name;
      return [a.addressLocality, a.addressRegion, country].filter((x) => typeof x === 'string' && x).join(', ');
    })
    .filter(Boolean)
    .join(' | ');
  const remote = p.jobLocationType === 'TELECOMMUTE';
  const salary = p.baseSalary?.value ?? {};
  const url = p.url || pageUrl;
  return {
    source,
    externalId: p.identifier?.value ? String(p.identifier.value) : id(`${url}|${p.title}`),
    url,
    applyUrl: p.directApply ? url : p.url ?? url,
    title: decodeEntities(String(p.title ?? 'Untitled role')),
    company: String(p.hiringOrganization?.name ?? new URL(pageUrl).hostname.replace(/^(www|careers|jobs)\./, '')),
    companyDomain: p.hiringOrganization?.sameAs ?? null,
    location: [remote ? 'Remote' : '', location, p.applicantLocationRequirements?.name].filter(Boolean).join(' | ') || null,
    remoteHint: remote,
    employmentType: Array.isArray(p.employmentType) ? p.employmentType.join(', ') : p.employmentType ?? null,
    salaryMin: typeof salary.minValue === 'number' ? salary.minValue : null,
    salaryMax: typeof salary.maxValue === 'number' ? salary.maxValue : null,
    salaryCurrency: p.baseSalary?.currency ?? null,
    description: htmlToText(String(p.description ?? '')),
    postedAt: toIso(p.datePosted),
  };
}

// ---------------- Firecrawl ----------------
const FIRECRAWL_SCHEMA = {
  type: 'object',
  properties: {
    company: { type: 'string' },
    jobs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          location: { type: 'string' },
          department: { type: 'string' },
          employmentType: { type: 'string' },
          remote: { type: 'boolean' },
          description: { type: 'string' },
          postedAt: { type: 'string' },
        },
        required: ['title'],
      },
    },
  },
  required: ['jobs'],
};

export async function firecrawlExtract(url: string, apiKey: string): Promise<RawJob[]> {
  const res = await http('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    timeoutMs: 120_000,
    retries: 1,
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      url,
      onlyMainContent: true,
      formats: [
        {
          type: 'json',
          schema: FIRECRAWL_SCHEMA,
          prompt:
            'Extract every open job listed on this careers page. Use absolute URLs for each job. Include the location text exactly as shown. Only include real open positions.',
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { data?: { json?: any } & Record<string, any> };
  const data = body.data?.json ?? body.data ?? {};
  const base = new URL(url);
  return (data.jobs ?? []).map(
    (j: any): RawJob => {
      const jobUrl = j.url ? new URL(j.url, base).toString() : url;
      return {
        source: 'FIRECRAWL',
        externalId: id(`${jobUrl}|${j.title}`),
        url: jobUrl,
        applyUrl: jobUrl,
        title: String(j.title),
        company: data.company || base.hostname.replace(/^(www|careers|jobs)\./, ''),
        location: j.location ?? null,
        remoteHint: j.remote ?? null,
        employmentType: j.employmentType ?? null,
        department: j.department ?? null,
        description: String(j.description ?? ''),
        postedAt: toIso(j.postedAt),
      };
    },
  );
}

// ---------------- Playwright (optional) ----------------
async function renderWithPlaywright(url: string): Promise<string | null> {
  let chromium: any;
  try {
    // Optional dependency; resolved only when the operator enables it.
    chromium = (await import('playwright-core' as string)).chromium;
  } catch {
    return null;
  }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (compatible; JobCopilotBot/1.0)' });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
    return await page.content();
  } finally {
    await browser.close();
  }
}

export interface CareerPageResult {
  method: 'ats-api' | 'json-ld' | 'firecrawl' | 'playwright+json-ld' | 'none';
  jobs: RawJob[];
  ats?: { ats: string; slug: string } | null;
}

/** Fetches every job a public careers page (or single job page) exposes, using the cheapest working tier. */
export async function crawlCareerPage(rawUrl: string, env: NodeJS.ProcessEnv = process.env, html?: string): Promise<CareerPageResult> {
  const url = assertPublicUrl(rawUrl);

  const ats = detectAtsFromUrl(url.toString());
  if (ats && !html) {
    const jobs = await fetchCompanyBoard({ name: ats.slug, ats: ats.ats, slug: ats.slug });
    if (jobs.length) return { method: 'ats-api', jobs, ats };
  }

  const page = html ?? (await http(url.toString(), { headers: { accept: 'text/html' }, timeoutMs: 20_000 }).then((r) => (r.ok ? r.text() : '')).catch(() => ''));
  // Many careers sites embed an ATS iframe/link; follow it to the official API.
  const embedded = /(boards\.greenhouse\.io\/(?:embed\/job_board\?for=)?[\w-]+|jobs\.lever\.co\/[\w-]+|jobs\.ashbyhq\.com\/[\w-]+|apply\.workable\.com\/[\w-]+|[\w-]+\.recruitee\.com|[\w-]+\.jobs\.personio\.de)/i.exec(page)?.[0];
  if (embedded && !ats) {
    const found = detectAtsFromUrl(`https://${embedded}`);
    if (found) {
      const jobs = await fetchCompanyBoard({ name: url.hostname, ats: found.ats, slug: found.slug }).catch(() => []);
      if (jobs.length) return { method: 'ats-api', jobs, ats: found };
    }
  }

  const ld = extractJsonLdPostings(page);
  if (ld.length) return { method: 'json-ld', jobs: ld.map((p) => postingToRawJob(p, url.toString(), sourceFor(url))) };

  if (env.FIRECRAWL_API_KEY) {
    const jobs = await firecrawlExtract(url.toString(), env.FIRECRAWL_API_KEY);
    if (jobs.length) return { method: 'firecrawl', jobs };
  }

  if (env.PLAYWRIGHT_ENABLED === 'true') {
    const rendered = await renderWithPlaywright(url.toString());
    const postings = rendered ? extractJsonLdPostings(rendered) : [];
    if (postings.length) return { method: 'playwright+json-ld', jobs: postings.map((p) => postingToRawJob(p, url.toString(), sourceFor(url))) };
  }
  return { method: 'none', jobs: [] };
}
