import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type Job } from '@prisma/client';
import {
  analyzeJdHeuristic,
  countryName,
  JdAnalysis,
  JdAnalysisSchema,
  listCountries,
  MatchResult,
  normalizeSkills,
  REGIONS,
} from '@copilot/shared';
import {
  crawlCareerPage,
  dedupe,
  detectAtsFromUrl,
  enrichJob,
  FEED_CONNECTORS,
  feedStatus,
  fetchCompanyBoard,
  harvest,
  loadSponsorRegisters,
  type CompanyBoard,
  type EnrichedJob,
  type RawJob,
  type SponsorRegisters,
} from '@copilot/connectors';
import { createHash } from 'crypto';
import { CacheService } from '../../core/cache.service';
import { PrismaService } from '../../core/prisma.service';
import { AiService } from '../ai/ai.service';
import { prompts } from '@copilot/shared';
import { MatchingService } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.module';
import { QueueService } from '../queue/queue.module';

export interface FeedFilters {
  minScore?: number;
  remote?: boolean;
  source?: string;
  q?: string;
  saved?: boolean;
  page?: number;
  pageSize?: number;
  countries?: string[];
  includeRemote?: boolean;
  workModes?: string[];
  visa?: 'any' | 'likely' | 'sponsors' | 'exclude-no';
  relocation?: boolean;
  postedWithinDays?: number;
  sort?: 'score' | 'recent';
}

