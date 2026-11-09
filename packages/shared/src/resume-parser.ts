import type { ParsedResume } from './schemas';
import { extractKnownSkills, normalizeSkills } from './skills';

/**
 * Deterministic resume parser (no LLM, no network). Used directly by the browser edition and
 * as the server fallback when no AI provider is configured. Sections are found by headings,
 * roles by date ranges, skills by the taxonomy plus the resume's own Skills section.
 */

type Section = 'header' | 'summary' | 'skills' | 'experience' | 'education' | 'projects' | 'certifications' | 'other';

const HEADINGS: Array<[RegExp, Section]> = [
  [/^(professional |career )?(summary|profile|objective|about( me)?)$/i, 'summary'],
  [/^(technical |core |key )?(skills|competencies|technologies|tech stack|tools( & technologies)?|skills (&|and) (tools|technologies))$/i, 'skills'],
  [/^(professional |work |employment |relevant )?(experience|history|employment)( history)?$/i, 'experience'],
  [/^(education|academic (background|qualifications)|qualifications)$/i, 'education'],
  [/^(personal |academic |key |selected )?projects$/i, 'projects'],
  [/^(certifications?|licenses?( (&|and) certifications)?|courses|training)$/i, 'certifications'],
  [/^(achievements|awards|languages|interests|hobbies|publications|volunteer(ing)?|references)$/i, 'other'],
];

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december';
const DATE = `(?:(?:${MONTHS})[a-z]*\\.?\\s*['’]?\\d{2,4}|\\d{1,2}[/.-]\\d{2,4}|\\d{4})`;
const RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to|until)\\s*(${DATE}|present|current|now|till date|today|ongoing)`, 'i');
const BULLET = /^\s*([•●▪◦‣∙*·-]|\d+[.)])\s+/;
const TITLE_WORDS = /\b(engineer|developer|manager|analyst|scientist|designer|intern|lead|architect|consultant|specialist|director|administrator|officer|associate|head|vp|president|founder|programmer|tester|qa|devops|sre|executive|coordinator|trainee)\b/i;
const DEGREE = /\b(b\.?\s?tech|b\.?\s?e\.?|b\.?\s?sc|bachelor|m\.?\s?tech|m\.?\s?sc|master|mba|ph\.?d|diploma|bca|mca|b\.?com|m\.?com|associate degree|high school|hsc|ssc|12th|10th)\b/i;

const MONTH_NUM: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const monthIndex = (m: string) => MONTH_NUM[m.toLowerCase().slice(0, 3)] ?? 1;

function toYm(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (/present|current|now|till|today|ongoing/.test(s)) return null;
  let m = new RegExp(`^(${MONTHS})[a-z]*\\.?\\s*['’]?(\\d{2,4})$`, 'i').exec(s);
  if (m) {
    const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return `${y}-${String(monthIndex(m[1])).padStart(2, '0')}`;
  }
  m = /^(\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return `${y}-${String(Math.min(12, Number(m[1]))).padStart(2, '0')}`;
  }
  m = /^(\d{4})$/.exec(s);
  return m ? `${m[1]}-01` : null;
}

