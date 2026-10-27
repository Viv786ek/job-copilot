import type { ParsedResume } from './schemas';

export interface HealthCheck {
  id: string;
  label: string;
  passed: boolean;
  weight: number;
  tip: string;
}

export interface HealthReport {
  score: number;
  checks: HealthCheck[];
}

const ACTION_VERBS =
  /^(built|led|designed|developed|implemented|architected|optimized|reduced|increased|improved|migrated|launched|automated|delivered|owned|created|scaled|mentored|drove|shipped|integrated|refactored|analyzed|deployed)\b/i;
const METRIC = /(\d+%|\d+x|\$\s?\d|₹\s?\d|\d+\s?(ms|s|k|m|users|requests|rps|hrs|hours|days))/i;

/** Rule-based resume health score (0-100). Deterministic so users can see exactly what moves it. */
export function scoreResumeHealth(r: ParsedResume, rawText: string): HealthReport {
  const bullets = r.experience.flatMap((e) => e.bullets);
  const words = rawText.split(/\s+/).length;
  const metricRatio = bullets.length ? bullets.filter((b) => METRIC.test(b)).length / bullets.length : 0;
  const verbRatio = bullets.length ? bullets.filter((b) => ACTION_VERBS.test(b.trim())).length / bullets.length : 0;

  const checks: HealthCheck[] = [
    { id: 'contact', label: 'Email and phone present', passed: !!r.email && !!r.phone, weight: 10, tip: 'Add a professional email and phone number at the top.' },
    { id: 'links', label: 'LinkedIn / GitHub / portfolio link', passed: r.links.length > 0, weight: 5, tip: 'Add your LinkedIn and GitHub (or portfolio) URLs.' },
    { id: 'summary', label: 'Professional summary', passed: (r.summary ?? '').length >= 80, weight: 10, tip: 'Add a 2-3 line summary naming your role, years of experience and core stack.' },
    { id: 'skills', label: '8+ distinct skills listed', passed: r.skills.length >= 8, weight: 15, tip: 'List the tools and technologies you actually use in a dedicated Skills section.' },
    { id: 'experience', label: 'Experience with dated roles', passed: r.experience.length > 0 && r.experience.every((e) => !!e.startDate), weight: 15, tip: 'Give every role a start and end month so ATS can compute your experience.' },
    { id: 'bullets', label: '3+ bullets per role', passed: r.experience.length > 0 && r.experience.every((e) => e.bullets.length >= 3), weight: 10, tip: 'Describe each role with 3-6 achievement bullets.' },
    { id: 'metrics', label: 'Quantified impact (40%+ of bullets)', passed: metricRatio >= 0.4, weight: 15, tip: 'Add real numbers you can stand behind: latency, users, revenue, time saved.' },
    { id: 'verbs', label: 'Bullets start with action verbs', passed: verbRatio >= 0.6, weight: 10, tip: 'Start bullets with verbs like Built, Led, Reduced, Automated.' },
    { id: 'length', label: 'Length 350-1100 words', passed: words >= 350 && words <= 1100, weight: 5, tip: words < 350 ? 'Your resume is thin; expand on projects and impact.' : 'Trim to 1-2 pages; remove older or less relevant detail.' },
    { id: 'education', label: 'Education listed', passed: r.education.length > 0, weight: 5, tip: 'Include your highest degree and institution.' },
  ];

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0);
  return { score: Math.round((got / total) * 100), checks };
}

/** Total experience in years, merging overlapping date ranges. */
export function computeYearsOfExperience(r: ParsedResume, now = new Date()): number {
  const toMonth = (s?: string | null): number | null => {
    if (!s) return null;
    const m = /^(\d{4})(?:-(\d{1,2}))?/.exec(s);
    return m ? Number(m[1]) * 12 + (Number(m[2] ?? 1) - 1) : null;
  };
  const nowM = now.getFullYear() * 12 + now.getMonth();
  const ranges = r.experience
    .map((e) => [toMonth(e.startDate), e.current || !e.endDate ? nowM : toMonth(e.endDate)] as const)
    .filter((x): x is readonly [number, number] => x[0] != null && x[1] != null && x[1] >= x[0])
    .sort((a, b) => a[0] - b[0]);
  let months = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [s, e] of ranges) {
    if (s > curEnd) {
      if (curEnd >= 0) months += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else curEnd = Math.max(curEnd, e);
  }
  if (curEnd >= 0) months += curEnd - curStart;
  return Math.round((months / 12) * 10) / 10;
}
