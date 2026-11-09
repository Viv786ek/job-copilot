/**
 * Job boards and aggregators.
 *  - Free, keyless: Remotive, RemoteOK, We Work Remotely (RSS), Himalayas, Jobicy, Arbeitnow, Working Nomads.
 *  - Free with a registered key: Adzuna, Jooble, Reed, USAJobs. They activate automatically when
 *    their environment variables are present and are skipped (not faked) otherwise.
 */
import { decodeEntities, getJson, getText, htmlToText, http, toIso } from './http';
import type { FeedConnector, FeedQuery, RawJob } from './types';

const DEFAULT_KEYWORDS = ['software engineer', 'developer', 'data', 'machine learning', 'product', 'devops', 'designer', 'analyst'];

// ---------------- Remotive ----------------
export const remotive: FeedConnector = {
  source: 'REMOTIVE',
  enabled: () => true,
  async fetchAll() {
    const d = await getJson<{ jobs: Array<Record<string, any>> }>('https://remotive.com/api/remote-jobs');
    return d.jobs.map((j): RawJob => ({
      source: 'REMOTIVE',
      externalId: String(j.id),
      url: j.url,
      applyUrl: j.url,
      title: j.title,
      company: j.company_name,
      location: j.candidate_required_location ? `Remote (${j.candidate_required_location})` : 'Remote',
      remoteHint: true,
      employmentType: j.job_type ?? null,
      department: j.category ?? null,
      description: htmlToText(j.description),
      postedAt: toIso(j.publication_date),
    }));
  },
};

// ---------------- RemoteOK (terms: link back to the original posting; we keep `url`) ----------------
export const remoteok: FeedConnector = {
  source: 'REMOTEOK',
  enabled: () => true,
  async fetchAll() {
    const d = await getJson<Array<Record<string, any>>>('https://remoteok.com/api');
    return d
      .filter((j) => j && j.id && j.position)
      .map((j): RawJob => ({
        source: 'REMOTEOK',
        externalId: String(j.id),
        url: j.url,
        applyUrl: j.apply_url || j.url,
        title: j.position,
        company: j.company,
        location: j.location ? `Remote (${j.location})` : 'Remote',
        remoteHint: true,
        salaryMin: j.salary_min || null,
        salaryMax: j.salary_max || null,
        salaryCurrency: j.salary_min ? 'USD' : null,
        description: htmlToText(j.description),
        postedAt: toIso(j.date ?? j.epoch),
      }));
  },
};

// ---------------- We Work Remotely (official RSS feeds) ----------------
const WWR_FEEDS = [
  'remote-programming-jobs',
  'remote-full-stack-programming-jobs',
  'remote-back-end-programming-jobs',
  'remote-front-end-programming-jobs',
  'remote-devops-sysadmin-jobs',
  'remote-design-jobs',
  'remote-product-jobs',
  'remote-management-and-finance-jobs',
  'remote-customer-support-jobs',
  'remote-sales-and-marketing-jobs',
];
const rssTag = (xml: string, name: string) => {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? m[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '').trim() : '';
};
export const weworkremotely: FeedConnector = {
  source: 'WEWORKREMOTELY',
  enabled: () => true,
  async fetchAll() {
    const out: RawJob[] = [];
    for (const feed of WWR_FEEDS) {
      const xml = await getText(`https://weworkremotely.com/categories/${feed}.rss`).catch(() => '');
      for (const item of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
        const rawTitle = decodeEntities(rssTag(item, 'title'));
        const [company, ...rest] = rawTitle.split(':');
        const link = rssTag(item, 'link') || rssTag(item, 'guid');
        out.push({
          source: 'WEWORKREMOTELY',
          externalId: link,
          url: link,
          applyUrl: link,
          title: rest.join(':').trim() || rawTitle,
          company: company.trim(),
          location: `Remote (${decodeEntities(rssTag(item, 'region')) || 'Anywhere'})`,
          remoteHint: true,
          employmentType: rssTag(item, 'type') || null,
          department: rssTag(item, 'category') || null,
          description: htmlToText(decodeEntities(rssTag(item, 'description'))),
          postedAt: toIso(rssTag(item, 'pubDate')),
        });
      }
    }
    return out;
  },
};

