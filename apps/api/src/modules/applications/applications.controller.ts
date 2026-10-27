import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { APPLICATION_STATUSES } from '@copilot/shared';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../../common/auth';
import { ZodPipe } from '../../common/zod.pipe';
import { ApplicationsService } from './applications.service';

const ApplicationBody = z.object({
  jobId: z.string().optional(),
  company: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  source: z.string().min(1).max(50),
  jobUrl: z.string().url().optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
  appliedAt: z.coerce.date().optional(),
  followUpAt: z.coerce.date().optional(),
  recruiterName: z.string().max(100).optional(),
  recruiterEmail: z.string().email().optional(),
  recruiterLinkedin: z.string().url().optional(),
  salaryExpected: z.string().max(50).optional(),
  notes: z.string().max(5000).optional(),
});
const ApplicationPatch = ApplicationBody.partial();
const ListQuery = z.object({ status: z.enum(APPLICATION_STATUSES).optional(), q: z.string().max(100).optional() });
const InterviewBody = z.object({
  round: z.string().min(1).max(100),
  scheduledAt: z.coerce.date(),
  durationMins: z.number().int().min(5).max(600).optional(),
  mode: z.enum(['video', 'phone', 'onsite']).optional(),
  interviewer: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
});
const InterviewPatch = z.object({
  outcome: z.enum(['PASSED', 'FAILED', 'PENDING']).optional(),
  notes: z.string().max(5000).optional(),
  scheduledAt: z.coerce.date().optional(),
});

@ApiTags('applications')
@ApiBearerAuth()
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly apps: ApplicationsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    return this.apps.list(u.id, q.status, q.q);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(ApplicationBody)) b: z.infer<typeof ApplicationBody>) {
    return this.apps.create(u.id, b);
  }

  @Get('interviews/upcoming')
  upcoming(@CurrentUser() u: AuthUser) {
    return this.apps.upcomingInterviews(u.id);
  }

  @Patch('interviews/:interviewId')
  updateInterview(@CurrentUser() u: AuthUser, @Param('interviewId') id: string, @Body(new ZodPipe(InterviewPatch)) b: z.infer<typeof InterviewPatch>) {
    return this.apps.updateInterview(u.id, id, b);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.apps.get(u.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(ApplicationPatch)) b: z.infer<typeof ApplicationPatch>) {
    return this.apps.update(u.id, id, b);
  }

  @HttpCode(204)
  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.apps.remove(u.id, id);
  }

  @Post(':id/interviews')
  addInterview(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(InterviewBody)) b: z.infer<typeof InterviewBody>) {
    return this.apps.addInterview(u.id, id, b);
  }
}
