import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { ResumesModule } from '../resumes/resumes.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [JobsModule, ResumesModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
