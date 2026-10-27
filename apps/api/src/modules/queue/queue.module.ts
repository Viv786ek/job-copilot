import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Global, Injectable, Module } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import { AppConfig } from '../../config/config.service';
import { JOBS, QUEUES } from './queue.constants';

const DEFAULT_JOB_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
};

/** Producer facade so feature modules never touch BullMQ directly. */
@Injectable()
export class QueueService {
  constructor(
    @InjectQueue(QUEUES.RESUME) private readonly resume: Queue,
    @InjectQueue(QUEUES.JOBS) private readonly jobs: Queue,
    @InjectQueue(QUEUES.PIPELINE) private readonly pipeline: Queue,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly notifications: Queue,
  ) {}

  parseResume(resumeId: string) {
    return this.resume.add(JOBS.PARSE_RESUME, { resumeId }, { ...DEFAULT_JOB_OPTS, jobId: `parse-${resumeId}-${Date.now()}` });
  }

  searchForUser(userId: string) {
    // Dedupe: at most one search per user per 10 minutes.
    const bucket = Math.floor(Date.now() / 600_000);
    return this.jobs.add(JOBS.SEARCH_FOR_USER, { userId }, { ...DEFAULT_JOB_OPTS, jobId: `search-${userId}-${bucket}` });
  }

  analyzeJob(jobId: string, opts: { forUserId?: string } = {}) {
    return this.pipeline.add(JOBS.ANALYZE_JOB, { jobId, ...opts }, { ...DEFAULT_JOB_OPTS, jobId: `analyze-${jobId}-${opts.forUserId ?? 'all'}` });
  }

  autoDocs(userId: string, jobId: string) {
    return this.pipeline.add(JOBS.AUTO_DOCS, { userId, jobId }, { ...DEFAULT_JOB_OPTS, jobId: `docs-${userId}-${jobId}` });
  }

  digest(userId: string) {
    return this.notifications.add(JOBS.DAILY_DIGEST, { userId }, DEFAULT_JOB_OPTS);
  }

  /** Repeatable schedules; registered once by the worker process. */
  async registerSchedules() {
    await this.jobs.upsertJobScheduler('job-sweep', { pattern: '0 */4 * * *' }, { name: JOBS.SCHEDULED_SWEEP });
    await this.notifications.upsertJobScheduler('follow-ups', { pattern: '0 9 * * *', tz: 'Asia/Kolkata' }, { name: JOBS.FOLLOW_UP_SWEEP });
  }
}

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => {
        const url = new URL(config.get('REDIS_URL'));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            username: url.username || undefined,
            password: url.password || undefined,
            tls: url.protocol === 'rediss:' ? {} : undefined,
            maxRetriesPerRequest: null,
          },
          prefix: 'copilot',
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUES.RESUME },
      { name: QUEUES.JOBS },
      { name: QUEUES.PIPELINE },
      { name: QUEUES.NOTIFICATIONS },
    ),
  ],
  providers: [QueueService],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
