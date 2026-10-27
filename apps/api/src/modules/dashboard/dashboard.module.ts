import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/auth';
import { CacheService } from '../../core/cache.service';
import { PrismaService } from '../../core/prisma.service';

export interface DashboardStats {
  resumeHealth: number;
  avgMatchScore: number;
  topMatches: number;
  atsImprovement: { avgBefore: number; avgAfter: number; delta: number; documents: number };
  pipeline: Record<string, number>;
  applied: number;
  interviews: number;
  upcomingInterviews: number;
  rejections: number;
  offers: number;
  responseRate: number;
  followUpsDue: number;
  weekly: Array<{ week: string; applied: number; responses: number }>;
  topMissingSkills: Array<{ skill: string; count: number }>;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Cached for 5 minutes; write paths invalidate `dash:{userId}`. */
  stats(userId: string): Promise<DashboardStats> {
    return this.cache.wrap(`dash:${userId}`, 300, () => this.compute(userId));
  }

  private async compute(userId: string): Promise<DashboardStats> {
    const [profile, matchAgg, topMatches, docs, byStatus, interviews, upcoming, followUpsDue, missing, weekly] = await Promise.all([
      this.prisma.candidateProfile.findUnique({ where: { userId }, select: { resumeHealth: true } }),
      this.prisma.jobMatch.aggregate({ where: { userId, dismissed: false }, _avg: { score: true } }),
      this.prisma.jobMatch.count({ where: { userId, dismissed: false, score: { gte: 75 } } }),
      this.prisma.generatedDocument.aggregate({
        where: { userId, type: 'TAILORED_RESUME', atsScoreBefore: { not: null } },
        _avg: { atsScoreBefore: true, atsScoreAfter: true },
        _count: true,
      }),
      this.prisma.application.groupBy({ by: ['status'], where: { userId }, _count: true }),
      this.prisma.interview.count({ where: { application: { userId } } }),
      this.prisma.interview.count({ where: { application: { userId }, scheduledAt: { gte: new Date() } } }),
      this.prisma.application.count({ where: { userId, followUpAt: { lte: new Date() }, responded: false, status: { in: ['APPLIED', 'SCREENING'] } } }),
      this.prisma.$queryRaw<Array<{ skill: string; count: bigint }>>`
        SELECT skill, COUNT(*)::bigint AS count
        FROM "JobMatch", unnest("missingSkills") AS skill
        WHERE "userId" = ${userId} AND score >= 50 AND dismissed = false
        GROUP BY skill ORDER BY count DESC LIMIT 8`,
      this.prisma.$queryRaw<Array<{ week: Date; applied: bigint; responses: bigint }>>`
        SELECT date_trunc('week', "appliedAt") AS week,
               COUNT(*)::bigint AS applied,
               COUNT(*) FILTER (WHERE responded)::bigint AS responses
        FROM "Application"
        WHERE "userId" = ${userId} AND "appliedAt" >= now() - interval '12 weeks'
        GROUP BY 1 ORDER BY 1`,
    ]);

    const pipeline: Record<string, number> = {};
    for (const s of byStatus) pipeline[s.status] = s._count;
    const applied = Object.entries(pipeline).filter(([k]) => k !== 'DRAFT').reduce((s, [, v]) => s + v, 0);
    const responded = ['SCREENING', 'INTERVIEWING', 'OFFER', 'ACCEPTED', 'REJECTED'].reduce((s, k) => s + (pipeline[k] ?? 0), 0);
    const before = Math.round(docs._avg.atsScoreBefore ?? 0);
    const after = Math.round(docs._avg.atsScoreAfter ?? 0);

    return {
      resumeHealth: profile?.resumeHealth ?? 0,
      avgMatchScore: Math.round(matchAgg._avg.score ?? 0),
      topMatches,
      atsImprovement: { avgBefore: before, avgAfter: after, delta: after - before, documents: docs._count },
      pipeline,
      applied,
      interviews,
      upcomingInterviews: upcoming,
      rejections: pipeline.REJECTED ?? 0,
      offers: (pipeline.OFFER ?? 0) + (pipeline.ACCEPTED ?? 0),
      responseRate: applied ? Math.round((responded / applied) * 100) : 0,
      followUpsDue,
      weekly: weekly.map((w) => ({ week: w.week.toISOString().slice(0, 10), applied: Number(w.applied), responses: Number(w.responses) })),
      topMissingSkills: missing.map((m) => ({ skill: m.skill, count: Number(m.count) })),
    };
  }
}

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get()
  stats(@CurrentUser() u: AuthUser) {
    return this.svc.stats(u.id);
  }
}

@Module({ controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
