export const APPLICATION_STATUSES = [
  'DRAFT',
  'APPLIED',
  'SCREENING',
  'INTERVIEWING',
  'OFFER',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'GHOSTED',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const JOB_SOURCES = [
  'LINKEDIN',
  'NAUKRI',
  'INSTAHYRE',
  'WELLFOUND',
  'INDEED',
  'HIRIST',
  'FOUNDIT',
  'CAREER_PAGE',
  'GREENHOUSE',
  'LEVER',
  'ASHBY',
  'REMOTIVE',
  'REMOTEOK',
  'ADZUNA',
  'MANUAL',
] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export const WORK_MODES = ['REMOTE', 'HYBRID', 'ONSITE'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const DOCUMENT_TYPES = [
  'TAILORED_RESUME',
  'COVER_LETTER',
  'LINKEDIN_MESSAGE',
  'RECRUITER_EMAIL',
  'FOLLOW_UP_EMAIL',
  'INTERVIEW_PREP',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const AI_PROVIDERS = ['openai', 'anthropic', 'gemini'] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];
