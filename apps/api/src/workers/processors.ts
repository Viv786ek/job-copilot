import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../core/prisma.service';
import { ApplicationsService } from '../modules/applications/applications.service';
import { DocumentsService } from '../modules/documents/documents.service';
import { JobsService } from '../modules/jobs/jobs.service';
import { NotificationsService } from '../modules/notifications/notifications.module';
import { JOBS, QUEUES } from '../modules/queue/queue.constants';
import { QueueService } from '../modules/queue/queue.module';
import { ResumesService } from '../modules/resumes/resumes.service';

abstract class LoggingWorker extends WorkerHost {
  protected readonly logger = new Logger(this.constructor.name);

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`${job.name}#${job.id} failed (attempt ${job.attemptsMade}): ${err.message}`);
  }
}

@Processor(QUEUES.RESUME, { concurrency: 4 })
export class ResumeProcessor extends LoggingWorker {
  constructor(private readonly resumes: ResumesService) {
    super();
  }

  async process(job: Job<{ resumeId: string }>) {
    await this.resumes.process(job.data.resumeId);
  }
}

@Processor(QUEUES.JOBS, { concurrency: 3, limiter: { max: 20, duration: 60_000 } })
export class JobSearchProcessor extends LoggingWorker {
  constructor(
    private readonly jobs: JobsService,
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {
    super();
  }

  async process(job: Job<{ userId?: string }>) {
    switch (job.name) {
      case JOBS.SEARCH_FOR_USER:
        return this.jobs.searchForUser(job.data.userId!);
      case JOBS.SCHEDULED_SWEEP: {
        await this.jobs.crawlCareerPages();
        const users = await this.prisma.user.findMany({
          where: { profile: { activeResumeId: { not: null } }, preferences: { digestFrequency: { not: 'OFF' } } },
          select: { id: true },
        });
        for (const u of users) await this.queue.searchForUser(u.id);
        return { users: users.length };
      }
    }
  }
}

@Processor(QUEUES.PIPELINE, { concurrency: 5 })
export class PipelineProcessor extends LoggingWorker {
  constructor(
    private readonly jobs: JobsService,
    private readonly docs: DocumentsService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<{ jobId: string; userId?: string; forUserId?: string }>) {
    switch (job.name) {
      case JOBS.ANALYZE_JOB:
        return this.jobs.processNewJob(job.data.jobId, job.data.forUserId);
      case JOBS.AUTO_DOCS: {
        const app = await this.docs.createApplicationDraft(job.data.userId!, job.data.jobId);
        await this.notifications.notify(job.data.userId!, 'DOCS_READY', `Application draft ready: ${app.role}`, `Tailored resume and cover letter for ${app.company} are ready to review.`, {
          applicationId: app.id,
          jobId: job.data.jobId,
        });
        return { applicationId: app.id };
      }
    }
  }
}

@Processor(QUEUES.NOTIFICATIONS, { concurrency: 2 })
export class NotificationsProcessor extends LoggingWorker {
  constructor(
    private readonly apps: ApplicationsService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name !== JOBS.FOLLOW_UP_SWEEP) return;
    // In-app reminder for every due follow-up; n8n receives the same event and handles email delivery.
    const due = await this.apps.dueFollowUps();
    for (const a of due) {
      await this.notifications.notify(a.userId, 'FOLLOW_UP_DUE', `Follow up with ${a.company}`, `It's been a week since you applied for ${a.role}. A follow-up draft is ready.`, {
        applicationId: a.id,
      });
    }
    return { due: due.length };
  }
}
