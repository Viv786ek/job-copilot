import { CandidateFeatures, computeMatch, JobFeatures } from './matching.engine';

const candidate: CandidateFeatures = {
  skills: ['ReactJS', 'TypeScript', 'node.js', 'PostgreSQL', 'Docker'],
  totalYearsExp: 4,
  targetTitles: ['Full Stack Developer'],
  embedding: [],
  resumeText: 'Built React and TypeScript apps with Node.js APIs on PostgreSQL, shipped with Docker.',
  preferredLocations: ['Bengaluru'],
  remoteOnly: false,
  needsVisaSponsorship: false,
};

const job: JobFeatures = {
  title: 'Senior Full Stack Engineer',
  requiredSkills: ['React', 'TypeScript', 'Node.js', 'AWS'],
  preferredSkills: ['GraphQL'],
  atsKeywords: ['React', 'TypeScript', 'AWS', 'microservices'],
  minYears: 3,
  maxYears: 6,
  embedding: [],
  location: 'Bengaluru, India',
  workMode: 'HYBRID',
  visaSponsorship: null,
  country: 'IN',
};

describe('computeMatch', () => {
  it('normalizes skill aliases and reports gaps', () => {
    const r = computeMatch(candidate, job);
    expect(r.matchedSkills).toEqual(expect.arrayContaining(['React', 'TypeScript', 'Node.js']));
    expect(r.missingRequiredSkills).toEqual(['AWS']);
    expect(r.missingPreferredSkills).toEqual(['GraphQL']);
    expect(r.score).toBeGreaterThan(60);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('caps the score when most must-haves are missing', () => {
    const r = computeMatch(
      { ...candidate, skills: ['Excel'] },
      { ...job, requiredSkills: ['Java', 'Spring Boot', 'Kafka', 'AWS'] },
    );
    expect(r.score).toBeLessThanOrEqual(55);
  });

  it('zeroes location fit when visa is needed but not offered', () => {
    const r = computeMatch({ ...candidate, needsVisaSponsorship: true }, { ...job, visaSponsorship: false });
    expect(r.breakdown.location).toBe(0);
  });

  it('ignores the semantic component when embeddings are missing', () => {
    const r = computeMatch(candidate, job);
    expect(r.breakdown.semantic).toBe(0);
    expect(Number.isFinite(r.score)).toBe(true);
  });
});
