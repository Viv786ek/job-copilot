import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/config.service';
import {
  detectVisa,
  detectWorkMode,
  fetchJson,
  htmlToText,
  JobConnector,
  matchesQuery,
  RawJob,
  SearchQuery,
} from './connector';

/** Remotive public API — remote jobs worldwide. https://remotive.com/api-documentation */
@Injectable()
export class RemotiveConnector implements JobConnector {
  readonly source = 'REMOTIVE' as const;
  isEnabled() {
    return true;
  }

  async search(q: SearchQuery): Promise<RawJob[]> {
    const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q.query)}&limit=${q.limit ?? 50}`;
    const data = await fetchJson<{ jobs: any[] }>(url);
    return data.jobs.map((j): RawJob => {
      const description = htmlToText(j.description);
      return {
        source: this.source,
        externalId: String(j.id),
        url: j.url,
        title: j.title,
        companyName: j.company_name,
        location: j.candidate_required_location || 'Remote',
        workMode: 'REMOTE' as const,
        employmentType: j.job_type,
        description,
        visaSponsorship: detectVisa(description),
        postedAt: j.publication_date ? new Date(j.publication_date) : null,
      };
    });
  }
}

/** RemoteOK public feed. Their terms require linking back to the original posting (we keep `url`). */
@Injectable()
export class RemoteOkConnector implements JobConnector {
  readonly source = 'REMOTEOK' as const;
  isEnabled() {
    return true;
  }

  async search(q: SearchQuery): Promise<RawJob[]> {
    const data = await fetchJson<any[]>('https://remoteok.com/api');
    return data
      .filter((j) => j && j.id && j.position && matchesQuery(`${j.position} ${(j.tags ?? []).join(' ')}`, q.query))
      .slice(0, q.limit ?? 50)
      .map((j): RawJob => {
        const description = htmlToText(j.description ?? '');
        return {
          source: this.source,
          externalId: String(j.id),
          url: j.url,
          title: j.position,
          companyName: j.company,
          location: j.location || 'Remote',
          workMode: 'REMOTE' as const,
          salaryMin: j.salary_min || null,
          salaryMax: j.salary_max || null,
          salaryCurrency: j.salary_min ? 'USD' : null,
          description,
          visaSponsorship: detectVisa(description),
          postedAt: j.date ? new Date(j.date) : null,
        };
      });
  }
}

/**
 * Adzuna aggregator API — the licensed route to broad India (and 15+ country) coverage,
 * including many listings syndicated from Naukri/Indeed/Foundit-style boards.
 * https://developer.adzuna.com/
 */
@Injectable()
export class AdzunaConnector implements JobConnector {
  readonly source = 'ADZUNA' as const;
  constructor(private readonly config: AppConfig) {}

  isEnabled() {
    return !!this.config.get('ADZUNA_APP_ID') && !!this.config.get('ADZUNA_APP_KEY');
  }

  async search(q: SearchQuery): Promise<RawJob[]> {
    const country = q.country ?? 'in';
    const params = new URLSearchParams({
      app_id: this.config.get('ADZUNA_APP_ID')!,
      app_key: this.config.get('ADZUNA_APP_KEY')!,
      what: q.query,
      results_per_page: String(Math.min(q.limit ?? 50, 50)),
      max_days_old: '14',
      'content-type': 'application/json',
    });
    if (q.location) params.set('where', q.location);
    const data = await fetchJson<{ results: any[] }>(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`);
    return data.results.map((j): RawJob => ({
      source: this.source,
      externalId: String(j.id),
      url: j.redirect_url,
      title: htmlToText(j.title),
      companyName: j.company?.display_name ?? 'Unknown',
      location: j.location?.display_name ?? null,
      country: country.toUpperCase(),
      workMode: detectWorkMode(j.title, j.description),
      employmentType: j.contract_time ?? null,
      salaryMin: j.salary_min ? Math.round(j.salary_min) : null,
      salaryMax: j.salary_max ? Math.round(j.salary_max) : null,
      salaryCurrency: country === 'in' ? 'INR' : null,
      description: htmlToText(j.description),
      visaSponsorship: detectVisa(j.description ?? ''),
      postedAt: j.created ? new Date(j.created) : null,
    }));
  }
}
