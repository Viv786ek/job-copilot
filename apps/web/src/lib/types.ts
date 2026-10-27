import type { ApplicationStatus, JdAnalysis, MatchResult } from '@copilot/shared';

export type { ApplicationStatus, JdAnalysis, MatchResult };

export interface JobSummary {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  workMode: 'REMOTE' | 'HYBRID' | 'ONSITE' | null;
  source: string;
  url: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  visaSponsorship: boolean | null;
  postedAt: string | null;
}

export interface JobMatchRow {
  id: string;
  score: number;
  atsScore: number;
  breakdown: Record<string, number>;
  matchedSkills: string[];
  missingSkills: string[];
  missingKeywords: string[];
  recommendations: string[];
  saved: boolean;
  job: JobSummary;
}

export interface FeedResponse {
  items: JobMatchRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Resume {
  id: string;
  fileName: string;
  status: 'UPLOADED' | 'PARSING' | 'PARSED' | 'FAILED';
  healthScore: number | null;
  createdAt: string;
  errorMessage: string | null;
  parsed?: unknown;
  healthReport?: { score: number; checks: Array<{ id: string; label: string; passed: boolean; tip: string; weight: number }> };
}

export interface Application {
  id: string;
  jobId: string | null;
  company: string;
  role: string;
  source: string;
  jobUrl: string | null;
  status: ApplicationStatus;
  appliedAt: string | null;
  followUpAt: string | null;
  recruiterName: string | null;
  recruiterEmail: string | null;
  notes: string | null;
  matchScore: number | null;
  updatedAt: string;
  interviews: Array<{ id: string; round: string; scheduledAt: string; outcome: string | null }>;
}

export interface GeneratedDoc {
  id: string;
  type: 'TAILORED_RESUME' | 'COVER_LETTER' | 'RECRUITER_EMAIL' | 'INTERVIEW_PREP' | 'LINKEDIN_MESSAGE' | 'FOLLOW_UP_EMAIL';
  version: number;
  content: any;
  atsScoreBefore: number | null;
  atsScoreAfter: number | null;
  guardrailFlags: string[];
  createdAt: string;
  job?: { id: string; title: string; companyName: string; url?: string } | null;
}

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
