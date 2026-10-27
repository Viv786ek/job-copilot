export const QUEUES = {
  RESUME: 'resume',
  JOBS: 'jobs',
  PIPELINE: 'pipeline',
  NOTIFICATIONS: 'notifications',
} as const;

export const JOBS = {
  PARSE_RESUME: 'parse-resume',
  INGEST_SOURCE: 'ingest-source',
  SEARCH_FOR_USER: 'search-for-user',
  SCHEDULED_SWEEP: 'scheduled-sweep',
  ANALYZE_JOB: 'analyze-job',
  AUTO_DOCS: 'auto-docs',
  DAILY_DIGEST: 'daily-digest',
  FOLLOW_UP_SWEEP: 'follow-up-sweep',
} as const;