// ---------------- Himalayas ----------------
export const himalayas: FeedConnector = {
  source: 'HIMALAYAS',
  enabled: () => true,
  async fetchAll(_env, q) {
    const out: RawJob[] = [];
    const max = q?.limit ?? 2000;
    for (let offset = 0; offset < max; offset += 20) {
      const d = await getJson<{ jobs: Array<Record<string, any>>; totalCount?: number }>(`https://himalayas.app/jobs/api?limit=20&offset=${offset}`);
      for (const j of d.jobs) {
        const restrictions: string[] = j.locationRestrictions ?? [];
        out.push({
          source: 'HIMALAYAS',
          externalId: j.guid ?? j.applicationLink,
          url: j.applicationLink ?? j.guid,
          applyUrl: j.applicationLink ?? null,
          title: j.title,
          company: j.companyName,
          location: restrictions.length ? `Remote (${restrictions.join(', ')})` : 'Remote (Worldwide)',
          remoteHint: true,
          employmentType: j.employmentType ?? null,
          salaryMin: j.minSalary ?? null,
          salaryMax: j.maxSalary ?? null,
          salaryCurrency: j.currency ?? null,
          description: htmlToText(j.description),
          postedAt: toIso(j.pubDate),
        });
      }
      if (!d.jobs.length || (d.totalCount && offset + 20 >= d.totalCount)) break;
    }
    return out;
  },
};

// ---------------- Jobicy ----------------
export const jobicy: FeedConnector = {
  source: 'JOBICY',
  enabled: () => true,
  async fetchAll() {
    const d = await getJson<{ jobs: Array<Record<string, any>> }>('https://jobicy.com/api/v2/remote-jobs?count=100');
    return d.jobs.map((j): RawJob => ({
      source: 'JOBICY',
      externalId: String(j.id),
      url: j.url,
      applyUrl: j.url,
      title: decodeEntities(j.jobTitle),
      company: j.companyName,
      location: `Remote (${j.jobGeo || 'Anywhere'})`,
      remoteHint: true,
      employmentType: Array.isArray(j.jobType) ? j.jobType.join(', ') : j.jobType ?? null,
      department: Array.isArray(j.jobIndustry) ? j.jobIndustry[0] : null,
      salaryMin: j.salaryMin ?? null,
      salaryMax: j.salaryMax ?? null,
      salaryCurrency: j.salaryCurrency ?? null,
      description: htmlToText(j.jobDescription),
      postedAt: toIso(j.pubDate),
    }));
  },
};

