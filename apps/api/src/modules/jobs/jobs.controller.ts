import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../../common/auth';
import { ZodPipe } from '../../common/zod.pipe';
import { QueueService } from '../queue/queue.module';
import { JobsService } from './jobs.service';

const ImportSchema = z
  .object({
    url: z.string().url().optional(),
    html: z.string().max(3_000_000).optional(),
    title: z.string().max(300).optional(),
    company: z.string().max(200).optional(),
    location: z.string().max(200).optional(),
    description: z.string().min(100).max(40_000).optional(),
  })
  .refine((v) => v.url || v.description, { message: 'Provide a job URL or paste the description' });

const AnalyzeSchema = z.object({
  description: z.string().min(100).max(40_000),
  title: z.string().max(300).optional(),
  company: z.string().max(200).optional(),
});

const FeedSchema = z.object({
  minScore: z.coerce.number().min(0).max(100).optional(),
  remote: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  saved: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  source: z.string().optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
  /** Comma-separated ISO 3166 alpha-2 codes; any country, nothing hardcoded. */
  countries: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)) : undefined)),
  includeRemote: z.enum(['true', 'false']).optional().transform((v) => v !== 'false'),
  workModes: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter((m) => ['REMOTE', 'HYBRID', 'ONSITE'].includes(m)) : undefined)),
  visa: z.enum(['any', 'likely', 'sponsors', 'exclude-no']).optional(),
  relocation: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  postedWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  sort: z.enum(['score', 'recent']).optional(),
  level: z.enum(['entry', 'mid', 'senior', 'leadership']).optional(),
  salaryMin: z.coerce.number().int().min(0).optional(),
  salaryCurrency: z.string().length(3).optional(),
  salaryListed: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  newWithinDays: z.coerce.number().int().min(1).max(60).optional(),
});

const FlagsSchema = z.object({ saved: z.boolean().optional(), dismissed: z.boolean().optional() });
const CareerPageSchema = z.object({ url: z.string().url(), name: z.string().max(200).optional() });

@ApiTags('jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly queue: QueueService,
  ) {}

  @Get('feed')
  feed(@CurrentUser() u: AuthUser, @Query(new ZodPipe(FeedSchema)) q: z.infer<typeof FeedSchema>) {
    return this.jobs.feed(u.id, q);
  }

  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @Post('import')
  import(@CurrentUser() u: AuthUser, @Body(new ZodPipe(ImportSchema)) body: z.infer<typeof ImportSchema>) {
    return this.jobs.importForUser(u.id, body);
  }

  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @Post('analyze')
  analyze(@CurrentUser() u: AuthUser, @Body(new ZodPipe(AnalyzeSchema)) body: z.infer<typeof AnalyzeSchema>) {
    return this.jobs.analyzeForUser(u.id, body.description, body.title, body.company);
  }

  @Throttle({ default: { limit: 6, ttl: 3_600_000 } })
  @Post('search/run')
  async runSearch(@CurrentUser() u: AuthUser) {
    await this.queue.searchForUser(u.id);
    return { queued: true };
  }

  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @Post('career-pages')
  addCareerPage(@Body(new ZodPipe(CareerPageSchema)) body: z.infer<typeof CareerPageSchema>) {
    return this.jobs.addCareerPage(body.url, body.name);
  }

  @Get('countries')
  countries() {
    return this.jobs.countries();
  }

  @Get('sources')
  sources() {
    return this.jobs.sourcesStatus();
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.jobs.getForUser(u.id, id);
  }

  @Patch(':id')
  flags(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(FlagsSchema)) body: z.infer<typeof FlagsSchema>) {
    return this.jobs.setFlags(u.id, id, body);
  }
}
