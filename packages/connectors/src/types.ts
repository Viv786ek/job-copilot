export type AtsType = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'smartrecruiters' | 'recruitee' | 'personio';

export type SourceId =
  | 'GREENHOUSE' | 'LEVER' | 'ASHBY' | 'WORKABLE' | 'SMARTRECRUITERS' | 'RECRUITEE' | 'PERSONIO'
  | 'REMOTIVE' | 'REMOTEOK' | 'WEWORKREMOTELY' | 'HIMALAYAS' | 'JOBICY' | 'ARBEITNOW' | 'WORKINGNOMADS'
  | 'ADZUNA' | 'JOOBLE' | 'REED' | 'USAJOBS' | 'CAREER_PAGE' | 'FIRECRAWL' | 'MANUAL';

/** What a connector returns: source facts only, before enrichment. */
export interface RawJob {
  source: SourceId;
  externalId: string;
  url: string;
  applyUrl?: string | null;
  title: string;
  company: string;
  companyDomain?: string | null;
  /** Free-form location text exactly as the source gives it. */
  location: string | null;
  /** ISO alpha-2 when the source states it explicitly. */
  countryHint?: string | null;
  remoteHint?: boolean | null;
  hybridHint?: boolean | null;
  employmentType?: string | null;
  department?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  description: string;
  postedAt: string | null;
  ats?: AtsType | null;
}

export interface CompanyBoard {
  name: string;
  ats: AtsType;
  slug: string;
  website?: string | null;
  /** Where the list came from (yc, curated, user). */
  origin?: string;
}

export interface BoardConnector {
  readonly ats: AtsType;
  fetchBoard(board: CompanyBoard): Promise<RawJob[]>;
  /** Cheap existence check used by discovery. Returns number of open jobs or null when the board doesn't exist. */
  probe(slug: string): Promise<number | null>;
}

export interface FeedConnector {
  readonly source: SourceId;
  readonly requires?: string[];
  enabled(env: NodeJS.ProcessEnv): boolean;
  fetchAll(env: NodeJS.ProcessEnv, query?: FeedQuery): Promise<RawJob[]>;
}

export interface FeedQuery {
  keywords?: string[];
  countries?: string[];
  limit?: number;
}
