import { ParsedResume, skillKey, TailoredResume } from '@copilot/shared';

export interface GuardrailResult {
  resume: TailoredResume;
  flags: string[];
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Post-generation honesty enforcement. LLM instructions are not a guarantee, so every
 * tailored resume is checked against the parsed source before it is shown to the user:
 *  - skills not present in the source are removed
 *  - roles not present in the source are dropped; company/title/dates are restored from source
 *  - bullets that introduce numbers absent from the source text are removed (no invented metrics)
 *  - education and certifications are always copied from the source verbatim
 */
export function enforceHonesty(source: ParsedResume, sourceText: string, draft: TailoredResume): GuardrailResult {
  const flags: string[] = [];
  const have = new Set(source.skills.map(skillKey));
  const lowerText = sourceText.toLowerCase();

  const skills = draft.skills.filter((s) => {
    const ok = have.has(skillKey(s)) || lowerText.includes(s.toLowerCase());
    if (!ok) flags.push(`Removed skill not found in your resume: ${s}`);
    return ok;
  });

  const sourceNumbers = new Set((sourceText.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '')));
  const bulletIsHonest = (b: string) =>
    (b.match(/\d+(?:[.,]\d+)?/g) ?? []).every((n) => sourceNumbers.has(n.replace(',', '')));

  const experience: TailoredResume['experience'] = [];
  for (const e of draft.experience) {
    const original = source.experience.find((o) => norm(o.company) === norm(e.company)) ??
      source.experience.find((o) => norm(o.company).includes(norm(e.company)) || norm(e.company).includes(norm(o.company)));
    if (!original) {
      flags.push(`Removed role not found in your resume: ${e.title} at ${e.company}`);
      continue;
    }
    const bullets = e.bullets.filter((b) => {
      const ok = bulletIsHonest(b);
      if (!ok) flags.push(`Removed bullet with a metric not in your resume: "${b.slice(0, 80)}…"`);
      return ok;
    });
    experience.push({
      company: original.company,
      title: original.title,
      startDate: original.startDate ?? null,
      endDate: original.endDate ?? null,
      current: original.current,
      location: original.location ?? null,
      bullets: bullets.length ? bullets : original.bullets,
    });
  }
  // Never silently drop a real role the model omitted.
  for (const o of source.experience) {
    if (!experience.some((e) => norm(e.company) === norm(o.company) && norm(e.title) === norm(o.title))) {
      experience.push({
        company: o.company,
        title: o.title,
        startDate: o.startDate ?? null,
        endDate: o.endDate ?? null,
        current: o.current,
        location: o.location ?? null,
        bullets: o.bullets,
      });
    }
  }
  experience.sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || (b.startDate ?? '').localeCompare(a.startDate ?? ''));

  const sourceProjects = new Set(source.projects.map((p) => norm(p.name)));
  const projects = draft.projects.filter((p) => {
    const ok = sourceProjects.has(norm(p.name));
    if (!ok) flags.push(`Removed project not found in your resume: ${p.name}`);
    return ok;
  });

  return {
    resume: {
      ...draft,
      skills,
      experience,
      projects,
      education: source.education,
      certifications: source.certifications,
    },
    flags,
  };
}

export function tailoredToText(r: TailoredResume): string {
  return [
    r.headline,
    r.summary,
    r.skills.join(', '),
    ...r.experience.flatMap((e) => [`${e.title} ${e.company}`, ...e.bullets]),
    ...r.projects.map((p) => `${p.name} ${p.description} ${p.skills.join(' ')}`),
    ...r.certifications.map((c) => c.name),
  ].join('\n');
}
