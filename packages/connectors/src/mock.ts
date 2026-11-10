/**
 * Offline provider with the exact FeedConnector contract, for tests, local development without
 * network access, and CI. It is only active when JOB_SOURCES_MODE=mock and never runs in the
 * production harvest. Fixtures exercise every enrichment path: visa sponsorship, explicit refusal,
 * relocation, worldwide/regional/country-limited remote, salary, and a cross-site duplicate.
 */
import type { FeedConnector, RawJob } from './types';

const today = () => new Date().toISOString();

export const MOCK_JOBS: RawJob[] = [
  {
    source: 'GREENHOUSE', ats: 'greenhouse', externalId: 'mock-1', url: 'https://boards.greenhouse.io/mockco/jobs/1', title: 'Senior Backend Engineer',
    company: 'MockCo', location: 'Berlin, Germany', salaryMin: 75000, salaryMax: 95000, salaryCurrency: 'EUR', postedAt: today(),
    description: 'We build payments APIs in Node.js, TypeScript and PostgreSQL on AWS. Requirements: 5+ years of backend experience, Kafka, Docker. Nice to have: Kubernetes. We offer visa sponsorship (EU Blue Card) and a relocation package to Berlin.',
  },
  {
    source: 'LEVER', ats: 'lever', externalId: 'mock-2', url: 'https://jobs.lever.co/mockco/2', title: 'Frontend Engineer', company: 'Acme Remote',
    location: 'Remote (Europe)', remoteHint: true, postedAt: today(),
    description: 'React and TypeScript role for a design-led team. Requirements: 3+ years of React, Redux, Jest. Candidates must be authorized to work in the EU; we cannot sponsor visas.',
  },
  {
    source: 'REMOTEOK', externalId: 'mock-3', url: 'https://remoteok.com/remote-jobs/mock-3', title: 'Full Stack Developer', company: 'Globex',
    location: 'Remote (Worldwide)', remoteHint: true, salaryMin: 90000, salaryMax: 120000, salaryCurrency: 'USD', postedAt: today(),
    description: 'Ship features across Next.js, Node.js and PostgreSQL. Requirements: 4+ years full stack experience. Work from anywhere in the world.',
  },
  {
    source: 'ARBEITNOW', externalId: 'mock-4', url: 'https://www.arbeitnow.com/jobs/mock-4', title: 'Data Engineer', company: 'Initech',
    location: 'Dubai, United Arab Emirates', postedAt: today(),
    description: 'Build pipelines with Python, Spark and Airflow on GCP. Requirements: 3+ years. Employment visa and relocation support are provided for the right candidate.',
  },
  {
    // Same role as mock-1 syndicated on an aggregator: must collapse into mock-1 with "Also on".
    source: 'HIMALAYAS', externalId: 'mock-5', url: 'https://himalayas.app/jobs/mock-5', title: 'Senior Backend Engineer', company: 'MockCo',
    location: 'Berlin, Germany', postedAt: today(),
    description: 'Payments APIs in Node.js and TypeScript.',
  },
];

export const mockFeed: FeedConnector = {
  source: 'MANUAL',
  enabled: (env) => env.JOB_SOURCES_MODE === 'mock',
  async fetchAll() {
    return MOCK_JOBS.map((j) => ({ ...j }));
  },
};