function headingOf(line: string): Section | null {
  const clean = line.replace(/[:|_=#*]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length > 40 || clean.split(' ').length > 5) return null;
  for (const [re, sec] of HEADINGS) if (re.test(clean)) return sec;
  return null;
}

function splitTitleCompany(text: string): { title: string; company: string } {
  const cleaned = text.replace(/\s{2,}/g, ' ').replace(/[,|–—-]\s*$/, '').trim();
  const parts = cleaned.split(/\s+(?:at|@)\s+|\s*[|,–—]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const [a, b] = parts;
    return TITLE_WORDS.test(a) || !TITLE_WORDS.test(b) ? { title: a, company: b } : { title: b, company: a };
  }
  return TITLE_WORDS.test(cleaned) ? { title: cleaned, company: '' } : { title: '', company: cleaned };
}

export function parseResumeText(raw: string): ParsedResume {
  const text = raw.replace(/\r/g, '').replace(/[ \t]+/g, ' ');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const email = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(text)?.[0] ?? null;
  const phone = /(\+?\d[\d\s().-]{8,}\d)/.exec(text)?.[1]?.replace(/\s+/g, ' ').trim() ?? null;
  const links = [...new Set((text.match(/(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in|github\.com|gitlab\.com|behance\.net|dribbble\.com|medium\.com)\/[\w\-./%]+/gi) ?? []).map((l) => l.replace(/[).,]+$/, '')))];

  const sections: Record<Section, string[]> = { header: [], summary: [], skills: [], experience: [], education: [], projects: [], certifications: [], other: [] };
  let current: Section = 'header';
  for (const line of lines) {
    const h = headingOf(line);
    if (h) {
      current = h;
      continue;
    }
    sections[current].push(line);
  }

  const fullName =
    sections.header.find((l) => !l.includes('@') && !/\d{3}/.test(l) && /^[\p{L} .'-]{3,50}$/u.test(l) && l.split(' ').length <= 5) ?? null;
  const headline = sections.header.find((l) => l !== fullName && TITLE_WORDS.test(l) && l.length < 90) ?? null;
  const location =
    sections.header
      .flatMap((l) => l.split(/[|•·]/))
      .map((s) => s.trim())
      .find((s) => /^[\p{L} .'-]+,\s*[\p{L} .'-]+$/u.test(s) && !s.includes('@')) ?? null;

  // ---------- Experience ----------
  const experience: ParsedResume['experience'] = [];
  const exp = sections.experience;
  for (let i = 0; i < exp.length; i++) {
    const m = RANGE.exec(exp[i]);
    if (!m) {
      const cur = experience[experience.length - 1];
      if (cur) {
        const isBullet = BULLET.test(exp[i]);
        const body = exp[i].replace(BULLET, '').trim();
        if (isBullet || body.length > 50) cur.bullets.push(body);
        else if (cur.bullets.length) cur.bullets[cur.bullets.length - 1] += ` ${body}`;
        else if (!cur.company) cur.company = body;
        else if (!cur.title) cur.title = body;
      }
      continue;
    }
    const rest = exp[i].replace(m[0], '').replace(/[()|,–—-]\s*$/, '').trim();
    let { title, company } = splitTitleCompany(rest);
    // Title/company often sit on the line above the dates.
    const prev = i > 0 && !RANGE.test(exp[i - 1]) && !BULLET.test(exp[i - 1]) ? exp[i - 1] : '';
    if ((!title || !company) && prev) {
      const fromPrev = splitTitleCompany(prev);
      title = title || fromPrev.title || fromPrev.company;
      company = company || (fromPrev.title ? fromPrev.company : '') || '';
      const last = experience[experience.length - 1];
      if (last && last.bullets[last.bullets.length - 1] === prev) last.bullets.pop();
    }
    const end = toYm(m[2]);
    experience.push({
      company: company || 'Company',
      title: title || 'Role',
      location: null,
      startDate: toYm(m[1]),
      endDate: end,
      current: end === null,
      bullets: [],
      skills: [],
    });
  }
  for (const e of experience) e.skills = extractKnownSkills(`${e.title} ${e.bullets.join(' ')}`);

  // ---------- Education ----------
  const education: ParsedResume['education'] = [];
  for (let i = 0; i < sections.education.length; i++) {
    const line = sections.education[i];
    const range = RANGE.exec(line) ?? new RegExp(`(${DATE})`).exec(line);
    if (DEGREE.test(line) || /\b(university|college|institute|school|iit|nit)\b/i.test(line)) {
      const parts = line.replace(range?.[0] ?? '', '').split(/[|,–—]| - /).map((p) => p.trim()).filter(Boolean);
      const degreePart = parts.find((p) => DEGREE.test(p)) ?? null;
      const inst = parts.find((p) => /\b(university|college|institute|school|iit|nit|academy)\b/i.test(p)) ?? parts.find((p) => p !== degreePart) ?? '';
      const grade = /(\d(\.\d+)?\s*(cgpa|gpa|\/\s*10))|(\d{2}(\.\d+)?\s*%)/i.exec(line)?.[0] ?? null;
      const prevEdu = education[education.length - 1];
      if (prevEdu && !prevEdu.degree && degreePart && !inst) prevEdu.degree = degreePart;
      else education.push({ institution: inst || degreePart || line, degree: degreePart, field: null, startDate: range?.[1] ?? null, endDate: range?.[2] ?? null, grade });
    }
  }

  // ---------- Projects ----------
  const projects: ParsedResume['projects'] = [];
  for (const line of sections.projects) {
    if (!BULLET.test(line) && line.length < 90 && !projects.at(-1)?.description.endsWith(',')) {
      const [name, ...desc] = line.split(/\s[|–—:-]\s|:\s/);
      projects.push({ name: name.trim(), description: desc.join(' ').trim(), skills: [], url: null });
    } else if (projects.length) {
      const p = projects[projects.length - 1];
      p.description = `${p.description} ${line.replace(BULLET, '')}`.trim();
    }
  }
  for (const p of projects) p.skills = extractKnownSkills(`${p.name} ${p.description}`);

  const certifications = sections.certifications
    .map((l) => l.replace(BULLET, '').trim())
    .filter((l) => l.length > 3)
    .map((l) => {
      const date = /\b(19|20)\d{2}\b/.exec(l)?.[0] ?? null;
      const withoutDate = l.replace(/[,(]?\s*\b(19|20)\d{2}\b\)?\s*$/, '').trim();
      // "Name | Issuer" or "Name, issued by Issuer"; dashes stay part of the name ("Developer – Associate").
      const [name, issuer] = withoutDate.split(/\s\|\s|,\s*(?:issued by\s+)?(?=(?:amazon|aws|google|microsoft|oracle|meta|ibm|cisco|coursera|udemy|linux foundation|cncf|hashicorp|scrum\.org|pmi)\b)/i);
      return { name: name.trim(), issuer: issuer?.trim() ?? null, date };
    });

  // ---------- Skills: the resume's own list plus taxonomy matches anywhere ----------
  const listed = sections.skills
    .flatMap((l) => l.replace(BULLET, '').replace(/^[^:]{1,40}:\s*/, '').split(/[,|•·;/]/))
    .map((s) => s.replace(/\(.*?\)/g, '').trim())
    .filter((s) => s.length > 1 && s.length < 40 && s.split(' ').length <= 4);
  const skills = normalizeSkills([...listed, ...extractKnownSkills(text)]);

  const summary = sections.summary.join(' ').trim() || null;

  return {
    fullName,
    email,
    phone,
    location,
    headline: headline ?? experience[0]?.title ?? null,
    summary,
    links,
    skills,
    experience,
    education,
    projects,
    certifications,
  };
}
