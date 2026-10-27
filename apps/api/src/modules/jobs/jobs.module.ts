import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { CareerPagesConnector } from './connectors/ats-boards.connector';
import { JOB_CONNECTORS } from './connectors/connector';
import { AdzunaConnector, RemoteOkConnector, RemotiveConnector } from './connectors/public-apis.connector';
import { UrlImportService } from './connectors/url-import';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [MatchingModule],
  controllers: [JobsController],
  providers: [
    RemotiveConnector,
    RemoteOkConnector,
    AdzunaConnector,
    CareerPagesConnector,
    UrlImportService,
    {
      provide: JOB_CONNECTORS,
      useFactory: (...c: unknown[]) => c,
      inject: [RemotiveConnector, RemoteOkConnector, AdzunaConnector],
    },
    JobsService,
  ],
  exports: [JobsService, MatchingModule],
})
export class JobsModule {}
