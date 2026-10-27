import { z } from 'zod';

/* ---------------- Resume parsing ---------------- */
export const ExperienceItemSchema = z.object({
  company: z.string(),
  title: z.string(),
  location: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(), // YYYY-MM
  endDate: z.string().nullable().optional(), // YYYY-MM, null when current
  current: z.boolean().default(false),
  bullets: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
});
export type ExperienceItem = z.infer<typeof ExperienceItemSchema>;

export const EducationItemSchema = z.object({
  institution: z.string(),
  degree: z.string().nullable().optional(),
  field: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  grade: z.string().nullable().optional(),
});

export const ProjectItemSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  skills: z.array(z.string()).default([]),
  url: z.string().nullable().optional(),
});

export const CertificationItemSchema = z.object({
  name: z.string(),
  issuer: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
});

export const ParsedResumeSchema = z.object({
  fullName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  headline: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  links: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  experience: z.array(ExperienceItemSchema).default([]),
  education: z.array(EducationItemSchema).default([]),
  projects: z.array(ProjectItemSchema).default([]),
  certifications: z.array(CertificationItemSchema).default([]),
});
export type ParsedResume = z.infer<typeof ParsedResumeSchema>;

/* ---------------- JD analysis ---------------- */
export const JdAnalysisSchema = z.object({
  title: z.string().nullable().optional(),
  seniority: z
    .enum(['INTERN', 'ENTRY', 'MID', 'SENIOR', 'LEAD', 'PRINCIPAL', 'UNKNOWN'])
    .default('UNKNOWN'),
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  minYearsExperience: z.number().nullable().optional(),
  maxYearsExperience: z.number().nullable().optional(),
  responsibilities: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  atsKeywords: z.array(z.string()).default([]),
  educationRequirements: z.array(z.string()).default([]),
  visaSponsorship: z.boolean().nullable().optional(),
  workMode: z.enum(['REMOTE', 'HYBRID', 'ONSITE']).nullable().optional(),
});
export type JdAnalysis = z.infer<typeof JdAnalysisSchema>;

/* ---------------- Match result ---------------- */
export const MatchBreakdownSchema = z.object({
  requiredSkills: z.number(),
  preferredSkills: z.number(),
  experience: z.number(),
  title: z.number(),
  semantic: z.number(),
  location: z.number(),
});
export type MatchBreakdown = z.infer<typeof MatchBreakdownSchema>;

export const MatchResultSchema = z.object({
  score: z.number().min(0).max(100),
  atsScore: z.number().min(0).max(100),
  breakdown: MatchBreakdownSchema,
  matchedSkills: z.array(z.string()),
  missingRequiredSkills: z.array(z.string()),
  missingPreferredSkills: z.array(z.string()),
  matchedKeywords: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  recommendations: z.array(z.string()),
});
export type MatchResult = z.infer<typeof MatchResultSchema>;

/* ---------------- Tailored resume ---------------- */
export const TailoredResumeSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  skills: z.array(z.string()),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
      current: z.boolean().default(false),
      location: z.string().nullable().optional(),
      bullets: z.array(z.string()),
    }),
  ),
  projects: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        skills: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  education: z.array(EducationItemSchema).default([]),
  certifications: z.array(CertificationItemSchema).default([]),
  changeLog: z.array(z.string()).default([]),
});
export type TailoredResume = z.infer<typeof TailoredResumeSchema>;

/* ---------------- Outreach, cover letter, interview ---------------- */
export const OutreachSchema = z.object({
  linkedinConnectionNote: z.string(),
  linkedinMessage: z.string(),
  recruiterEmail: z.object({ subject: z.string(), body: z.string() }),
  followUpEmails: z.array(
    z.object({ sendAfterDays: z.number(), subject: z.string(), body: z.string() }),
  ),
});
export type Outreach = z.infer<typeof OutreachSchema>;

export const CoverLetterSchema = z.object({ subject: z.string(), body: z.string() });
export type CoverLetter = z.infer<typeof CoverLetterSchema>;

export const InterviewPrepSchema = z.object({
  technical: z.array(
    z.object({ question: z.string(), whyAsked: z.string(), answerHints: z.array(z.string()) }),
  ),
  behavioral: z.array(z.object({ question: z.string(), starStoryFromResume: z.string() })),
  systemDesign: z.array(z.object({ question: z.string(), keyPoints: z.array(z.string()) })),
  companySpecific: z.array(z.string()),
  questionsToAsk: z.array(z.string()),
});
export type InterviewPrep = z.infer<typeof InterviewPrepSchema>;
