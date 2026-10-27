import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type Job } from '@prisma/client';
import { JdAnalysis, JdAnalysisSchema, MatchResult, normalizeSkills } from '@copilot/shared';
import { CacheService } from '../../core/cache.service';
import { PrismaService } from '../../core/prisma.service';
import { AiService } from '../ai/ai.service';
import { prompts } from '../ai/prompts';
import { MatchingService } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.module';
import { QueueService } from '../queue/queue.module';
import { CareerPagesConnector } from './connectors/ats-boards.connector';
import { descriptionHash, JOB_CONNECTORS, JobConnector, RawJob, SearchQuery } from './connectors/connector';
import { UrlImportService } from './connectors/url-import';

export interface FeedFilters {
  minScore?: number;
  remote?: boolean;
  source?: string;
  q?: string;
  saved?: boolean;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly matching: MatchingService,
    private readonly queue: QueueService,
    private readonly cache: CacheService,
    private readonly notifications: NotificationsService,
    private readonly careerPages: CareerPagesConnector,
    private readonly urlImport: UrlImportService,
    @Inject(JOB_CONNECTORS) private readonly connectors: JobConnector[],
  ) {}

  /* ------------------------------------------------------------------ */
  /* Ingestion (Workflow 2: Scheduled Job Search)                        */
  /* ------------------------------------------------------------------ */

  /** Upserts normalized jobs, skips cross-source duplicates, and queues new ones for analysis. */
  async ingest(raw: RawJob[]): Promise<{ created: string[]; skipped: number }> {
    const created: string[] = [];
    let skipped = 0;
    for (const r of raw) {
      if (!r.title || !r.url || (r.description ?? '').length < 100) {
        skipped++;
        continue;
      }
      const hash = descriptionHash(r.description);
      const existing = await this.prisma.job.findUnique({
        where: { source_externalId: { source: r.source, externalId: r.externalId } },
        select: { id: true },
      });
      if (existing) {
        await this.prisma.job.update({ where: { id: existing.id }, data: { isActive: true, fetchedAt: new Date() } });
        skipped++;
        continue;
      }
      // Same posting syndicated across boards: keep the first copy.
      const dup = await this.prisma.job.findFirst({ where: { descriptionHash: hash }, select: { id: true } });
      if (dup) {
        skipped++;
        continue;
      }
      const job = await this.prisma.job.create({
        data: {
          source: r.source,
          externalId: r.externalId,
          url: r.url,
          title: r.title.slice(0, 300),
          companyName: r.companyName.slice(0, 200),
          location: r.location ?? null,
          country: r.country ?? null,
          workMode: r.workMode ?? null,
          employmentType: r.employmentType ?? null,
          salaryMin: r.salaryMin ?? null,
          salaryMax: r.salaryMax ?? null,
          salaryCurrency: r.salaryCurrency ?? null,
          visaSponsorship: r.visaSponsorship ?? null,
          description: r.description.slice(0, 30_000),
          descriptionHash: hash,
          requiredSkills: [],
          preferredSkills: [],
          embedding: [],
          postedAt: r.postedAt ?? null,
        },
      });
      created.push(job.id);
      await this.queue.analyzeJob(job.id);
    }
    return { created, skipped };
  }

  /** Builds queries from the user's profile/preferences and fans out across enabled connectors. */
  async searchForUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { profile: true, preferences: true } });
    if (!user?.profile) return { created: 0 };
    const prefs = user.preferences;
    const titles = (prefs?.titles.length ? prefs.titles : user.profile.primaryRoles).slice(0, 3);
    if (!titles.length) return { created: 0 };

    const locations = prefs?.remoteOnly ? [undefined] : (prefs?.locations.length ? prefs.locations : [undefined]).slice(0, 2);
    const enabled = this.connectors.filter((c) => c.isEnabled() && (!prefs?.sources.length || prefs.sources.includes(c.source)));
    const countries = prefs?.includeInternational ? ['in', 'us', 'gb', 'de', 'ca'] : ['in'];

    const queries: Array<[JobConnector, SearchQuery]> = [];
    for (const c of enabled)
      for (const title of titles)
        for (const location of locations)
          for (const country of c.source === 'ADZUNA' ? countries : [undefined])
            queries.push([c, { query: title, location, country, remote: prefs?.remoteOnly, limit: 30 }]);

    const results = await Promise.allSettled(queries.map(([c, q]) => c.search(q)));
    const jobs = results.flatMap((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      this.logger.warn(`${queries[i][0].source} search failed: ${r.reason?.message ?? r.reason}`);
      return [];
    });
    const { created } = await this.ingest(jobs);
    await this.prisma.savedSearch.updateMany({ where: { userId }, data: { lastRunAt: new Date() } });
    return { created: created.length };
  }

  /** Crawls registered company career pages (Greenhouse / Lever / Ashby). */
  async crawlCareerPages() {
    const companies = await this.prisma.company.findMany({ where: { atsType: { not: null } }, take: 500 });
    let total = 0;
    for (const c of companies) {
      const raw = await this.careerPages.fetchCompany(c);
      const { created } = await this.ingest(raw.map((r) => ({ ...r, companyName: c.name })));
      total += created.length;
    }
    return { created: total };
  }

  /* ------------------------------------------------------------------ */
  /* Analysis (Workflow 3: New Job Found -> Analyze -> Match)            */
  /* ------------------------------------------------------------------ */

  analyzeText(description: string, title?: string, company?: string, userId?: string): Promise<JdAnalysis> {
    return this.ai
      .generateJson(JdAnalysisSchema, prompts.analyzeJd(description, title, company), {
        feature: 'jd.analyze',
        userId,
        system: !userId,
        temperature: 0,
      })
      .then(({ data }) => ({
        ...data,
        requiredSkills: normalizeSkills(data.requiredSkills),
        preferredSkills: normalizeSkills(data.preferredSkills),
      }));
  }

  async ensureAnalysis(jobId: string): Promise<Job> {
    const job = await this.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    if (job.analysis) return job;
    const analysis = await this.analyzeText(job.description, job.title, job.companyName);
    const [embedding] = await this.ai.embed([`${job.title}\n${job.description.slice(0, 8000)}`]);
    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        analysis: analysis as unknown as Prisma.InputJsonValue,
        requiredSkills: analysis.requiredSkills,
        preferredSkills: analysis.preferredSkills,
        minYears: analysis.minYearsExperience ?? null,
        workMode: job.workMode ?? analysis.workMode ?? null,
        visaSponsorship: job.visaSponsorship ?? analysis.visaSponsorship ?? null,
        embedding: embedding ?? [],
      },
    });
  }

  /** Worker entry point: analyze, fan-out match, notify, and queue auto-generated drafts. */
  async processNewJob(jobId: string, forUserId?: string) {
    const job = await this.ensureAnalysis(jobId);
    const matches = forUserId
      ? [{ userId: forUserId, score: (await this.matching.matchJobForUser(forUserId, jobId)).score }]
      : await this.matching.matchJobForAllUsers(jobId);

    for (const m of matches) {
      const prefs = await this.prisma.jobPreference.findUnique({ where: { userId: m.userId } });
      const threshold = prefs?.minMatchScore ?? 60;
      if (m.score < threshold) continue;
      await this.cache.del(`dash:${m.userId}`);
      if (prefs?.autoGenerateDocs) await this.queue.autoDocs(m.userId, jobId);
      if (!forUserId) {
        await this.notifications.notify(m.userId, 'NEW_MATCHES', `${m.score}% match: ${job.title}`, `${job.companyName} · ${job.location ?? job.workMode ?? ''}`, {
          jobId,
          score: m.score,
        });
        await this.prisma.jobMatch.update({ where: { userId_jobId: { userId: m.userId, jobId } }, data: { notifiedAt: new Date() } });
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* User-facing                                                         */
  /* ------------------------------------------------------------------ */

  async importForUser(userId: string, input: { url?: string; html?: string; title?: string; company?: string; location?: string; description?: string }) {
    let raw: RawJob;
    if (input.url && !input.description) {
      raw = await this.urlImport.fromUrl(input.url, input.html);
    } else {
      const description = input.description!;
      raw = {
        source: 'MANUAL',
        externalId: descriptionHash(description).slice(0, 24),
        url: input.url ?? '',
        title: input.title ?? 'Untitled role',
        companyName: input.company ?? 'Unknown company',
        location: input.location ?? null,
        description,
      };
    }
    raw.title = input.title ?? raw.title;
    raw.companyName = input.company ?? raw.companyName;

    const hash = descriptionHash(raw.description);
    const existing =
      (await this.prisma.job.findUnique({ where: { source_externalId: { source: raw.source, externalId: raw.externalId } } })) ??
      (await this.prisma.job.findFirst({ where: { descriptionHash: hash } }));
    let jobId = existing?.id;
    if (!jobId) {
      const { created } = await this.ingestOne({ ...raw, url: raw.url || `manual://${hash.slice(0, 12)}` });
      jobId = created;
    }
    await this.ensureAnalysis(jobId);
    const match = await this.matching.matchJobForUser(userId, jobId);
    return { jobId, match };
  }

  private async ingestOne(raw: RawJob): Promise<{ created: string }> {
    const job = await this.prisma.job.create({
      data: {
        source: raw.source,
        externalId: raw.externalId,
        url: raw.url,
        title: raw.title,
        companyName: raw.companyName,
        location: raw.location ?? null,
        workMode: raw.workMode ?? null,
        visaSponsorship: raw.visaSponsorship ?? null,
        description: raw.description.slice(0, 30_000),
        descriptionHash: descriptionHash(raw.description),
        requiredSkills: [],
        preferredSkills: [],
        embedding: [],
        postedAt: raw.postedAt ?? null,
      },
    });
    return { created: job.id };
  }

  /** JD Analyzer: pasted description, analyzed and matched against the user's profile; nothing persisted. */
  async analyzeForUser(userId: string, description: string, title?: string, company?: string): Promise<{ analysis: JdAnalysis; match: MatchResult }> {
    const analysis = await this.analyzeText(description, title, company, userId);
    const [embedding] = await this.ai.embed([`${title ?? ''}\n${description.slice(0, 8000)}`]);
    const match = await this.matching.matchAnalysis(userId, analysis, embedding);
    return { analysis, match };
  }

  async feed(userId: string, f: FeedFilters) {
    const page = Math.max(1, f.page ?? 1);
    const pageSize = Math.min(50, f.pageSize ?? 20);
    const where: Prisma.JobMatchWhereInput = {
      userId,
      dismissed: false,
      score: { gte: f.minScore ?? 0 },
      ...(f.saved ? { saved: true } : {}),
      job: {
        isActive: true,
        ...(f.remote ? { workMode: 'REMOTE' } : {}),
        ...(f.source ? { source: f.source } : {}),
        ...(f.q
          ? {
              OR: [
                { title: { contains: f.q, mode: 'insensitive' } },
                { companyName: { contains: f.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.jobMatch.findMany({
        where,
        orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          job: {
            select: {
              id: true, title: true, companyName: true, location: true, workMode: true, source: true, url: true,
              salaryMin: true, salaryMax: true, salaryCurrency: true, visaSponsorship: true, postedAt: true,
            },
          },
        },
      }),
      this.prisma.jobMatch.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getForUser(userId: string, jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true, title: true, companyName: true, location: true, workMode: true, source: true, url: true, description: true,
        analysis: true, salaryMin: true, salaryMax: true, salaryCurrency: true, visaSponsorship: true, postedAt: true,
        employmentType: true,
      },
    });
    if (!job) throw new NotFoundException('Job not found');
    const match = await this.prisma.jobMatch.findUnique({ where: { userId_jobId: { userId, jobId } } });
    const documents = await this.prisma.generatedDocument.findMany({
      where: { userId, jobId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, version: true, createdAt: true, atsScoreBefore: true, atsScoreAfter: true },
    });
    return { job, match, documents };
  }

  async setFlags(userId: string, jobId: string, flags: { saved?: boolean; dismissed?: boolean }) {
    return this.prisma.jobMatch.update({ where: { userId_jobId: { userId, jobId } }, data: flags });
  }

  async addCareerPage(url: string, name?: string) {
    const detected = CareerPagesConnector.detect(url);
    if (!detected) return { supported: false, message: 'Only Greenhouse, Lever and Ashby career pages can be tracked automatically. Import individual jobs by URL instead.' };
    const slug = `${detected.atsType}-${detected.atsBoardId}`.toLowerCase();
    const company = await this.prisma.company.upsert({
      where: { slug },
      update: {},
      create: { slug, name: name ?? detected.atsBoardId, careersUrl: url, ...detected },
    });
    const raw = await this.careerPages.fetchCompany(company);
    const { created } = await this.ingest(raw);
    return { supported: true, companyId: company.id, jobsFound: raw.length, created: created.length };
  }
}
