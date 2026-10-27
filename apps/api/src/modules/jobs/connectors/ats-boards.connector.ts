import { Injectable, Logger } from '@nestjs/common';
import type { Company } from '@prisma/client';
import { detectVisa, detectWorkMode, fetchJson, htmlToText, RawJob } from './connector';

/**
 * Career-page connector. Most product companies host their careers page on Greenhouse,
 * Lever or Ashby, all of which expose public, documented JSON board APIs. Companies are
 * registered in the `Company` table (atsType + atsBoardId) by admins or by users who
 * paste a careers URL.
 */
@Injectable()
export class CareerPagesConnector {
  private readonly logger = new Logger(CareerPagesConnector.name);

  async fetchCompany(c: Company): Promise<RawJob[]> {
    if (!c.atsType || !c.atsBoardId) return [];
    try {
      switch (c.atsType) {
        case 'greenhouse':
          return await this.greenhouse(c);
        case 'lever':
          return await this.lever(c);
        case 'ashby':
          return await this.ashby(c);
        default:
          return [];
      }
    } catch (e) {
      this.logger.warn(`Career page ${c.slug} (${c.atsType}) failed: ${(e as Error).message}`);
      return [];
    }
  }

  /** Detects the ATS behind a careers URL so users can add any company by pasting its link. */
  static detect(url: string): { atsType: string; atsBoardId: string } | null {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean);
    if (/greenhouse\.io$/.test(u.hostname) && seg[0]) return { atsType: 'greenhouse', atsBoardId: seg[0] };
    if (u.hostname === 'jobs.lever.co' && seg[0]) return { atsType: 'lever', atsBoardId: seg[0] };
    if (u.hostname === 'jobs.ashbyhq.com' && seg[0]) return { atsType: 'ashby', atsBoardId: seg[0] };
    return null;
  }

  private async greenhouse(c: Company): Promise<RawJob[]> {
    const data = await fetchJson<{ jobs: any[] }>(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(c.atsBoardId!)}/jobs?content=true`,
    );
    return data.jobs.map((j): RawJob => {
      const description = htmlToText(decodeEntities(j.content ?? ''));
      return {
        source: 'GREENHOUSE' as const,
        externalId: String(j.id),
        url: j.absolute_url,
        title: j.title,
        companyName: c.name,
        location: j.location?.name ?? null,
        workMode: detectWorkMode(j.location?.name, j.title),
        description,
        visaSponsorship: detectVisa(description),
        postedAt: j.updated_at ? new Date(j.updated_at) : null,
      };
    });
  }

  private async lever(c: Company): Promise<RawJob[]> {
    const data = await fetchJson<any[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(c.atsBoardId!)}?mode=json`);
    return data.map((j): RawJob => {
      const description = [j.descriptionPlain, ...(j.lists ?? []).map((l: any) => `${l.text}\n${htmlToText(l.content)}`), j.additionalPlain]
        .filter(Boolean)
        .join('\n\n');
      return {
        source: 'LEVER' as const,
        externalId: j.id,
        url: j.hostedUrl,
        title: j.text,
        companyName: c.name,
        location: j.categories?.location ?? null,
        workMode: j.workplaceType === 'remote' ? 'REMOTE' : j.workplaceType === 'hybrid' ? 'HYBRID' : j.workplaceType === 'onsite' ? 'ONSITE' : null,
        employmentType: j.categories?.commitment ?? null,
        description,
        visaSponsorship: detectVisa(description),
        postedAt: j.createdAt ? new Date(j.createdAt) : null,
      };
    });
  }

  private async ashby(c: Company): Promise<RawJob[]> {
    const data = await fetchJson<{ jobs: any[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(c.atsBoardId!)}?includeCompensation=true`,
    );
    return data.jobs.map((j): RawJob => {
      const description = j.descriptionPlain ?? htmlToText(j.descriptionHtml ?? '');
      return {
        source: 'ASHBY' as const,
        externalId: j.id,
        url: j.jobUrl,
        title: j.title,
        companyName: c.name,
        location: j.location ?? null,
        workMode: j.isRemote ? 'REMOTE' : detectWorkMode(j.workplaceType, j.location),
        employmentType: j.employmentType ?? null,
        description,
        visaSponsorship: detectVisa(description),
        postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
      };
    });
  }
}

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