// ---------------- Arbeitnow (Germany / EU, many English-speaking & visa-friendly roles) ----------------
export const arbeitnow: FeedConnector = {
  source: 'ARBEITNOW',
  enabled: () => true,
  async fetchAll(_env, q) {
    const out: RawJob[] = [];
    const pages = Math.ceil((q?.limit ?? 1500) / 100);
    for (let page = 1; page <= pages; page++) {
      const d = await getJson<{ data: Array<Record<string, any>>; links?: { next?: string | null } }>(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
      for (const j of d.data) {
        const tags: string[] = j.tags ?? [];
        out.push({
          source: 'ARBEITNOW',
          externalId: j.slug,
          url: j.url,
          applyUrl: j.url,
          title: j.title,
          company: j.company_name,
          location: j.remote ? `Remote | ${j.location ?? 'Germany'}` : j.location ?? 'Germany',
          countryHint: j.location ? null : 'DE',
          remoteHint: !!j.remote,
          employmentType: (j.job_types ?? []).join(', ') || null,
          // Arbeitnow tags explicit visa sponsorship; surface it into the text the detector reads.
          description: `${htmlToText(j.description)}${tags.some((t) => /visa/i.test(t)) ? '\n\nVisa sponsorship is available for this role.' : ''}`,
          postedAt: toIso(j.created_at),
        });
      }
      if (!d.links?.next || !d.data.length) break;
    }
    return out;
  },
};

// ---------------- Working Nomads ----------------
export const workingnomads: FeedConnector = {
  source: 'WORKINGNOMADS',
  enabled: () => true,
  async fetchAll() {
    const d = await getJson<Array<Record<string, any>>>('https://www.workingnomads.com/api/exposed_jobs/');
    return d.map((j): RawJob => ({
      source: 'WORKINGNOMADS',
      externalId: j.url,
      url: j.url,
      applyUrl: j.url,
      title: j.title,
      company: j.company_name,
      location: `Remote (${j.location || 'Anywhere'})`,
      remoteHint: true,
      department: j.category_name ?? null,
      description: htmlToText(j.description),
      postedAt: toIso(j.pub_date),
    }));
  },
};

// ---------------- Adzuna (free key: developer.adzuna.com) ----------------
const ADZUNA_COUNTRIES = ['gb', 'us', 'de', 'nl', 'ch', 'at', 'au', 'nz', 'ca', 'sg', 'in', 'fr', 'be', 'it', 'es', 'pl'];
export const adzuna: FeedConnector = {
  source: 'ADZUNA',
  requires: ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'],
  enabled: (env) => !!env.ADZUNA_APP_ID && !!env.ADZUNA_APP_KEY,
  async fetchAll(env, q) {
    const out: RawJob[] = [];
    const countries = (q?.countries?.length ? q.countries.map((c) => c.toLowerCase()) : ADZUNA_COUNTRIES).filter((c) => ADZUNA_COUNTRIES.includes(c === 'gb' ? 'gb' : c));
    for (const country of countries) {
      for (const what of q?.keywords ?? DEFAULT_KEYWORDS.slice(0, 4)) {
        const params = new URLSearchParams({ app_id: env.ADZUNA_APP_ID!, app_key: env.ADZUNA_APP_KEY!, what, results_per_page: '50', max_days_old: '30', 'content-type': 'application/json' });
        const d = await getJson<{ results: Array<Record<string, any>> }>(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`).catch(() => ({ results: [] }));
        for (const j of d.results) {
          out.push({
            source: 'ADZUNA',
            externalId: String(j.id),
            url: j.redirect_url,
            applyUrl: j.redirect_url,
            title: htmlToText(j.title),
            company: j.company?.display_name ?? 'Unknown',
            location: j.location?.display_name ?? null,
            countryHint: country.toUpperCase() === 'GB' ? 'GB' : country.toUpperCase(),
            employmentType: j.contract_time ?? null,
            salaryMin: j.salary_min ? Math.round(j.salary_min) : null,
            salaryMax: j.salary_max ? Math.round(j.salary_max) : null,
            description: htmlToText(j.description),
            postedAt: toIso(j.created),
          });
        }
      }
    }
    return out;
  },
};

// ---------------- Jooble (free key: jooble.org/api/about) — covers UAE, Luxembourg, Gulf ----------------
export const jooble: FeedConnector = {
  source: 'JOOBLE',
  requires: ['JOOBLE_API_KEY'],
  enabled: (env) => !!env.JOOBLE_API_KEY,
  async fetchAll(env, q) {
    const out: RawJob[] = [];
    const locations = q?.countries?.length ? q.countries : ['United Arab Emirates', 'Luxembourg', 'Saudi Arabia', 'Qatar', 'Switzerland', 'Netherlands', 'Germany', 'United Kingdom'];
    for (const location of locations) {
      for (const keywords of q?.keywords ?? DEFAULT_KEYWORDS.slice(0, 3)) {
        const res = await http(`https://jooble.org/api/${env.JOOBLE_API_KEY}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ keywords, location, page: '1' }),
        });
        if (!res.ok) continue;
        const d = (await res.json()) as { jobs?: Array<Record<string, any>> };
        for (const j of d.jobs ?? []) {
          out.push({
            source: 'JOOBLE',
            externalId: String(j.id),
            url: j.link,
            applyUrl: j.link,
            title: htmlToText(j.title),
            company: j.company || 'Unknown',
            location: j.location || location,
            employmentType: j.type || null,
            description: htmlToText(j.snippet),
            postedAt: toIso(j.updated),
          });
        }
      }
    }
    return out;
  },
};

