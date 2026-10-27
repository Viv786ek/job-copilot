import {
  enforceHonesty,
  type InterviewPrep,
  type JdAnalysis,
  type Outreach,
  type ParsedResume,
  skillKey,
  type TailoredResume,
} from '@copilot/shared';

/**
 * Template generators used ONLY by the static demo. Production uses the LLM prompts in
 * apps/api/src/modules/ai/prompts.ts. Output still passes through the real honesty guardrails.
 */

interface JobLite {
  title: string;
  companyName: string;
}

const mentions = (text: string, skills: string[]) => skills.filter((s) => text.toLowerCase().includes(s.toLowerCase())).length;

export function tailorResume(r: ParsedResume, rawText: string, jd: JdAnalysis): { resume: TailoredResume; flags: string[] } {
  const jdSkills = [...jd.requiredSkills, ...jd.preferredSkills];
  const jdKeys = new Set(jdSkills.map(skillKey));
  const relevant = r.skills.filter((s) => jdKeys.has(skillKey(s)));
  const rest = r.skills.filter((s) => !jdKeys.has(skillKey(s)));
  const years = Math.max(1, Math.round(r.experience.length ? (Date.now() - new Date(`${r.experience[r.experience.length - 1].startDate ?? '2021-01'}-01`).getTime()) / 3.15e10 : 1));

  const draft: TailoredResume = {
    headline: `${r.experience[0]?.title ?? r.headline ?? 'Software Engineer'} · ${relevant.slice(0, 3).join(' · ') || r.skills.slice(0, 3).join(' · ')}`,
    summary: `${r.headline ?? 'Engineer'} with ${years}+ years of experience${relevant.length ? ` across ${relevant.slice(0, 4).join(', ')}` : ''}. ${
      r.summary?.split('. ').slice(1).join('. ') ?? ''
    }`.trim(),
    skills: [...relevant, ...rest],
    experience: r.experience.map((e) => ({
      company: e.company,
      title: e.title,
      startDate: e.startDate ?? null,
      endDate: e.endDate ?? null,
      current: e.current,
      location: e.location ?? null,
      bullets: [...e.bullets].sort((a, b) => mentions(b, jdSkills) - mentions(a, jdSkills)),
    })),
    projects: [...r.projects]
      .sort((a, b) => mentions(b.skills.join(' '), jdSkills) - mentions(a.skills.join(' '), jdSkills))
      .map((p) => ({ name: p.name, description: p.description, skills: p.skills })),
    education: r.education,
    certifications: r.certifications,
    changeLog: [
      relevant.length ? `Moved ${relevant.length} skills this role asks for to the front of your skills list.` : 'No overlapping skills found, so the skills order is unchanged.',
      'Reordered bullets in each role so the most relevant achievements come first.',
      `Rewrote the summary to lead with the skills ${jd.title ? `the ${jd.title} role` : 'this role'} asks for.`,
      'Listed every skill you have explicitly, so ATS keyword scanners can find it.',
    ],
  };
  return enforceHonesty(r, rawText, draft);
}

export function coverLetter(r: ParsedResume, job: JobLite, jd: JdAnalysis) {
  const matched = r.skills.filter((s) => [...jd.requiredSkills, ...jd.preferredSkills].some((j) => skillKey(j) === skillKey(s)));
  const best = r.experience[0];
  const proof = best?.bullets.find((b) => /\d/.test(b)) ?? best?.bullets[0];
  const second = r.experience[1]?.bullets.find((b) => /\d/.test(b));
  return {
    subject: `Application: ${job.title} — ${r.fullName ?? ''}`.trim(),
    body: `Dear ${job.companyName} hiring team,

I'm applying for the ${job.title} role. ${matched.length ? `Your team needs ${matched.slice(0, 3).join(', ')}, and that is the work I do every day.` : 'The problems your team is solving are the kind I want to work on next.'}

At ${best?.company ?? 'my current company'}, as ${best?.title ?? 'an engineer'}, I ${proof ? proof.charAt(0).toLowerCase() + proof.slice(1) : 'own features end to end'}.${
      second ? ` Before that, at ${r.experience[1].company}, I ${second.charAt(0).toLowerCase() + second.slice(1)}.` : ''
    }

I'd like to bring the same ownership to ${job.companyName}. I would welcome a short conversation about how I can help your team ship.

Thank you for your time,
${r.fullName ?? ''}`,
  };
}

export function outreach(r: ParsedResume, job: JobLite): Outreach {
  const first = r.fullName?.split(' ')[0] ?? 'there';
  const proof = r.experience[0]?.bullets.find((b) => /\d/.test(b)) ?? r.experience[0]?.bullets[0] ?? '';
  return {
    linkedinConnectionNote: `Hi! I'm ${first}, a ${r.headline ?? 'developer'} interested in the ${job.title} role at ${job.companyName}. I'd love to connect.`.slice(0, 280),
    linkedinMessage: `Hi, thanks for connecting! I applied for the ${job.title} role at ${job.companyName}. Recently I ${proof.charAt(0).toLowerCase() + proof.slice(1)}. Would you be open to a quick chat about the team's priorities?`,
    recruiterEmail: {
      subject: `${job.title} — ${r.fullName ?? first}`,
      body: `Hi,\n\nI've applied for the ${job.title} position at ${job.companyName}. In my current role I ${proof.charAt(0).toLowerCase() + proof.slice(1)}.\n\nI've attached a resume tailored to the role. Could we find 15 minutes this week?\n\nBest,\n${r.fullName ?? first}\n${r.phone ?? ''}`,
    },
    followUpEmails: [
      { sendAfterDays: 5, subject: `Re: ${job.title}`, body: `Hi,\n\nFollowing up on my application for ${job.title}. I'm still very interested and happy to share more about my work.\n\nBest,\n${first}` },
      { sendAfterDays: 12, subject: `Re: ${job.title}`, body: `Hi,\n\nOne last note on the ${job.title} role. If the timing isn't right, I'd appreciate being considered for similar openings.\n\nThanks,\n${first}` },
    ],
  };
}

