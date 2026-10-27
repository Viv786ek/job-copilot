import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { extractKnownSkills, normalizeSkills, ParsedResume, ParsedResumeSchema } from '@copilot/shared';
import { CacheService } from '../../core/cache.service';
import { PrismaService } from '../../core/prisma.service';
import { StorageService } from '../../core/storage.service';
import { AiService } from '../ai/ai.service';
import { prompts } from '../ai/prompts';
import { NotificationsService } from '../notifications/notifications.module';
import { QueueService } from '../queue/queue.module';
import { computeYearsOfExperience, scoreResumeHealth } from './resume-health';
import { extractText, MAX_RESUME_BYTES, sniffType } from './text-extractor';

const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

@Injectable()
export class ResumesService {
  private readonly logger = new Logger(ResumesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ai: AiService,
    private readonly queue: QueueService,
    private readonly cache: CacheService,
    private readonly notifications: NotificationsService,
  ) {}

  async upload(userId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (file.size > MAX_RESUME_BYTES) throw new BadRequestException('Resume must be 5 MB or smaller');
    const kind = sniffType(file.buffer);
    if (!kind) throw new BadRequestException('Only PDF and DOCX resumes are supported');

    const storageKey = this.storage.buildKey(userId, 'resumes', file.originalname);
    await this.storage.put(storageKey, file.buffer, MIME[kind]);
    const resume = await this.prisma.resume.create({
      data: { userId, fileName: file.originalname, mimeType: MIME[kind], storageKey, sizeBytes: file.size },
    });
    await this.queue.parseResume(resume.id);
    return resume;
  }

  /** Workflow 1: Resume Upload -> Parse -> Store Candidate Profile -> Extract Skills. Runs in the worker. */
  async process(resumeId: string): Promise<void> {
    const resume = await this.prisma.resume.update({ where: { id: resumeId }, data: { status: 'PARSING', errorMessage: null } });
    try {
      const buf = await this.storage.getBuffer(resume.storageKey);
      const rawText = await extractText(buf);
      const { data } = await this.ai.generateJson(ParsedResumeSchema, prompts.parseResume(rawText), {
        feature: 'resume.parse',
        userId: resume.userId,
        temperature: 0,
      });

      // Union of LLM skills and deterministic matches that literally appear in the text.
      const skills = normalizeSkills([
        ...data.skills,
        ...data.experience.flatMap((e) => e.skills),
        ...data.projects.flatMap((p) => p.skills),
        ...extractKnownSkills(rawText),
      ]);
      const parsed: ParsedResume = { ...data, skills };
      const health = scoreResumeHealth(parsed, rawText);
      const years = computeYearsOfExperience(parsed);
      const [embedding] = await this.ai.embed([this.profileText(parsed)]);

      await this.prisma.$transaction([
        this.prisma.resume.update({
          where: { id: resumeId },
          data: { status: 'PARSED', rawText, parsed: parsed as unknown as Prisma.InputJsonValue, healthScore: health.score, healthReport: health as unknown as Prisma.InputJsonValue },
        }),
        this.prisma.candidateProfile.upsert({
          where: { userId: resume.userId },
          update: {
            fullName: parsed.fullName,
            headline: parsed.headline ?? parsed.experience[0]?.title,
            location: parsed.location,
            summary: parsed.summary,
            totalYearsExp: years,
            skills,
            primaryRoles: [...new Set(parsed.experience.slice(0, 3).map((e) => e.title))],
            embedding: embedding ?? [],
            resumeHealth: health.score,
            activeResumeId: resumeId,
          },
          create: {
            userId: resume.userId,
            fullName: parsed.fullName,
            headline: parsed.headline,
            location: parsed.location,
            summary: parsed.summary,
            totalYearsExp: years,
            skills,
            primaryRoles: [...new Set(parsed.experience.slice(0, 3).map((e) => e.title))],
            embedding: embedding ?? [],
            resumeHealth: health.score,
            activeResumeId: resumeId,
          },
        }),
      ]);
      await this.cache.del(`dash:${resume.userId}`);
      await this.notifications.notify(
        resume.userId,
        'RESUME_PARSED',
        'Your resume is ready',
        `We found ${skills.length} skills and ${years} years of experience. Resume health: ${health.score}/100.`,
        { resumeId },
      );
      // Kick off job discovery for the freshly built profile.
      await this.queue.searchForUser(resume.userId);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Resume ${resumeId} failed: ${message}`);
      await this.prisma.resume.update({ where: { id: resumeId }, data: { status: 'FAILED', errorMessage: message.slice(0, 500) } });
      throw err;
    }
  }

  profileText(p: ParsedResume): string {
    return [
      p.headline,
      p.summary,
      `Skills: ${p.skills.join(', ')}`,
      ...p.experience.map((e) => `${e.title} at ${e.company}: ${e.bullets.join(' ')}`),
      ...p.projects.map((pr) => `${pr.name}: ${pr.description}`),
    ]
      .filter(Boolean)
      .join('\n');
  }

  list(userId: string) {
    return this.prisma.resume.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, fileName: true, status: true, healthScore: true, createdAt: true, errorMessage: true },
    });
  }

  async get(userId: string, id: string) {
    const r = await this.prisma.resume.findFirst({ where: { id, userId } });
    if (!r) throw new NotFoundException('Resume not found');
    return r;
  }

  async parsedForUser(userId: string, resumeId?: string): Promise<{ id: string; parsed: ParsedResume; rawText: string }> {
    const profile = await this.prisma.candidateProfile.findUnique({ where: { userId } });
    const id = resumeId ?? profile?.activeResumeId;
    if (!id) throw new BadRequestException('Upload a resume first');
    const r = await this.get(userId, id);
    if (r.status !== 'PARSED' || !r.parsed) throw new BadRequestException('Resume is still being processed');
    return { id: r.id, parsed: ParsedResumeSchema.parse(r.parsed), rawText: r.rawText ?? '' };
  }

  async setActive(userId: string, id: string) {
    const r = await this.get(userId, id);
    if (r.status !== 'PARSED') throw new BadRequestException('Only parsed resumes can be made active');
    await this.queue.parseResume(id); // re-derive the profile from this resume
    return { ok: true };
  }

  async reparse(userId: string, id: string) {
    await this.get(userId, id);
    await this.queue.parseResume(id);
    return { ok: true };
  }

  async downloadUrl(userId: string, id: string) {
    const r = await this.get(userId, id);
    return { url: await this.storage.signedDownloadUrl(r.storageKey, r.fileName) };
  }

  async remove(userId: string, id: string) {
    const r = await this.get(userId, id);
    await this.storage.delete(r.storageKey).catch(() => undefined);
    await this.prisma.resume.delete({ where: { id } });
    await this.prisma.candidateProfile.updateMany({ where: { userId, activeResumeId: id }, data: { activeResumeId: null } });
  }
}
