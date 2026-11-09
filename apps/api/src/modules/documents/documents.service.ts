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
  templates,
} from '@copilot/shared';
import { PrismaService } from '../../core/prisma.service';
import { StorageService } from '../../core/storage.service';
import { AiService } from '../ai/ai.service';
import { prompts } from '@copilot/shared';
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

    let safe: TailoredResume;
    let flags: string[];
    let model = 'deterministic';
    if (this.ai.isConfigured()) {
      const out = await this.ai.generateJson(
        TailoredResumeSchema,
        prompts.tailorResume(resume.parsed, analysis, job.description, missing),
        { feature: 'resume.tailor', userId, temperature: 0.3, maxTokens: 6000, cache: false },
      );
      model = out.model;
      ({ resume: safe, flags } = enforceHonesty(resume.parsed, resume.rawText, out.data));
    } else {
      ({ resume: safe, flags } = templates.tailorResume(resume.parsed, resume.rawText, analysis));
    }

    const before = atsKeywordCoverage(resume.rawText, analysis.atsKeywords);
    const after = atsKeywordCoverage(tailoredToText(safe), analysis.atsKeywords);

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
    const { job, analysis, resume } = await this.context(userId, jobId);
    const { data, model } = this.ai.isConfigured()
      ? await this.ai.generateJson(
          CoverLetterSchema,
          prompts.coverLetter(resume.parsed, job.title, job.companyName, job.description, tone),
          { feature: 'cover-letter', userId, temperature: 0.6, cache: false },
        )
      : { data: templates.coverLetter(resume.parsed, job, analysis), model: 'deterministic' };
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
    const { data, model } = this.ai.isConfigured()
      ? await this.ai.generateJson(
          OutreachSchema,
          prompts.outreach(resume.parsed, job.title, job.companyName, recruiterName),
          { feature: 'outreach', userId, temperature: 0.6, cache: false },
        )
      : { data: templates.outreach(resume.parsed, job), model: 'deterministic' };
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
    const { data, model } = this.ai.isConfigured()
      ? await this.ai.generateJson(
          InterviewPrepSchema,
          prompts.interviewPrep(resume.parsed, analysis, job.title, job.companyName),
          { feature: 'interview-prep', userId, temperature: 0.4, maxTokens: 6000 },
        )
      : { data: templates.interviewPrep(resume.parsed, job, analysis), model: 'deterministic' };
    return this.prisma.generatedDocument.create({
      data: {
        userId, jobId, resumeId: resume.id, type: 'INTERVIEW_PREP',
        version: await this.nextVersion(userId, jobId, 'INTERVIEW_PREP'),
        content: json(data), model,
      },
    });
  }

  /**
   * Apply kit: everything needed to complete the employer's own application form, prefilled from
   * the user's profile. The user submits on the employer's site; nothing is submitted for them.
   */
  async applyKit(userId: string, jobId: string) {
    const [job, user, prefs] = await Promise.all([
      this.prisma.job.findUnique({ where: { id: jobId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } }),
      this.prisma.jobPreference.findUnique({ where: { userId } }),
    ]);
    if (!job) throw new NotFoundException('Job not found');
    const { parsed } = await this.resumes.parsedForUser(userId);
    const docs = await this.prisma.generatedDocument.findMany({
      where: { userId, jobId, type: { in: ['TAILORED_RESUME', 'COVER_LETTER'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, version: true, content: true },
    });
    const name = (parsed.fullName ?? user.name ?? '').trim();
    const [firstName, ...rest] = name.split(/\s+/);
    const link = (re: RegExp) => parsed.links.find((l) => re.test(l)) ?? null;
    const jobCountries = job.countries.length ? job.countries : job.country ? [job.country] : [];
    const authorized = prefs?.authorizedCountries ?? [];
    const authorizedHere = jobCountries.length ? jobCountries.some((c) => authorized.includes(c)) : null;
    const coverLetter = docs.find((d) => d.type === 'COVER_LETTER');
    return {
      job: { id: job.id, title: job.title, company: job.companyName, applyUrl: job.applyUrl ?? job.url, ats: job.ats },
      fields: {
        firstName: firstName ?? '',
        lastName: rest.join(' '),
        fullName: name,
        email: parsed.email ?? user.email,
        phone: parsed.phone ?? '',
        location: parsed.location ?? '',
        linkedin: link(/linkedin\.com/i),
        github: link(/github\.com/i),
        website: parsed.links.find((l) => !/linkedin|github/i.test(l)) ?? null,
        currentTitle: parsed.experience[0]?.title ?? parsed.headline ?? '',
        currentCompany: parsed.experience[0]?.company ?? '',
        yearsOfExperience: (await this.prisma.candidateProfile.findUnique({ where: { userId }, select: { totalYearsExp: true } }))?.totalYearsExp ?? null,
        authorizedToWork: authorizedHere,
        requiresSponsorship: authorizedHere === null ? null : !authorizedHere,
        willingToRelocate: prefs?.openToRelocation ?? null,
      },
      answers: {
        whyThisCompany: `I'm drawn to ${job.companyName} because the ${job.title} role lines up with what I do best: ${parsed.skills.slice(0, 4).join(', ')}.`,
        sponsorshipStatement:
          authorizedHere === false
            ? `I will require visa sponsorship to work in ${jobCountries.join(', ')}. ${job.visaStatus === 'SPONSORS' ? 'The posting indicates sponsorship is available.' : ''}`.trim()
            : authorizedHere
              ? 'I am authorized to work in this country and do not require sponsorship.'
              : null,
      },
      documents: {
        tailoredResumeId: docs.find((d) => d.type === 'TAILORED_RESUME')?.id ?? null,
        coverLetterId: coverLetter?.id ?? null,
        coverLetterText: (coverLetter?.content as { body?: string } | undefined)?.body ?? null,
      },
    };
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
