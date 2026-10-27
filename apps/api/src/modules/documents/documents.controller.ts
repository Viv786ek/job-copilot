import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DOCUMENT_TYPES } from '@copilot/shared';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../../common/auth';
import { ZodPipe } from '../../common/zod.pipe';
import { DocumentsService } from './documents.service';

const JobRef = z.object({ jobId: z.string().min(1), resumeId: z.string().optional() });
const CoverLetterBody = JobRef.extend({ tone: z.string().max(60).optional() });
const OutreachBody = JobRef.extend({ recruiterName: z.string().max(100).optional() });
const ListQuery = z.object({ jobId: z.string().optional(), type: z.enum(DOCUMENT_TYPES).optional() });
const UpdateBody = z.object({ content: z.record(z.unknown()) });

@ApiTags('documents')
@ApiBearerAuth()
@Throttle({ default: { limit: 40, ttl: 3_600_000 } })
@Controller('documents')
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Post('tailored-resume')
  tailor(@CurrentUser() u: AuthUser, @Body(new ZodPipe(JobRef)) b: z.infer<typeof JobRef>) {
    return this.docs.tailorResume(u.id, b.jobId, b.resumeId);
  }

  @Post('cover-letter')
  coverLetter(@CurrentUser() u: AuthUser, @Body(new ZodPipe(CoverLetterBody)) b: z.infer<typeof CoverLetterBody>) {
    return this.docs.coverLetter(u.id, b.jobId, b.tone);
  }

  @Post('outreach')
  outreach(@CurrentUser() u: AuthUser, @Body(new ZodPipe(OutreachBody)) b: z.infer<typeof OutreachBody>) {
    return this.docs.outreach(u.id, b.jobId, b.recruiterName);
  }

  @Post('interview-prep')
  interview(@CurrentUser() u: AuthUser, @Body(new ZodPipe(JobRef)) b: z.infer<typeof JobRef>) {
    return this.docs.interviewPrep(u.id, b.jobId);
  }

  @Post('application-draft')
  draft(@CurrentUser() u: AuthUser, @Body(new ZodPipe(JobRef)) b: z.infer<typeof JobRef>) {
    return this.docs.createApplicationDraft(u.id, b.jobId);
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    return this.docs.list(u.id, q);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.docs.get(u.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(UpdateBody)) b: z.infer<typeof UpdateBody>) {
    return this.docs.update(u.id, id, b.content);
  }

  @Get(':id/docx')
  docx(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.docs.docxUrl(u.id, id);
  }
}
