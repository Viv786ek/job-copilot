import { Controller, Get, Global, HttpCode, Injectable, Logger, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/auth';
import { AppConfig } from '../../config/config.service';
import { PrismaService } from '../../core/prisma.service';

export type NotificationType = 'NEW_MATCHES' | 'FOLLOW_UP_DUE' | 'RESUME_PARSED' | 'INTERVIEW_REMINDER' | 'DOCS_READY';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Persists an in-app notification and forwards it to n8n, which owns delivery channels
   * (email, Telegram, Slack, WhatsApp). Delivery failure never fails the caller.
   */
  async notify(userId: string, type: NotificationType, title: string, body: string, data?: Prisma.InputJsonValue) {
    const n = await this.prisma.notification.create({ data: { userId, type, title, body, data } });
    const base = this.config.get('N8N_WEBHOOK_BASE_URL');
    if (base) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
      fetch(`${base.replace(/\/$/, '')}/copilot-notify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-key': this.config.get('INTERNAL_API_KEY') },
        body: JSON.stringify({ id: n.id, type, title, body, data, user }),
        signal: AbortSignal.timeout(5000),
      }).catch((e) => this.logger.warn(`n8n notify failed: ${(e as Error).message}`));
    }
    return n;
  }

  list(userId: string, unreadOnly: boolean) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  markRead(userId: string, id: string | 'all') {
    return this.prisma.notification.updateMany({
      where: { userId, ...(id === 'all' ? {} : { id }), readAt: null },
      data: { readAt: new Date() },
    });
  }
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('unread') unread?: string) {
    return this.svc.list(u.id, unread === 'true');
  }

  @HttpCode(204)
  @Post(':id/read')
  async read(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.svc.markRead(u.id, id);
  }
}

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
