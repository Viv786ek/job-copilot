import { Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, Prisma } from '@prisma/client';
import { CacheService } from '../../core/cache.service';
import { PrismaService } from '../../core/prisma.service';

export interface ApplicationInput {
  jobId?: string;
  company: string;
  role: string;
  source: string;
  jobUrl?: string;
  status?: ApplicationStatus;
  appliedAt?: Date;
  followUpAt?: Date;
  recruiterName?: string;
  recruiterEmail?: string;
  recruiterLinkedin?: string;
  salaryExpected?: string;
  notes?: string;
}

/** Statuses after which the candidate has heard back (used for response rate). */
const RESPONDED: ApplicationStatus[] = ['SCREENING', 'INTERVIEWING', 'OFFER', 'ACCEPTED', 'REJECTED'];
const DEFAULT_FOLLOW_UP_DAYS = 7;

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  list(userId: string, status?: ApplicationStatus, q?: string) {
    return this.prisma.application.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
        ...(q
          ? { OR: [{ company: { contains: q, mode: 'insensitive' } }, { role: { contains: q, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: { interviews: { orderBy: { scheduledAt: 'asc' } }, _count: { select: { documents: true } } },
    });
  }

  async get(userId: string, id: string) {
    const app = await this.prisma.application.findFirst({
      where: { id, userId },
      include: {
        events: { orderBy: { createdAt: 'desc' } },
        interviews: { orderBy: { scheduledAt: 'asc' } },
        documents: { select: { id: true, type: true, version: true, createdAt: true } },
      },
    });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  async create(userId: string, input: ApplicationInput) {
    const status = input.status ?? 'DRAFT';
    const appliedAt = input.appliedAt ?? (status !== 'DRAFT' ? new Date() : undefined);
    const app = await this.prisma.application.create({
      data: {
        ...input,
        userId,
        status,
        appliedAt,
        followUpAt: input.followUpAt ?? (appliedAt ? addDays(appliedAt, DEFAULT_FOLLOW_UP_DAYS) : undefined),
        responded: RESPONDED.includes(status),
        events: { create: { type: 'CREATED', toStatus: status } },
      },
    });
    await this.invalidate(userId);
    return app;
  }

  async update(userId: string, id: string, input: Partial<ApplicationInput>) {
    const current = await this.get(userId, id);
    // jobId is immutable after creation.
    const { jobId: _ignored, ...rest } = input;
    const data: Prisma.ApplicationUpdateInput = { ...rest };
    const events: Prisma.ApplicationEventCreateWithoutApplicationInput[] = [];

    if (input.status && input.status !== current.status) {
      events.push({ type: 'STATUS_CHANGE', fromStatus: current.status, toStatus: input.status });
      if (input.status === 'APPLIED' && !current.appliedAt) {
        data.appliedAt = input.appliedAt ?? new Date();
        data.followUpAt = input.followUpAt ?? addDays(new Date(), DEFAULT_FOLLOW_UP_DAYS);
      }
      if (RESPONDED.includes(input.status)) data.responded = true;
      // Terminal states don't need follow-ups.
      if (['REJECTED', 'WITHDRAWN', 'ACCEPTED', 'OFFER'].includes(input.status)) data.followUpAt = null;
    }
    if (input.notes && input.notes !== current.notes) events.push({ type: 'NOTE', message: input.notes.slice(0, 500) });

    const app = await this.prisma.application.update({
      where: { id },
      data: { ...data, events: events.length ? { create: events } : undefined },
    });
    await this.invalidate(userId);
    return app;
  }

  async remove(userId: string, id: string) {
    await this.get(userId, id);
    await this.prisma.application.delete({ where: { id } });
    await this.invalidate(userId);
  }

  async addInterview(userId: string, applicationId: string, input: { round: string; scheduledAt: Date; durationMins?: number; mode?: string; interviewer?: string; notes?: string }) {
    const app = await this.get(userId, applicationId);
    const interview = await this.prisma.interview.create({ data: { applicationId, ...input } });
    if (app.status !== 'INTERVIEWING') await this.update(userId, applicationId, { status: 'INTERVIEWING' });
    await this.invalidate(userId);
    return interview;
  }

  async updateInterview(userId: string, interviewId: string, input: { outcome?: string; notes?: string; scheduledAt?: Date }) {
    const iv = await this.prisma.interview.findFirst({ where: { id: interviewId, application: { userId } } });
    if (!iv) throw new NotFoundException('Interview not found');
    return this.prisma.interview.update({ where: { id: interviewId }, data: input });
  }

  upcomingInterviews(userId: string) {
    return this.prisma.interview.findMany({
      where: { application: { userId }, scheduledAt: { gte: new Date() } },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
      include: { application: { select: { id: true, company: true, role: true } } },
    });
  }

  /* -------- Workflow 4: follow-ups (consumed by n8n and the worker) -------- */

  dueFollowUps(limit = 200) {
    return this.prisma.application.findMany({
      where: { followUpAt: { lte: new Date() }, status: { in: ['APPLIED', 'SCREENING'] }, responded: false },
      take: limit,
      include: {
        user: { select: { id: true, email: true, name: true } },
        documents: { where: { type: 'RECRUITER_EMAIL' }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
  }

  /** Records a sent follow-up and schedules the next one; after 3 unanswered nudges the app is marked GHOSTED. */
  async markFollowUpSent(id: string, channel: string) {
    const app = await this.prisma.application.findUniqueOrThrow({ where: { id }, include: { events: { where: { type: 'FOLLOW_UP_SENT' } } } });
    const sent = app.events.length + 1;
    const ghosted = sent >= 3;
    await this.prisma.application.update({
      where: { id },
      data: {
        followUpAt: ghosted ? null : addDays(new Date(), 7),
        status: ghosted ? 'GHOSTED' : undefined,
        events: { create: { type: 'FOLLOW_UP_SENT', message: `Follow-up #${sent} via ${channel}` } },
      },
    });
    await this.invalidate(app.userId);
    return { sent, ghosted };
  }

  private invalidate(userId: string) {
    return this.cache.del(`dash:${userId}`);
  }
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