// ---------------- Reed (UK; free key: reed.co.uk/developers) ----------------
export const reed: FeedConnector = {
  source: 'REED',
  requires: ['REED_API_KEY'],
  enabled: (env) => !!env.REED_API_KEY,
  async fetchAll(env, q) {
    const auth = { authorization: `Basic ${Buffer.from(`${env.REED_API_KEY}:`).toString('base64')}` };
    const out: RawJob[] = [];
    for (const keywords of q?.keywords ?? DEFAULT_KEYWORDS.slice(0, 4)) {
      const d = await getJson<{ results: Array<Record<string, any>> }>(`https://www.reed.co.uk/api/1.0/search?keywords=${encodeURIComponent(keywords)}&resultsToTake=100`, auth).catch(() => ({ results: [] }));
      for (const j of d.results) {
        out.push({
          source: 'REED',
          externalId: String(j.jobId),
          url: j.jobUrl,
          applyUrl: j.jobUrl,
          title: j.jobTitle,
          company: j.employerName,
          location: `${j.locationName}, United Kingdom`,
          countryHint: 'GB',
          salaryMin: j.minimumSalary ?? null,
          salaryMax: j.maximumSalary ?? null,
          salaryCurrency: j.currency ?? 'GBP',
          description: htmlToText(j.jobDescription),
          postedAt: toIso(j.date?.split('/').reverse().join('-')),
        });
      }
    }
    return out;
  },
};

// ---------------- USAJobs (US federal; free key: developer.usajobs.gov) ----------------
export const usajobs: FeedConnector = {
  source: 'USAJOBS',
  requires: ['USAJOBS_API_KEY', 'USAJOBS_EMAIL'],
  enabled: (env) => !!env.USAJOBS_API_KEY && !!env.USAJOBS_EMAIL,
  async fetchAll(env, q) {
    const headers = { host: 'data.usajobs.gov', 'user-agent': env.USAJOBS_EMAIL!, 'authorization-key': env.USAJOBS_API_KEY! };
    const out: RawJob[] = [];
    for (const kw of q?.keywords ?? ['software', 'data scientist', 'it specialist']) {
      const d = await getJson<{ SearchResult: { SearchResultItems: Array<{ MatchedObjectId: string; MatchedObjectDescriptor: Record<string, any> }> } }>(
        `https://data.usajobs.gov/api/search?Keyword=${encodeURIComponent(kw)}&ResultsPerPage=250`,
        headers,
      ).catch(() => null);
      for (const it of d?.SearchResult.SearchResultItems ?? []) {
        const j = it.MatchedObjectDescriptor;
        out.push({
          source: 'USAJOBS',
          externalId: it.MatchedObjectId,
          url: j.PositionURI,
          applyUrl: j.ApplyURI?.[0] ?? j.PositionURI,
          title: j.PositionTitle,
          company: j.OrganizationName,
          location: `${j.PositionLocationDisplay}, United States`,
          countryHint: 'US',
          salaryMin: Number(j.PositionRemuneration?.[0]?.MinimumRange) || null,
          salaryMax: Number(j.PositionRemuneration?.[0]?.MaximumRange) || null,
          salaryCurrency: 'USD',
          description: `${j.QualificationSummary ?? ''}\n\n${j.UserArea?.Details?.MajorDuties?.join('\n') ?? ''}\n\nUS citizenship is required for federal positions.`,
          postedAt: toIso(j.PublicationStartDate),
        });
      }
    }
    return out;
  },
};

export const FEED_CONNECTORS: FeedConnector[] = [remotive, remoteok, weworkremotely, himalayas, jobicy, arbeitnow, workingnomads, adzuna, jooble, reed, usajobs];

export function feedStatus(env: NodeJS.ProcessEnv) {
  return FEED_CONNECTORS.map((c) => ({ source: c.source, enabled: c.enabled(env), requires: c.requires ?? [] }));
}

export type { FeedQuery };
