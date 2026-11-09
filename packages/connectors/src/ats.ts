/**
 * Public applicant-tracking-system job board APIs. Every endpoint here is documented or
 * published by the ATS vendor for embedding a company's careers page, needs no key, and
 * returns only jobs the company has chosen to publish.
 */
import { getJson, getText, HttpError, htmlToText, http, pool, toIso, decodeEntities } from './http';
import type { AtsType, BoardConnector, CompanyBoard, RawJob } from './types';

const enc = encodeURIComponent;

async function probeJson<T>(url: string, count: (d: T) => number): Promise<number | null> {
  try {
    const res = await http(url, { retries: 0, timeoutMs: 15_000 });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('json')) return null;
    return count((await res.json()) as T);
  } catch {
    return null;
  }
}

// ---------------- Greenhouse ----------------
interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at: string;
  first_published?: string;
  location?: { name?: string };
  offices?: Array<{ name?: string; location?: string | null }>;
  departments?: Array<{ name?: string }>;
  content?: string;
  company_name?: string;
}
export const greenhouse: BoardConnector = {
  ats: 'greenhouse',
  probe: (slug) => probeJson<{ jobs: unknown[] }>(`https://boards-api.greenhouse.io/v1/boards/${enc(slug)}/jobs`, (d) => d.jobs.length),
  async fetchBoard(b) {
    const d = await getJson<{ jobs: GhJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${enc(b.slug)}/jobs?content=true`);
    return d.jobs.map((j): RawJob => ({
      source: 'GREENHOUSE',
      ats: 'greenhouse',
      externalId: `${b.slug}:${j.id}`,
      url: j.absolute_url,
      applyUrl: j.absolute_url,
      title: j.title,
      company: j.company_name || b.name,
      companyDomain: b.website ?? null,
      location: [j.location?.name, ...(j.offices ?? []).map((o) => o.location || o.name)].filter(Boolean).join(' | ') || null,
      department: j.departments?.[0]?.name ?? null,
      description: htmlToText(j.content),
      postedAt: toIso(j.first_published ?? j.updated_at),
    }));
  },
};

// ---------------- Lever ----------------
interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl: string;
  createdAt: number;
  country?: string;
  workplaceType?: string;
  categories?: { location?: string; allLocations?: string[]; commitment?: string; team?: string };
  descriptionPlain?: string;
  lists?: Array<{ text: string; content: string }>;
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string };
}
export const lever: BoardConnector = {
  ats: 'lever',
  probe: (slug) => probeJson<unknown[]>(`https://api.lever.co/v0/postings/${enc(slug)}?mode=json&limit=200`, (d) => d.length),
  async fetchBoard(b) {
    const jobs = await getJson<LeverJob[]>(`https://api.lever.co/v0/postings/${enc(b.slug)}?mode=json`);
    return jobs.map((j): RawJob => ({
      source: 'LEVER',
      ats: 'lever',
      externalId: `${b.slug}:${j.id}`,
      url: j.hostedUrl,
      applyUrl: j.applyUrl,
      title: j.text,
      company: b.name,
      companyDomain: b.website ?? null,
      location: (j.categories?.allLocations?.length ? j.categories.allLocations : [j.categories?.location]).filter(Boolean).join(' | ') || null,
      countryHint: j.country ?? null,
      remoteHint: j.workplaceType === 'remote',
      hybridHint: j.workplaceType === 'hybrid',
      employmentType: j.categories?.commitment ?? null,
      department: j.categories?.team ?? null,
      salaryMin: j.salaryRange?.min ?? null,
      salaryMax: j.salaryRange?.max ?? null,
      salaryCurrency: j.salaryRange?.currency ?? null,
      description: [j.descriptionPlain, ...(j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`), j.additionalPlain].filter(Boolean).join('\n\n'),
      postedAt: toIso(j.createdAt),
    }));
  },
};

// ---------------- Ashby ----------------
interface AshbyJob {
  id: string;
  title: string;
  department?: string;
  employmentType?: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string }>;
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string;
  address?: { postalAddress?: { addressCountry?: string; addressLocality?: string } };
  jobUrl: string;
  applyUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  compensation?: { summaryComponents?: Array<{ compensationType?: string; minValue?: number; maxValue?: number; currencyCode?: string }> };
}
export const ashby: BoardConnector = {
  ats: 'ashby',
  probe: (slug) => probeJson<{ jobs: unknown[] }>(`https://api.ashbyhq.com/posting-api/job-board/${enc(slug)}`, (d) => d.jobs.length),
  async fetchBoard(b) {
    const d = await getJson<{ jobs: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${enc(b.slug)}?includeCompensation=true`);
    return d.jobs
      .filter((j) => j.isListed !== false)
      .map((j) => {
        const salary = j.compensation?.summaryComponents?.find((c) => c.compensationType === 'Salary');
        return {
          source: 'ASHBY',
          ats: 'ashby',
          externalId: `${b.slug}:${j.id}`,
          url: j.jobUrl,
          applyUrl: j.applyUrl ?? j.jobUrl,
          title: j.title,
          company: b.name,
          companyDomain: b.website ?? null,
          location: [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)].filter(Boolean).join(' | ') || null,
          countryHint: j.address?.postalAddress?.addressCountry ?? null,
          remoteHint: j.isRemote ?? j.workplaceType === 'Remote',
          hybridHint: j.workplaceType === 'Hybrid',
          employmentType: j.employmentType ?? null,
          department: j.department ?? null,
          salaryMin: salary?.minValue ?? null,
          salaryMax: salary?.maxValue ?? null,
          salaryCurrency: salary?.currencyCode ?? null,
          description: j.descriptionPlain ?? htmlToText(j.descriptionHtml),
          postedAt: toIso(j.publishedAt),
        } satisfies RawJob;
      });
  },
};

// ---------------- Workable ----------------
interface WorkableJob {
  title: string;
  shortcode: string;
  employment_type?: string;
  telecommuting?: boolean;
  department?: string;
  url: string;
  application_url?: string;
  published_on?: string;
  country?: string;
  city?: string;
  state?: string;
  locations?: Array<{ country?: string; countryCode?: string; city?: string; region?: string; hidden?: boolean }>;
  description?: string;
}
export const workable: BoardConnector = {
  ats: 'workable',
  probe: (slug) => probeJson<{ jobs: unknown[] }>(`https://apply.workable.com/api/v1/widget/accounts/${enc(slug)}`, (d) => d.jobs.length),
  async fetchBoard(b) {
    const d = await getJson<{ name?: string; jobs: WorkableJob[] }>(`https://apply.workable.com/api/v1/widget/accounts/${enc(b.slug)}?details=true`);
    return d.jobs.map((j) => {
      const locs = (j.locations?.length ? j.locations : [{ city: j.city, region: j.state, country: j.country }]).filter((l) => !('hidden' in l && l.hidden));
      return {
        source: 'WORKABLE',
        ats: 'workable',
        externalId: `${b.slug}:${j.shortcode}`,
        url: j.url,
        applyUrl: j.application_url ?? j.url,
        title: j.title,
        company: d.name || b.name,
        companyDomain: b.website ?? null,
        location: locs.map((l) => [l.city, l.region, l.country].filter(Boolean).join(', ')).join(' | ') || null,
        countryHint: (locs[0] as { countryCode?: string })?.countryCode ?? null,
        remoteHint: j.telecommuting ?? null,
        employmentType: j.employment_type ?? null,
        department: j.department ?? null,
        description: htmlToText(j.description),
        postedAt: toIso(j.published_on),
      } satisfies RawJob;
    });
  },
};

// ---------------- SmartRecruiters ----------------
interface SrPosting {
  id: string;
  name: string;
  releasedDate?: string;
  company?: { name?: string };
  location?: { city?: string; region?: string; country?: string; remote?: boolean; hybrid?: boolean; fullLocation?: string };
  typeOfEmployment?: { label?: string };
  department?: { label?: string };
}
interface SrDetail extends SrPosting {
  postingUrl?: string;
  applyUrl?: string;
  jobAd?: { sections?: Record<string, { title?: string; text?: string }> };
}
export const smartrecruiters: BoardConnector = {
  ats: 'smartrecruiters',
  probe: (slug) => probeJson<{ totalFound: number }>(`https://api.smartrecruiters.com/v1/companies/${enc(slug)}/postings?limit=1`, (d) => d.totalFound || null as unknown as number),
  async fetchBoard(b) {
    const list: SrPosting[] = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = await getJson<{ content: SrPosting[]; totalFound: number }>(
        `https://api.smartrecruiters.com/v1/companies/${enc(b.slug)}/postings?limit=100&offset=${offset}`,
      );
      list.push(...page.content);
      if (list.length >= page.totalFound || !page.content.length) break;
    }
    // Descriptions require a detail call per posting; cap to keep large employers polite.
    const { results } = await pool(list.slice(0, 250), 4, (p) =>
      getJson<SrDetail>(`https://api.smartrecruiters.com/v1/companies/${enc(b.slug)}/postings/${enc(p.id)}`),
    );
    return results.map((j): RawJob => ({
      source: 'SMARTRECRUITERS',
      ats: 'smartrecruiters',
      externalId: `${b.slug}:${j.id}`,
      url: j.postingUrl ?? `https://jobs.smartrecruiters.com/${b.slug}/${j.id}`,
      applyUrl: j.applyUrl ?? null,
      title: j.name,
      company: j.company?.name ?? b.name,
      companyDomain: b.website ?? null,
      location: j.location?.fullLocation ?? [j.location?.city, j.location?.region, j.location?.country?.toUpperCase()].filter(Boolean).join(', '),
      countryHint: j.location?.country?.toUpperCase() ?? null,
      remoteHint: j.location?.remote ?? null,
      hybridHint: j.location?.hybrid ?? null,
      employmentType: j.typeOfEmployment?.label ?? null,
      department: j.department?.label ?? null,
      description: Object.values(j.jobAd?.sections ?? {})
        .map((s) => `${s.title ?? ''}\n${htmlToText(s.text)}`)
        .join('\n\n'),
      postedAt: toIso(j.releasedDate),
    }));
  },
};

// ---------------- Recruitee ----------------
interface RecruiteeOffer {
  id: number;
  title: string;
  careers_url: string;
  careers_apply_url?: string;
  company_name?: string;
  location?: string;
  city?: string;
  country?: string;
  country_code?: string;
  remote?: boolean;
  hybrid?: boolean;
  employment_type_code?: string;
  department?: string;
  description?: string;
  requirements?: string;
  published_at?: string;
  salary?: { min?: string | number; max?: string | number; currency?: string };
}
export const recruitee: BoardConnector = {
  ats: 'recruitee',
  probe: (slug) => probeJson<{ offers: unknown[] }>(`https://${enc(slug)}.recruitee.com/api/offers/`, (d) => d.offers.length),
  async fetchBoard(b) {
    const d = await getJson<{ offers: RecruiteeOffer[] }>(`https://${enc(b.slug)}.recruitee.com/api/offers/`);
    return d.offers.map((j): RawJob => ({
      source: 'RECRUITEE',
      ats: 'recruitee',
      externalId: `${b.slug}:${j.id}`,
      url: j.careers_url,
      applyUrl: j.careers_apply_url ?? j.careers_url,
      title: j.title,
      company: j.company_name || b.name,
      companyDomain: b.website ?? null,
      location: j.location || [j.city, j.country].filter(Boolean).join(', ') || null,
      countryHint: j.country_code?.toUpperCase() ?? null,
      remoteHint: j.remote ?? null,
      hybridHint: j.hybrid ?? null,
      employmentType: j.employment_type_code ?? null,
      department: j.department ?? null,
      salaryMin: j.salary?.min ? Number(j.salary.min) : null,
      salaryMax: j.salary?.max ? Number(j.salary.max) : null,
      salaryCurrency: j.salary?.currency ?? null,
      description: `${htmlToText(j.description)}\n\n${htmlToText(j.requirements)}`.trim(),
      postedAt: toIso(j.published_at),
    }));
  },
};

// ---------------- Personio (XML feed) ----------------
const tag = (xml: string, name: string) => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? decodeEntities(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim()) : '';
};
export const personio: BoardConnector = {
  ats: 'personio',
  async probe(slug) {
    try {
      const res = await http(`https://${enc(slug)}.jobs.personio.de/xml`, { retries: 0, timeoutMs: 15_000 });
      if (!res.ok) return null;
      const xml = await res.text();
      return xml.includes('<workzag-jobs') ? (xml.match(/<position>/g) ?? []).length : null;
    } catch {
      return null;
    }
  },
  async fetchBoard(b) {
    const xml = await getText(`https://${enc(b.slug)}.jobs.personio.de/xml?language=en`);
    return (xml.match(/<position>[\s\S]*?<\/position>/g) ?? []).map((p) => {
      const id = tag(p, 'id');
      const descriptions = (p.match(/<jobDescription>[\s\S]*?<\/jobDescription>/g) ?? [])
        .map((d) => `${tag(d, 'name')}\n${htmlToText(tag(d, 'value'))}`)
        .join('\n\n');
      return {
        source: 'PERSONIO',
        ats: 'personio',
        externalId: `${b.slug}:${id}`,
        url: `https://${b.slug}.jobs.personio.de/job/${id}`,
        applyUrl: `https://${b.slug}.jobs.personio.de/job/${id}#apply`,
        title: tag(p, 'name'),
        company: tag(p, 'subcompany') || b.name,
        companyDomain: b.website ?? null,
        location: [tag(p, 'office'), ...(p.match(/<additionalOffices>[\s\S]*?<\/additionalOffices>/)?.[0].match(/<office>([^<]+)<\/office>/g) ?? []).map((o) => o.replace(/<\/?office>/g, ''))]
          .filter(Boolean)
          .join(' | '),
        employmentType: tag(p, 'employmentType') || null,
        department: tag(p, 'department') || null,
        description: descriptions,
        postedAt: toIso(tag(p, 'createdAt')),
      } satisfies RawJob;
    });
  },
};

export const BOARD_CONNECTORS: Record<AtsType, BoardConnector> = { greenhouse, lever, ashby, workable, smartrecruiters, recruitee, personio };

export async function fetchCompanyBoard(board: CompanyBoard): Promise<RawJob[]> {
  const c = BOARD_CONNECTORS[board.ats];
  if (!c) throw new Error(`Unknown ATS ${board.ats}`);
  try {
    return await c.fetchBoard(board);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return [];
    throw e;
  }
}

/** Detects the ATS behind a careers URL so any company can be added by pasting a link. */
export function detectAtsFromUrl(url: string): { ats: AtsType; slug: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const seg = u.pathname.split('/').filter(Boolean);
  const host = u.hostname.toLowerCase();
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    const slug = host.startsWith('boards-api') ? seg[2] : u.searchParams.get('for') ?? seg[0];
    return slug ? { ats: 'greenhouse', slug } : null;
  }
  if (host === 'jobs.lever.co' && seg[0]) return { ats: 'lever', slug: seg[0] };
  if (host === 'jobs.ashbyhq.com' && seg[0]) return { ats: 'ashby', slug: seg[0] };
  if (host === 'apply.workable.com' && seg[0]) return { ats: 'workable', slug: seg[0] };
  if (host === 'jobs.smartrecruiters.com' && seg[0]) return { ats: 'smartrecruiters', slug: seg[0] };
  if (host.endsWith('.recruitee.com')) return { ats: 'recruitee', slug: host.split('.')[0] };
  if (/\.jobs\.personio\.(de|com)$/.test(host)) return { ats: 'personio', slug: host.split('.')[0] };
  return null;
}
