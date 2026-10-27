import { Body, Controller, Get, HttpCode, Module, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { APPLICATION_STATUSES, JOB_SOURCES } from '@copilot/shared';
import { z } from 'zod';
import { Internal } from '../../common/auth';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../core/prisma.service';
import { ApplicationsModule } from '../applications/applications.module';
import { ApplicationsService } from '../applications/applications.service';
import { JobsModule } from '../jobs/jobs.module';
import { JobsService } from '../jobs/jobs.service';
import { QueueService } from '../queue/queue.module';

const RawJobSchema = z.object({
  source: z.enum(JOB_SOURCES),
  externalId: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  companyName: z.string().min(1),
  location: z.string().nullish(),
  country: z.string().nullish(),
  workMode: z.enum(['REMOTE', 'HYBRID', 'ONSITE']).nullish(),
  employmentType: z.string().nullish(),
  salaryMin: z.number().nullish(),
  salaryMax: z.number().nullish(),
  salaryCurrency: z.string().nullish(),
  visaSponsorship: z.boolean().nullish(),
  description: z.string().min(100),
  postedAt: z.coerce.date().nullish(),
});
const IngestBody = z.object({ jobs: z.array(RawJobSchema).max(500) });
const FollowUpSentBody = z.object({ channel: z.enum(['email', 'linkedin', 'manual']).default('email') });
const StatusBody = z.object({ status: z.enum(APPLICATION_STATUSES), message: z.string().max(1000).optional() });

/**
 * Endpoints for n8n (and other trusted automation). Authenticated with `x-internal-key`.
 * n8n orchestrates *when* things happen and *which channel* delivers them; the API owns
 * the business logic and data, so workflows stay thin and replaceable.
 */
@ApiTags('internal (n8n)')
@ApiHeader({ name: 'x-internal-key', required: true })
@Internal()
@Controller('internal')
export class InternalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly apps: ApplicationsService,
    private readonly queue: QueueService,
  ) {}

  @Post('jobs/ingest')
  ingest(@Body(new ZodPipe(IngestBody)) b: z.infer<typeof IngestBody>) {
    return this.jobs.ingest(b.jobs);
  }

  @HttpCode(202)
  @Post('search/run-all')
  async runAll() {
    const users = await this.prisma.user.findMany({
      where: { profile: { activeResumeId: { not: null } }, preferences: { digestFrequency: { not: 'OFF' } } },
      select: { id: true },
    });
    await Promise.all(users.map((u) => this.queue.searchForUser(u.id)));
    return { queued: users.length };
  }

  @HttpCode(202)
  @Post('users/:id/search')
  async searchUser(@Param('id') id: string) {
    await this.queue.searchForUser(id);
    return { queued: true };
  }

  @HttpCode(202)
  @Post('resumes/:id/parse')
  async parse(@Param('id') id: string) {
    await this.queue.parseResume(id);
    return { queued: true };
  }

  @HttpCode(202)
  @Post('jobs/:id/process')
  async process(@Param('id') id: string, @Query('userId') userId?: string) {
    await this.queue.analyzeJob(id, { forUserId: userId });
    return { queued: true };
  }

  @Post('career-pages/crawl')
  crawl() {
    return this.jobs.crawlCareerPages();
  }

  @Get('follow-ups/due')
  async due() {
    const apps = await this.apps.dueFollowUps();
    return apps.map((a) => ({
      applicationId: a.id,
      company: a.company,
      role: a.role,
      recruiterName: a.recruiterName,
      recruiterEmail: a.recruiterEmail,
      appliedAt: a.appliedAt,
      user: a.user,
      draft: a.documents[0]?.content ?? null,
    }));
  }

  @Post('applications/:id/follow-up-sent')
  sent(@Param('id') id: string, @Body(new ZodPipe(FollowUpSentBody)) b: z.infer<typeof FollowUpSentBody>) {
    return this.apps.markFollowUpSent(id, b.channel);
  }

  /** Used by the n8n Gmail workflow after classifying a recruiter reply. */
  @Post('applications/:id/status')
  async status(@Param('id') id: string, @Body(new ZodPipe(StatusBody)) b: z.infer<typeof StatusBody>) {
    const app = await this.prisma.application.findUniqueOrThrow({ where: { id }, select: { userId: true } });
    const updated = await this.apps.update(app.userId, id, { status: b.status });
    if (b.message) await this.prisma.applicationEvent.create({ data: { applicationId: id, type: 'EMAIL_RECEIVED', message: b.message } });
    return updated;
  }

  @Get('users/:id/digest')
  async digest(@Param('id') id: string) {
    const since = new Date(Date.now() - 24 * 3600_000);
    const [user, matches] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id }, select: { email: true, name: true, preferences: { select: { minMatchScore: true } } } }),
      this.prisma.jobMatch.findMany({
        where: { userId: id, createdAt: { gte: since }, dismissed: false },
        orderBy: { score: 'desc' },
        take: 10,
        include: { job: { select: { id: true, title: true, companyName: true, location: true, url: true } } },
      }),
    ]);
    return { user, matches: matches.filter((m) => m.score >= (user.preferences?.minMatchScore ?? 60)) };
  }

  @Get('users/active')
  activeUsers() {
    return this.prisma.user.findMany({
      where: { profile: { activeResumeId: { not: null } }, preferences: { digestFrequency: 'DAILY' } },
      select: { id: true, email: true, name: true },
    });
  }
}

@Module({ imports: [JobsModule, ApplicationsModule], controllers: [InternalController] })
export class InternalModule {}
