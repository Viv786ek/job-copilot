import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthGuard, Public } from './common/auth';
import { AppConfig } from './config/config.service';
import { validateEnv } from './config/env';
import { CoreModule } from './core/core.module';
import { PrismaService } from './core/prisma.service';
import { AiModule } from './modules/ai/ai.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { InternalModule } from './modules/internal/internal.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProfileModule } from './modules/profile/profile.module';
import { QueueModule } from './modules/queue/queue.module';
import { ResumesModule } from './modules/resumes/resumes.module';

/** Infrastructure shared by the HTTP API and the background worker. */
export const sharedImports = [
  ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
  LoggerModule.forRoot({
    pinoHttp: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty', options: { singleLine: true } },
      redact: ['req.headers.authorization', 'req.headers["x-internal-key"]', 'req.headers.cookie'],
      autoLogging: { ignore: (req) => req.url === '/health' },
    },
  }),
  CoreModule,
  QueueModule,
  AiModule,
  NotificationsModule,
];

@Controller()
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ...sharedImports,
    JwtModule.registerAsync({
      global: true,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN'), issuer: 'vp-job-copilot' },
        verifyOptions: { issuer: 'vp-job-copilot' },
      }),
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    AuthModule,
    ProfileModule,
    ResumesModule,
    JobsModule,
    DocumentsModule,
    ApplicationsModule,
    DashboardModule,
    InternalModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
