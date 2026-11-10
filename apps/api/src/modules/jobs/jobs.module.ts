import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { InsightsController } from './insights.controller';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

// Source connectors live in @copilot/connectors (shared with the harvester CLI).
@Module({
  imports: [MatchingModule],
  controllers: [JobsController, InsightsController],
  providers: [JobsService],
  exports: [JobsService, MatchingModule],
})
export class JobsModule {}
