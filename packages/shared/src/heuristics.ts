import type { JdAnalysis } from './schemas';
import { extractKnownSkills } from './skills';

/**
 * Deterministic JD analyzer: no LLM, no network. Powers the static demo and serves as a
 * degraded-mode fallback. Accuracy is lower than the LLM analyzer, but it is honest:
 * it only reports skills that literally appear in the text.
 */
const PREFERRED_HEADING =
  /(nice[- ]to[- ]have|preferred( qualifications| skills)?|good[- ]to[- ]have|bonus( points)?|pluses|would be a plus|desirable)/i;

export function analyzeJdHeuristic(description: string, title?: string): JdAnalysis {
  const idx = description.search(PREFERRED_HEADING);
  const requiredPart = idx > 0 ? description.slice(0, idx) : description;
  const preferredPart = idx > 0 ? description.slice(idx) : '';

  const requiredSkills = extractKnownSkills(requiredPart);
  const preferredSkills = extractKnownSkills(preferredPart).filter((s) => !requiredSkills.includes(s));

  const years = /(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*(\d{1,2}))?\s*\+?\s*(?:years|yrs)/i.exec(description);
  const minYears = years ? Number(years[1]) : null;
  const maxYears = years?.[2] ? Number(years[2]) : null;

  const t = `${title ?? ''} ${description.slice(0, 400)}`.toLowerCase();
  const seniority: JdAnalysis['seniority'] = /\bintern(ship)?\b/.test(t)
    ? 'INTERN'
    : /\b(principal|staff)\b/.test(t)
      ? 'PRINCIPAL'
      : /\b(lead|manager)\b/.test(t)
        ? 'LEAD'
        : /\b(senior|sr\.?)\b/.test(t) || (minYears ?? 0) >= 5
          ? 'SENIOR'
          : /\b(junior|jr\.?|fresher|graduate|entry)\b/.test(t) || (minYears != null && minYears <= 1)
            ? 'ENTRY'
            : minYears != null
              ? 'MID'
              : 'UNKNOWN';

  const lower = description.toLowerCase();
  const workMode: JdAnalysis['workMode'] = /\bhybrid\b/.test(lower)
    ? 'HYBRID'
    : /\b(remote|work from home|wfh)\b/.test(lower)
      ? 'REMOTE'
      : /\b(on-?site|work from office|in office)\b/.test(lower)
        ? 'ONSITE'
        : null;
  const visaSponsorship = /(no|not|unable to|cannot)\s+(offer|provide|sponsor)[^.]{0,30}(visa|sponsorship)/.test(lower)
    ? false
    : /(visa sponsorship (is )?(available|provided|offered)|we (will )?sponsor|sponsorship available)/.test(lower)
      ? true
      : null;

  const responsibilities = description
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-•*·]\s+/.test(l))
    .map((l) => l.replace(/^[-•*·]\s+/, ''))
    .slice(0, 8);

  const atsKeywords = [...new Set([...requiredSkills, ...preferredSkills, ...(title ? [title.trim()] : [])])];

  return {
    title: title ?? null,
    seniority,
    requiredSkills,
    preferredSkills,
    minYearsExperience: minYears,
    maxYearsExperience: maxYears,
    responsibilities,
    keywords: atsKeywords,
    atsKeywords,
    educationRequirements: /\b(b\.?tech|b\.?e\.?|bachelor'?s?|master'?s?|m\.?tech|degree)\b/i.test(description) ? ['Degree mentioned'] : [],
    visaSponsorship,
    workMode,
  };
}