const QUESTION_BANK: Record<string, string[]> = {
  React: ['How does React reconciliation decide what to re-render?', 'When would you reach for useMemo or useCallback, and when is it premature?'],
  TypeScript: ['Explain the difference between `unknown` and `any`, and when you use each.', 'How do discriminated unions help model API responses?'],
  'Node.js': ['How does the Node.js event loop handle CPU-heavy work, and how would you avoid blocking it?', 'How do you handle graceful shutdown in a Node service?'],
  PostgreSQL: ['How would you find and fix a slow query in PostgreSQL?', 'When would you use a partial or GIN index?'],
  'REST APIs': ['How do you version a public REST API without breaking clients?', 'How do you make a POST endpoint idempotent?'],
  Docker: ['How do multi-stage Docker builds reduce image size?', 'How do you debug a container that exits immediately?'],
  AWS: ['Which AWS services would you use to run a containerized API, and why?', 'How do you manage secrets for services on AWS?'],
  Redux: ['When is Redux the wrong choice for state management?', 'How do you normalize state for lists of entities?'],
  Java: ['Explain the Java memory model and what `volatile` guarantees.', 'How does a HashMap handle collisions?'],
  'Spring Boot': ['How does Spring Boot auto-configuration work?', 'How do you handle transactions across service methods?'],
  Python: ['How do Python generators save memory?', 'What does the GIL mean for concurrency in your services?'],
  SQL: ['Explain the difference between INNER, LEFT and FULL joins with an example.', 'How do window functions differ from GROUP BY?'],
  Kafka: ['How does Kafka guarantee ordering, and where does it not?', 'What is consumer lag and how do you reduce it?'],
  LLMs: ['How would you evaluate whether an LLM feature is getting better or worse?', 'How do you reduce hallucinations in a RAG system?'],
};

export function interviewPrep(r: ParsedResume, job: JobLite, jd: JdAnalysis): InterviewPrep {
  const skills = [...jd.requiredSkills, ...jd.preferredSkills];
  const technical = skills
    .flatMap((s) => (QUESTION_BANK[s] ?? [`Walk me through a project where you used ${s}. What trade-offs did you make?`]).map((q) => ({ s, q })))
    .slice(0, 10)
    .map(({ s, q }) => ({
      question: q,
      whyAsked: `${s} is ${jd.requiredSkills.includes(s) ? 'a must-have' : 'a nice-to-have'} for this role.`,
      answerHints: r.skills.some((k) => skillKey(k) === skillKey(s))
        ? [`Anchor your answer in real work, e.g. "${r.experience.find((e) => e.skills.some((k) => skillKey(k) === skillKey(s)))?.bullets[0] ?? 'a recent project'}".`, 'Explain the trade-off you chose and what you would do differently.']
        : ['This is a gap on your resume. Be honest about it and show how you would ramp up quickly.'],
    }));
  const stories = r.experience.flatMap((e) => e.bullets.map((b) => `${b} (${e.company})`));
  const behavioral = [
    'Tell me about a time you delivered under a tight deadline.',
    'Describe a disagreement with a teammate and how you resolved it.',
    'Tell me about a production issue you owned end to end.',
    'Describe a time you mentored someone or raised a team’s quality bar.',
    'Tell me about a decision you made with incomplete data.',
    'What is the project you are proudest of, and why?',
  ].map((question, i) => ({ question, starStoryFromResume: stories[i % Math.max(1, stories.length)] ?? 'Prepare a story from a recent project.' }));
  const senior = jd.seniority === 'SENIOR' || jd.seniority === 'LEAD' || jd.seniority === 'PRINCIPAL';
  return {
    technical,
    behavioral,
    systemDesign: [
      { question: `Design the core service behind ${job.companyName}'s main product.`, keyPoints: ['Clarify requirements and scale', 'API and data model', 'Caching and queues', 'Failure modes and monitoring'] },
      { question: 'Design a rate limiter for a public API.', keyPoints: ['Token bucket vs sliding window', 'Redis for shared state', 'Per-user and global limits'] },
      { question: senior ? 'Design a multi-region notification system.' : 'Design a URL shortener.', keyPoints: ['Write and read paths', 'ID generation', 'Storage choice', 'Scaling reads'] },
    ],
    companySpecific: [
      `Read ${job.companyName}'s product pages and recent announcements.`,
      `Prepare a 60-second pitch connecting your experience to the ${job.title} role.`,
      'Find the team on LinkedIn and note what they have shipped recently.',
      'Prepare examples for every must-have skill in the job description.',
      'Be ready to discuss your notice period and expected compensation.',
    ],
    questionsToAsk: [
      'What does success look like in the first 90 days?',
      'What is the biggest technical challenge the team faces this year?',
      'How does the team decide what to build next?',
      'How are code reviews and on-call handled?',
      'What growth paths have people in this role taken?',
    ],
  };
}