const descriptionHash = (text: string) => createHash('sha256').update(text.toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex');

/** Regions whose remote roles are open to someone in any of `countries`. */
export function regionsCovering(countries: string[]): string[] {
  return Object.entries(REGIONS)
    .filter(([, r]) => r.countries.some((c) => countries.includes(c)))
    .map(([k]) => k);
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private registers: { value: SponsorRegisters; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly matching: MatchingService,
    private readonly queue: QueueService,
    private readonly cache: CacheService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Official UK/NL sponsor registers, refreshed at most daily per process. */
  private async sponsorRegisters(): Promise<SponsorRegisters | null> {
    if (this.registers && Date.now() - this.registers.at < 86_400_000) return this.registers.value;
    try {
      const value = await loadSponsorRegisters((m) => this.logger.warn(m));
      this.registers = { value, at: Date.now() };
      return value;
    } catch (e) {
      this.logger.warn(`Sponsor registers unavailable: ${(e as Error).message}`);
      return this.registers?.value ?? null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Ingestion                                                           */
  /* ------------------------------------------------------------------ */

  private toData(j: EnrichedJob) {
    return {
      url: j.url,
      applyUrl: j.applyUrl ?? null,
      title: j.title.slice(0, 300),
      companyName: j.company.slice(0, 200),
      location: j.location?.slice(0, 300) ?? null,
      country: j.countries[0] ?? null,
      countries: j.countries,
      regions: j.regions,
      remoteScope: j.remoteScope,
      workMode: j.workMode,
      employmentType: j.employmentType ?? null,
      department: j.department ?? null,
      salaryMin: j.salaryMin ? Math.round(j.salaryMin) : null,
      salaryMax: j.salaryMax ? Math.round(j.salaryMax) : null,
      salaryCurrency: j.salaryCurrency ?? null,
      visaStatus: j.visa.status,
      visaConfidence: j.visa.confidence,
      visaTypes: j.visa.visaTypes,
      visaEvidence: j.visa.evidence,
      sponsorRegister: j.visa.sponsorRegister,
      visaSponsorship: j.visa.status === 'SPONSORS' ? true : j.visa.status === 'NO_SPONSORSHIP' ? false : null,
      relocation: j.visa.relocation,
      ats: j.ats ?? null,
      fingerprint: j.fingerprint,
      description: j.description.slice(0, 30_000),
      descriptionHash: descriptionHash(j.description),
      // Heuristic analysis is stored immediately; the LLM pass (when configured) refines it.
      analysis: j.analysis as unknown as Prisma.InputJsonValue,
      requiredSkills: j.analysis.requiredSkills,
      preferredSkills: j.analysis.preferredSkills,
      minYears: j.analysis.minYearsExperience ?? null,
      postedAt: j.postedAt ? new Date(j.postedAt) : null,
      isActive: true,
      fetchedAt: new Date(),
    };
  }

  /** Upserts enriched jobs; new ones are queued for analysis + matching. Returns created ids. */
  async ingest(jobs: EnrichedJob[], opts: { queue?: boolean } = {}): Promise<{ created: string[]; updated: number; skipped: number }> {
    const created: string[] = [];
    let updated = 0;
    let skipped = 0;
    for (const j of dedupe(jobs)) {
      if (!j.title || !j.url || j.description.length < 80) {
        skipped++;
        continue;
      }
      const existing = await this.prisma.job.findUnique({ where: { source_externalId: { source: j.source, externalId: j.externalId } }, select: { id: true } });
      if (existing) {
        await this.prisma.job.update({ where: { id: existing.id }, data: { isActive: true, fetchedAt: new Date(), visaStatus: j.visa.status, visaConfidence: j.visa.confidence } });
        updated++;
        continue;
      }
      const dup = await this.prisma.job.findFirst({ where: { fingerprint: j.fingerprint, isActive: true }, select: { id: true } });
      if (dup) {
        skipped++;
        continue;
      }
      const job = await this.prisma.job.create({ data: { source: j.source, externalId: j.externalId, ...this.toData(j) } });
      created.push(job.id);
      if (opts.queue !== false) await this.queue.analyzeJob(job.id);
    }
    return { created, updated, skipped };
  }

  /** Global discovery run: every company board + every enabled feed. Scheduled by the worker. */
  async harvestAll() {
    const companies = await this.prisma.company.findMany({ where: { atsType: { not: null }, atsBoardId: { not: null } } });
    const boards: CompanyBoard[] = companies.map((c) => ({ name: c.name, ats: c.atsType as CompanyBoard['ats'], slug: c.atsBoardId!, website: c.website }));
    const result = await harvest({ boards, registers: await this.sponsorRegisters(), log: (m) => this.logger.log(m) });
    const { created, updated } = await this.ingest(result.jobs);

    // Close postings that disappeared from boards fetched successfully in this run.
    const seen = new Set(result.jobs.map((j) => `${j.source}|${j.externalId}`));
    const atsSources = ['GREENHOUSE', 'LEVER', 'ASHBY', 'WORKABLE', 'SMARTRECRUITERS', 'RECRUITEE', 'PERSONIO'];
    const stale = await this.prisma.job.findMany({ where: { isActive: true, source: { in: atsSources }, fetchedAt: { lt: new Date(Date.now() - 2 * 86_400_000) } }, select: { id: true, source: true, externalId: true } });
    const closeIds = stale.filter((s) => !seen.has(`${s.source}|${s.externalId}`)).map((s) => s.id);
    if (closeIds.length) await this.prisma.job.updateMany({ where: { id: { in: closeIds } }, data: { isActive: false } });

    await this.prisma.$transaction(
      companies.map((c) =>
        this.prisma.company.update({
          where: { id: c.id },
          data: { lastFetchedAt: new Date(), openJobs: result.jobs.filter((j) => j.company === c.name).length },
        }),
      ),
    );
    return { stats: result.stats, created: created.length, updated, closed: closeIds.length, total: result.jobs.length };
  }

  /** Upserts verified boards (from packages/connectors/data/companies.json or the discovery CLI). */
  async syncCompanies(boards: Array<CompanyBoard & { openJobs?: number }>) {
    let n = 0;
    for (const b of boards) {
      const slug = `${b.ats}-${b.slug}`.toLowerCase();
      await this.prisma.company.upsert({
        where: { slug },
        update: { name: b.name, website: b.website ?? undefined, openJobs: b.openJobs ?? undefined },
        create: { slug, name: b.name, website: b.website ?? null, atsType: b.ats, atsBoardId: b.slug, origin: b.origin ?? 'curated', openJobs: b.openJobs ?? null },
      });
      n++;
    }
    return { synced: n };
  }

  /** Per-user discovery: keyed aggregators queried with the user's roles and countries, then matching. */
  async searchForUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { profile: true, preferences: true } });
    if (!user?.profile) return { created: 0, matched: 0 };
    const prefs = user.preferences;
    const keywords = (prefs?.titles.length ? prefs.titles : user.profile.primaryRoles).slice(0, 3);
    const keyed = FEED_CONNECTORS.filter((c) => c.requires?.length && c.enabled(process.env));
    const registers = await this.sponsorRegisters();
    let created = 0;
    for (const c of keyed) {
      try {
        const raw = await c.fetchAll(process.env, { keywords: keywords.length ? keywords : undefined, countries: prefs?.countries.length ? prefs.countries : undefined });
        created += (await this.ingest(raw.map((r) => enrichJob(r, registers)))).created.length;
      } catch (e) {
        this.logger.warn(`${c.source} search failed for ${userId}: ${(e as Error).message}`);
      }
    }
    const matched = await this.matchExistingForUser(userId);
    await this.prisma.savedSearch.updateMany({ where: { userId }, data: { lastRunAt: new Date() } });
    return { created, matched };
  }

  /** Scores the user against recent active jobs that share at least one skill (GIN prefilter). */
  async matchExistingForUser(userId: string): Promise<number> {
    const profile = await this.prisma.candidateProfile.findUnique({ where: { userId } });
    if (!profile?.skills.length) return 0;
    const jobs = await this.prisma.job.findMany({
      where: { isActive: true, requiredSkills: { hasSome: profile.skills }, OR: [{ postedAt: null }, { postedAt: { gte: new Date(Date.now() - 45 * 86_400_000) } }] },
      orderBy: { postedAt: 'desc' },
      take: 3000,
      select: { id: true },
    });
    let n = 0;
    for (const { id } of jobs) {
      const r = await this.matching.matchJobForUser(userId, id, { minScore: 40 });
      if (r) n++;
    }
    await this.cache.del(`dash:${userId}`);
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Analysis                                                            */
  /* ------------------------------------------------------------------ */

  /** LLM analysis when a provider is configured; deterministic analyzer otherwise or on failure. */
  async analyzeText(description: string, title?: string, company?: string, userId?: string): Promise<JdAnalysis> {
    if (this.ai.isConfigured()) {
      try {
        const { data } = await this.ai.generateJson(JdAnalysisSchema, prompts.analyzeJd(description, title, company), {
          feature: 'jd.analyze',
          userId,
          system: !userId,
          temperature: 0,
        });
        return { ...data, requiredSkills: normalizeSkills(data.requiredSkills), preferredSkills: normalizeSkills(data.preferredSkills) };
      } catch (e) {
        this.logger.warn(`LLM JD analysis failed, using heuristic analyzer: ${(e as Error).message}`);
      }
    }
    return analyzeJdHeuristic(description, title);
  }

  async ensureAnalysis(jobId: string): Promise<Job> {
    const job = await this.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    const llmDone = (job.analysis as { _llm?: boolean } | null)?._llm;
    if (job.analysis && (llmDone || !this.ai.isConfigured())) return job;
    const analysis = await this.analyzeText(job.description, job.title, job.companyName);
    const [embedding] = await this.ai.embed([`${job.title}\n${job.description.slice(0, 8000)}`]);
    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        analysis: { ...analysis, _llm: this.ai.isConfigured() } as unknown as Prisma.InputJsonValue,
        requiredSkills: analysis.requiredSkills,
        preferredSkills: analysis.preferredSkills,
        minYears: analysis.minYearsExperience ?? null,
        workMode: job.workMode ?? analysis.workMode ?? null,
        embedding: embedding ?? [],
      },
    });
  }

  /** Worker entry point: analyze, fan-out match, notify, queue auto-drafts. */
  async processNewJob(jobId: string, forUserId?: string) {
    const job = await this.ensureAnalysis(jobId);
    const matches = forUserId
      ? [{ userId: forUserId, score: (await this.matching.matchJobForUser(forUserId, jobId))?.score ?? 0 }]
      : await this.matching.matchJobForAllUsers(jobId);

    for (const m of matches) {
      const prefs = await this.prisma.jobPreference.findUnique({ where: { userId: m.userId } });
      if (m.score < (prefs?.minMatchScore ?? 60)) continue;
      await this.cache.del(`dash:${m.userId}`);
      if (prefs?.autoGenerateDocs) await this.queue.autoDocs(m.userId, jobId);
      if (!forUserId) {
        await this.notifications.notify(m.userId, 'NEW_MATCHES', `${m.score}% match: ${job.title}`, `${job.companyName} · ${job.location ?? job.workMode ?? ''}`, { jobId, score: m.score });
        await this.prisma.jobMatch.update({ where: { userId_jobId: { userId: m.userId, jobId } }, data: { notifiedAt: new Date() } });
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* User-facing                                                         */
  /* ------------------------------------------------------------------ */

  async importForUser(userId: string, input: { url?: string; html?: string; title?: string; company?: string; location?: string; description?: string }) {
    let raw: RawJob | undefined;
    if (input.url && !input.description) {
      const page = await crawlCareerPage(input.url, process.env, input.html).catch((e) => {
        throw new BadRequestException(`Could not read that page: ${(e as Error).message}`);
      });
      raw = page.jobs.find((j) => j.url === input.url) ?? (page.jobs.length === 1 ? page.jobs[0] : undefined);
      if (!raw && page.jobs.length > 1) {
        // A whole careers page: ingest everything, return the first.
        const ingested = await this.ingest(page.jobs.map((j) => enrichJob(j, null)));
        if (!ingested.created.length) throw new BadRequestException('No new jobs found on that careers page.');
        await Promise.all(ingested.created.map((id) => this.queue.analyzeJob(id, { forUserId: userId })));
        return { jobId: ingested.created[0], imported: ingested.created.length, match: null };
      }
      if (!raw) {
        throw new BadRequestException('This page needs sign-in or hides its job data. Paste the job description text instead.');
      }
    } else if (input.description) {
      raw = {
        source: 'MANUAL',
        externalId: descriptionHash(input.description).slice(0, 24),
        url: input.url || `manual://${descriptionHash(input.description).slice(0, 12)}`,
        title: input.title ?? 'Untitled role',
        company: input.company ?? 'Unknown company',
        location: input.location ?? null,
        description: input.description,
        postedAt: new Date().toISOString(),
      };
    }
    if (!raw) throw new BadRequestException('Provide a job URL or paste the description');
    if (input.title) raw.title = input.title;
    if (input.company) raw.company = input.company;

    const enriched = enrichJob(raw, await this.sponsorRegisters());
    const existing =
      (await this.prisma.job.findUnique({ where: { source_externalId: { source: raw.source, externalId: raw.externalId } } })) ??
      (await this.prisma.job.findFirst({ where: { fingerprint: enriched.fingerprint } }));
    const jobId = existing?.id ?? (await this.prisma.job.create({ data: { source: raw.source, externalId: raw.externalId, ...this.toData(enriched) } })).id;
    await this.ensureAnalysis(jobId);
    const match = await this.matching.matchJobForUser(userId, jobId);
    return { jobId, imported: 1, match };
  }

  async analyzeForUser(userId: string, description: string, title?: string, company?: string): Promise<{ analysis: JdAnalysis; match: MatchResult; visa: ReturnType<typeof enrichJob>['visa'] }> {
    const analysis = await this.analyzeText(description, title, company, userId);
    const [embedding] = await this.ai.embed([`${title ?? ''}\n${description.slice(0, 8000)}`]);
    const match = await this.matching.matchAnalysis(userId, analysis, embedding);
    const visa = enrichJob({ source: 'MANUAL', externalId: 'x', url: 'manual://x', title: title ?? '', company: company ?? '', location: null, description, postedAt: null }, await this.sponsorRegisters()).visa;
    return { analysis, match, visa };
  }

  private feedWhere(userId: string, f: FeedFilters): Prisma.JobMatchWhereInput {
    const jobWhere: Prisma.JobWhereInput = { isActive: true };
    const and: Prisma.JobWhereInput[] = [];
    if (f.countries?.length) {
      const or: Prisma.JobWhereInput[] = [{ countries: { hasSome: f.countries } }];
      if (f.includeRemote !== false) {
        or.push({ remoteScope: 'GLOBAL' }, { AND: [{ remoteScope: 'REGION' }, { regions: { hasSome: regionsCovering(f.countries) } }] });
      }
      and.push({ OR: or });
    }
    if (f.remote) and.push({ workMode: 'REMOTE' });
    if (f.workModes?.length) and.push({ workMode: { in: f.workModes as Array<'REMOTE' | 'HYBRID' | 'ONSITE'> } });
    if (f.visa === 'sponsors') and.push({ visaStatus: 'SPONSORS' });
    if (f.visa === 'likely') and.push({ visaStatus: { in: ['SPONSORS', 'LIKELY'] } });
    if (f.visa === 'exclude-no') and.push({ visaStatus: { not: 'NO_SPONSORSHIP' } });
    if (f.relocation) and.push({ relocation: true });
    if (f.source) and.push({ source: f.source });
    if (f.postedWithinDays) and.push({ OR: [{ postedAt: { gte: new Date(Date.now() - f.postedWithinDays * 86_400_000) } }, { postedAt: null }] });
    if (f.q) and.push({ OR: [{ title: { contains: f.q, mode: 'insensitive' } }, { companyName: { contains: f.q, mode: 'insensitive' } }] });
    if (and.length) jobWhere.AND = and;
    return { userId, dismissed: false, score: { gte: f.minScore ?? 0 }, ...(f.saved ? { saved: true } : {}), job: jobWhere };
  }

  async feed(userId: string, f: FeedFilters) {
    const page = Math.max(1, f.page ?? 1);
    const pageSize = Math.min(50, f.pageSize ?? 20);
    const where = this.feedWhere(userId, f);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.jobMatch.findMany({
        where,
        orderBy: f.sort === 'recent' ? [{ job: { postedAt: 'desc' } }] : [{ score: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          job: {
            select: {
              id: true, title: true, companyName: true, location: true, workMode: true, source: true, url: true, salaryMin: true, salaryMax: true,
              salaryCurrency: true, visaSponsorship: true, visaStatus: true, visaConfidence: true, relocation: true, countries: true, remoteScope: true, postedAt: true,
            },
          },
        },
      }),
      this.prisma.jobMatch.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /** Country facets from live data plus the full ISO list for the selector. */
  async countries() {
    const rows = await this.prisma.$queryRaw<Array<{ code: string; count: bigint }>>`
      SELECT c AS code, COUNT(*)::bigint AS count FROM "Job", unnest("countries") AS c
      WHERE "isActive" = true GROUP BY c ORDER BY count DESC`;
    return {
      withJobs: rows.map((r) => ({ code: r.code, name: countryName(r.code), count: Number(r.count) })),
      all: listCountries(),
    };
  }

  async getForUser(userId: string, jobId: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId }, include: { company: { select: { name: true, website: true, atsType: true } } } });
    if (!job) throw new NotFoundException('Job not found');
    const { embedding: _e, descriptionHash: _h, ...rest } = job;
    const match = await this.prisma.jobMatch.findUnique({ where: { userId_jobId: { userId, jobId } } });
    const documents = await this.prisma.generatedDocument.findMany({
      where: { userId, jobId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, version: true, createdAt: true, atsScoreBefore: true, atsScoreAfter: true },
    });
    return { job: rest, match, documents, insights: await this.insights(job) };
  }

  /** Recruiter / company insights computed from our own job index. */
  async insights(job: Pick<Job, 'companyName' | 'postedAt' | 'sponsorRegister' | 'ats'>) {
    const since30 = new Date(Date.now() - 30 * 86_400_000);
    const [open, recent, sponsoring, countries] = await Promise.all([
      this.prisma.job.count({ where: { companyName: job.companyName, isActive: true } }),
      this.prisma.job.count({ where: { companyName: job.companyName, isActive: true, postedAt: { gte: since30 } } }),
      this.prisma.job.count({ where: { companyName: job.companyName, isActive: true, visaStatus: { in: ['SPONSORS', 'LIKELY'] } } }),
      this.prisma.$queryRaw<Array<{ code: string }>>`SELECT DISTINCT unnest("countries") AS code FROM "Job" WHERE "companyName" = ${job.companyName} AND "isActive" = true LIMIT 20`,
    ]);
    const ageDays = job.postedAt ? Math.floor((Date.now() - job.postedAt.getTime()) / 86_400_000) : null;
    return {
      openRoles: open,
      postedLast30Days: recent,
      sponsoringRoles: sponsoring,
      hiringCountries: countries.map((c) => ({ code: c.code, name: countryName(c.code) })),
      sponsorRegister: job.sponsorRegister,
      ats: job.ats,
      postingAgeDays: ageDays,
      tips: [
        ageDays != null && ageDays <= 7 ? 'Fresh posting: applying in the first week noticeably improves response rates.' : null,
        ageDays != null && ageDays > 30 ? 'Posted over a month ago; it may be close to filled. Reach out to a recruiter directly.' : null,
        recent >= 5 ? `${job.companyName} posted ${recent} roles in 30 days: an actively growing team.` : null,
        job.sponsorRegister ? `${job.companyName} holds an active sponsor licence (${job.sponsorRegister}).` : null,
      ].filter(Boolean),
    };
  }

  async setFlags(userId: string, jobId: string, flags: { saved?: boolean; dismissed?: boolean }) {
    return this.prisma.jobMatch.update({ where: { userId_jobId: { userId, jobId } }, data: flags });
  }

  async addCareerPage(url: string, name?: string) {
    const detected = detectAtsFromUrl(url);
    if (!detected) {
      const page = await crawlCareerPage(url).catch(() => null);
      if (!page?.jobs.length) return { supported: false, message: 'No public job data found on that page. Paste individual job URLs instead.' };
      const { created } = await this.ingest(page.jobs.map((j) => enrichJob(j, null)));
      return { supported: true, method: page.method, jobsFound: page.jobs.length, created: created.length };
    }
    const slug = `${detected.ats}-${detected.slug}`.toLowerCase();
    const company = await this.prisma.company.upsert({
      where: { slug },
      update: {},
      create: { slug, name: name ?? detected.slug, careersUrl: url, atsType: detected.ats, atsBoardId: detected.slug, origin: 'user' },
    });
    const raw = await fetchCompanyBoard({ name: company.name, ats: detected.ats, slug: detected.slug });
    const { created } = await this.ingest(raw.map((j) => enrichJob(j, null)));
    return { supported: true, method: 'ats-api', companyId: company.id, jobsFound: raw.length, created: created.length };
  }

  sourcesStatus() {
    return {
      feeds: feedStatus(process.env),
      careerPages: {
        jsonLd: true,
        firecrawl: !!process.env.FIRECRAWL_API_KEY,
        playwright: process.env.PLAYWRIGHT_ENABLED === 'true',
      },
      ats: ['greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'recruitee', 'personio'],
    };
  }
}
