import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { sharedImports } from '../app.module';
import { AppConfig } from '../config/config.service';
import { ApplicationsModule } from '../modules/applications/applications.module';
import { DocumentsModule } from '../modules/documents/documents.module';
import { JobsModule } from '../modules/jobs/jobs.module';
import { QueueService } from '../modules/queue/queue.module';
import { ResumesModule } from '../modules/resumes/resumes.module';
import { JobSearchProcessor, NotificationsProcessor, PipelineProcessor, ResumeProcessor } from './processors';

@Module({
  imports: [...sharedImports, ResumesModule, JobsModule, DocumentsModule, ApplicationsModule],
  providers: [ResumeProcessor, JobSearchProcessor, PipelineProcessor, NotificationsProcessor],
})
export class WorkerModule implements OnApplicationBootstrap {
  constructor(
    private readonly queue: QueueService,
    private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.get('ENABLE_SCHEDULER')) await this.queue.registerSchedules();
  }
}
