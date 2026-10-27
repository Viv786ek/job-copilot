import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType, Prisma } from '@prisma/client';
import {
  CoverLetterSchema,
  InterviewPrepSchema,
  JdAnalysis,
  JdAnalysisSchema,
  OutreachSchema,
  skillKey,
  TailoredResume,
  TailoredResumeSchema,
} from '@copilot/shared';
import { PrismaService } from '../../core/prisma.service';
import { StorageService } from '../../core/storage.service';
import { AiService } from '../ai/ai.service';
import { prompts } from '../ai/prompts';
import { JobsService } from '../jobs/jobs.service';
import { atsKeywordCoverage } from '../matching/matching.engine';
import { ResumesService } from '../resumes/resumes.service';
import { renderCoverLetterDocx, renderResumeDocx } from './docx-renderer';
import { enforceHonesty, tailoredToText } from './guardrails';

const json = (v: unknown) => v as Prisma.InputJsonValue;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly jobs: JobsService,
    private readonly resumes: ResumesService,
    private readonly storage: StorageService,
  ) {}

  private async context(userId: string, jobId: string, resumeId?: string) {
    const job = await this.jobs.ensureAnalysis(jobId);
    const analysis: JdAnalysis = JdAnalysisSchema.parse(job.analysis);
    const resume = await this.resumes.parsedForUser(userId, resumeId);
    return { job, analysis, resume };
  }

  private async nextVersion(userId: string, jobId: string, type: DocumentType) {
    const last = await this.prisma.generatedDocument.findFirst({
      where: { userId, jobId, type },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return (last?.version ?? 0) + 1;
  }

  /** Feature 3: Resume Optimizer. Generates, then enforces honesty guardrails, then scores ATS before/after. */
  async tailorResume(userId: string, jobId: string, resumeId?: string) {
    const { job, analysis, resume } = await this.context(userId, jobId, resumeId);
    const have = new Set(resume.parsed.skills.map(skillKey));
    const missing = [...analysis.requiredSkills, ...analysis.preferredSkills].filter((s) => !have.has(skillKey(s)));

    const { data, model } = await this.ai.generateJson(
      TailoredResumeSchema,
      prompts.tailorResume(resume.parsed, analysis, job.description, missing),
      { feature: 'resume.tailor', userId, temperature: 0.3, maxTokens: 6000, cache: false },
    );
    const { resume: safe, flags } = enforceHonesty(resume.parsed, resume.rawText, data);

    const before = atsKeywordCoverage(resume.rawText, analysis.atsKeywords, have);
    const after = atsKeywordCoverage(tailoredToText(safe), analysis.atsKeywords, have);

    return this.prisma.generatedDocument.create({
      data: {
        userId,
        jobId,
        resumeId: resume.id,
        type: 'TAILORED_RESUME',
        version: await this.nextVersion(userId, jobId, 'TAILORED_RESUME'),
        content: json({ ...safe, missingSkills: missing }),
        atsScoreBefore: Math.round(before.ratio * 100),
        atsScoreAfter: Math.round(after.ratio * 100),
        guardrailFlags: flags,
        model,
      },
    });
  }

  /** Feature 4: Cover Letter Generator. */
  async coverLetter(userId: string, jobId: string, tone = 'confident and warm') {
    const { job, resume } = await this.context(userId, jobId);
    const { data, model } = await this.ai.generateJson(
      CoverLetterSchema,
      prompts.coverLetter(resume.parsed, job.title, job.companyName, job.description, tone),
      { feature: 'cover-letter', userId, temperature: 0.6, cache: false },
    );
    return this.prisma.generatedDocument.create({
      data: {
        userId, jobId, resumeId: resume.id, type: 'COVER_LETTER',
        version: await this.nextVersion(userId, jobId, 'COVER_LETTER'),
        content: json(data), model,
      },
    });
  }

  /** Feature 5: Recruiter outreach (LinkedIn note + message, email, two follow-ups). */
  async outreach(userId: string, jobId: string, recruiterName?: string) {
    const { job, resume } = await this.context(userId, jobId);
    const { data, model } = await this.ai.generateJson(
      OutreachSchema,
      prompts.outreach(resume.parsed, job.title, job.companyName, recruiterName),
      { feature: 'outreach', userId, temperature: 0.6, cache: false },
    );
    data.linkedinConnectionNote = data.linkedinConnectionNote.slice(0, 300);
    return this.prisma.generatedDocument.create({
      data: {
        userId, jobId, resumeId: resume.id, type: 'RECRUITER_EMAIL',
        version: await this.nextVersion(userId, jobId, 'RECRUITER_EMAIL'),
        content: json(data), model,
      },
    });
  }

  /** Feature 6: Interview preparation. Cached per (resume, job) since it is deterministic enough. */
  async interviewPrep(userId: string, jobId: string) {
    const { job, analysis, resume } = await this.context(userId, jobId);
    const { data, model } = await this.ai.generateJson(
      InterviewPrepSchema,
      prompts.interviewPrep(resume.parsed, analysis, job.title, job.companyName),
      { feature: 'interview-prep', userId, temperature: 0.4, maxTokens: 6000 },
    );
    return this.prisma.generatedDocument.create({
      data: {
        userId, jobId, resumeId: resume.id, type: 'INTERVIEW_PREP',
        version: await this.nextVersion(userId, jobId, 'INTERVIEW_PREP'),
        content: json(data), model,
      },
    });
  }

  list(userId: string, filters: { jobId?: string; type?: DocumentType }) {
    return this.prisma.generatedDocument.findMany({
      where: { userId, ...filters },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { job: { select: { id: true, title: true, companyName: true } } },
    });
  }

  async get(userId: string, id: string) {
    const doc = await this.prisma.generatedDocument.findFirst({
      where: { id, userId },
      include: { job: { select: { id: true, title: true, companyName: true, url: true } } },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  /** User edits are saved as-is (they own their words); resume edits are re-validated for shape. */
  async update(userId: string, id: string, content: unknown) {
    const doc = await this.get(userId, id);
    if (doc.type === 'TAILORED_RESUME') TailoredResumeSchema.parse(content);
    return this.prisma.generatedDocument.update({ where: { id }, data: { content: json(content), storageKey: null } });
  }

  async docxUrl(userId: string, id: string) {
    const doc = await this.get(userId, id);
    if (doc.type !== 'TAILORED_RESUME' && doc.type !== 'COVER_LETTER') throw new BadRequestException('Only resumes and cover letters can be exported');
    let key = doc.storageKey;
    const base = `${doc.job?.companyName ?? 'Company'}-${doc.type === 'TAILORED_RESUME' ? 'Resume' : 'Cover-Letter'}-v${doc.version}.docx`.replace(/\s+/g, '-');
    if (!key) {
      let buf: Buffer;
      if (doc.type === 'TAILORED_RESUME') {
        const { parsed } = await this.resumes.parsedForUser(userId, doc.resumeId ?? undefined);
        buf = await renderResumeDocx(TailoredResumeSchema.parse(doc.content) as TailoredResume, parsed);
      } else {
        buf = await renderCoverLetterDocx(CoverLetterSchema.parse(doc.content));
      }
      key = this.storage.buildKey(userId, 'documents', base);
      await this.storage.put(key, buf, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      await this.prisma.generatedDocument.update({ where: { id }, data: { storageKey: key } });
    }
    return { url: await this.storage.signedDownloadUrl(key, base) };
  }

  /**
   * Workflow 3 tail: auto-create an application draft with tailored resume + cover letter.
   * Idempotent per (user, job).
   */
  async createApplicationDraft(userId: string, jobId: string) {
    const existing = await this.prisma.application.findFirst({ where: { userId, jobId } });
    if (existing) return existing;
    const job = await this.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    const match = await this.prisma.jobMatch.findUnique({ where: { userId_jobId: { userId, jobId } } });
    const app = await this.prisma.application.create({
      data: {
        userId, jobId, company: job.companyName, role: job.title, source: job.source, jobUrl: job.url,
        status: 'DRAFT', matchScore: match?.score,
        events: { create: { type: 'CREATED', toStatus: 'DRAFT', message: 'Draft created automatically from a high-match job' } },
      },
    });
    const [resume, letter] = await Promise.all([this.tailorResume(userId, jobId), this.coverLetter(userId, jobId)]);
    await this.prisma.generatedDocument.updateMany({ where: { id: { in: [resume.id, letter.id] } }, data: { applicationId: app.id } });
    return app;
  }
}
