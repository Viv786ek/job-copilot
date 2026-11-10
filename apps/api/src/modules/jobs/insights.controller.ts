import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../../common/auth';
import { ZodPipe } from '../../common/zod.pipe';
import { JobsService } from './jobs.service';

const InsightsQuery = z.object({
  countries: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v.split(',').map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))),
});

@ApiTags('insights')
@ApiBearerAuth()
@Controller('insights')
export class InsightsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  get(@CurrentUser() u: AuthUser, @Query(new ZodPipe(InsightsQuery)) q: z.infer<typeof InsightsQuery>) {
    return this.jobs.careerInsights(u.id, q.countries);
  }
}
