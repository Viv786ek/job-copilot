import type { ParsedResume, TailoredResume } from '@copilot/shared';
import { enforceHonesty } from './guardrails';

const source: ParsedResume = {
  fullName: 'Asha Rao',
  links: [],
  skills: ['React', 'TypeScript', 'Node.js'],
  experience: [
    {
      company: 'Acme Corp',
      title: 'Software Engineer',
      startDate: '2021-06',
      endDate: null,
      current: true,
      bullets: ['Built dashboards used by 200 analysts', 'Cut API latency by 30%'],
      skills: ['React'],
    },
  ],
  education: [{ institution: 'IIT Delhi', degree: 'B.Tech' }],
  projects: [],
  certifications: [],
};
const text = 'Asha Rao React TypeScript Node.js Acme Corp Software Engineer Built dashboards used by 200 analysts Cut API latency by 30%';

const draft: TailoredResume = {
  headline: 'Senior Frontend Engineer',
  summary: 'x',
  skills: ['React', 'Kubernetes', 'TypeScript'],
  experience: [
    { company: 'Acme Corp', title: 'Lead Engineer', startDate: '2019-01', current: true, bullets: ['Built dashboards used by 200 analysts', 'Grew revenue 45%'] },
    { company: 'Google', title: 'SWE', current: false, bullets: ['Did things'] },
  ],
  projects: [{ name: 'Made up', description: 'x', skills: [] }],
  education: [],
  certifications: [{ name: 'AWS SA Pro' }],
  changeLog: [],
};

describe('enforceHonesty', () => {
  const { resume, flags } = enforceHonesty(source, text, draft);

  it('removes skills the candidate does not have', () => {
    expect(resume.skills).toEqual(['React', 'TypeScript']);
  });
  it('drops invented roles and restores real titles and dates', () => {
    expect(resume.experience).toHaveLength(1);
    expect(resume.experience[0]).toMatchObject({ title: 'Software Engineer', startDate: '2021-06' });
  });
  it('removes bullets with invented metrics', () => {
    expect(resume.experience[0].bullets).toEqual(['Built dashboards used by 200 analysts']);
  });
  it('restores education/certifications from source and drops invented projects', () => {
    expect(resume.certifications).toEqual([]);
    expect(resume.education).toEqual(source.education);
    expect(resume.projects).toEqual([]);
  });
  it('explains every removal', () => {
    expect(flags.length).toBeGreaterThanOrEqual(4);
  });
});
