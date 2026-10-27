import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Job } from '@prisma/client';
import { JdAnalysis, JdAnalysisSchema, MatchResult } from '@copilot/shared';
import { PrismaService } from '../../core/prisma.service';
import { CandidateFeatures, computeMatch, JobFeatures } from './matching.engine';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async candidateFeatures(userId: string): Promise<CandidateFeatures> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, preferences: true },
    });
    if (!user?.profile) throw new NotFoundException('Upload a resume to build your profile first');
    const resume = user.profile.activeResumeId
      ? await this.prisma.resume.findUnique({ where: { id: user.profile.activeResumeId }, select: { rawText: true } })
      : null;
    return {
      skills: user.profile.skills,
      totalYearsExp: user.profile.totalYearsExp,
      targetTitles: [...(user.preferences?.titles ?? []), ...user.profile.primaryRoles, user.profile.headline ?? ''].filter(Boolean),
      embedding: user.profile.embedding,
      resumeText: resume?.rawText ?? '',
      preferredLocations: user.preferences?.locations ?? [],
      remoteOnly: user.preferences?.remoteOnly ?? false,
      needsVisaSponsorship: user.preferences?.needsVisaSponsorship ?? false,
    };
  }

  jobFeatures(job: Job): JobFeatures {
    const analysis = job.analysis ? JdAnalysisSchema.parse(job.analysis) : null;
    return {
      title: job.title,
      requiredSkills: job.requiredSkills,
      preferredSkills: job.preferredSkills,
      atsKeywords: analysis?.atsKeywords ?? [...job.requiredSkills, ...job.preferredSkills],
      minYears: job.minYears,
      maxYears: analysis?.maxYearsExperience ?? null,
      embedding: job.embedding,
      location: job.location,
      workMode: job.workMode,
      visaSponsorship: job.visaSponsorship,
      country: job.country,
    };
  }

  /** Ad-hoc match for the JD Analyzer (pasted JD, nothing persisted). */
  async matchAnalysis(userId: string, analysis: JdAnalysis, embedding: number[] = []): Promise<MatchResult> {
    const c = await this.candidateFeatures(userId);
    return computeMatch(c, {
      title: analysis.title ?? '',
      requiredSkills: analysis.requiredSkills,
      preferredSkills: analysis.preferredSkills,
      atsKeywords: analysis.atsKeywords,
      minYears: analysis.minYearsExperience ?? null,
      maxYears: analysis.maxYearsExperience ?? null,
      embedding,
      location: null,
      workMode: analysis.workMode ?? null,
      visaSponsorship: analysis.visaSponsorship ?? null,
      country: null,
    });
  }

  async matchJobForUser(userId: string, jobId: string): Promise<MatchResult> {
    const job = await this.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    const result = computeMatch(await this.candidateFeatures(userId), this.jobFeatures(job));
    await this.persist(userId, jobId, result);
    return result;
  }

  /**
   * Fan-out after a job is analyzed. Pre-filters candidates in SQL by skill overlap
   * (GIN-indexable `&&` on text[]), so cost stays O(relevant users), not O(all users).
   */
  async matchJobForAllUsers(jobId: string): Promise<Array<{ userId: string; score: number }>> {
    const job = await this.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    const skills = [...job.requiredSkills, ...job.preferredSkills];
    if (!skills.length) return [];
    const profiles = await this.prisma.candidateProfile.findMany({
      where: { skills: { hasSome: skills } },
      select: { userId: true },
      take: 5000,
    });
    const jf = this.jobFeatures(job);
    const out: Array<{ userId: string; score: number }> = [];
    for (const { userId } of profiles) {
      try {
        const result = computeMatch(await this.candidateFeatures(userId), jf);
        if (result.score >= 40) {
          await this.persist(userId, jobId, result);
          out.push({ userId, score: result.score });
        }
      } catch (e) {
        this.logger.warn(`match ${userId}/${jobId} failed: ${(e as Error).message}`);
      }
    }
    return out;
  }

  private persist(userId: string, jobId: string, r: MatchResult) {
    const data = {
      score: r.score,
      atsScore: r.atsScore,
      breakdown: r.breakdown,
      matchedSkills: r.matchedSkills,
      missingSkills: [...r.missingRequiredSkills, ...r.missingPreferredSkills],
      missingKeywords: r.missingKeywords,
      recommendations: r.recommendations,
    };
    return this.prisma.jobMatch.upsert({
      where: { userId_jobId: { userId, jobId } },
      update: data,
      create: { userId, jobId, ...data },
    });
  }
}
