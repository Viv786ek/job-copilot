import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { isIP } from 'net';
import type { JobSource } from '@copilot/shared';
import { detectVisa, detectWorkMode, htmlToText, RawJob, USER_AGENT } from './connector';

const HOST_SOURCES: Array<[RegExp, JobSource]> = [
  [/(^|\.)linkedin\.com$/, 'LINKEDIN'],
  [/(^|\.)naukri\.com$/, 'NAUKRI'],
  [/(^|\.)instahyre\.com$/, 'INSTAHYRE'],
  [/(^|\.)wellfound\.com$|(^|\.)angel\.co$/, 'WELLFOUND'],
  [/(^|\.)indeed\.[a-z.]+$/, 'INDEED'],
  [/(^|\.)hirist\.(com|tech)$/, 'HIRIST'],
  [/(^|\.)foundit\.in$|(^|\.)monsterindia\.com$/, 'FOUNDIT'],
  [/greenhouse\.io$/, 'GREENHOUSE'],
  [/(^|\.)lever\.co$/, 'LEVER'],
  [/(^|\.)ashbyhq\.com$/, 'ASHBY'],
];

export function sourceFromUrl(url: string): JobSource {
  const host = new URL(url).hostname.toLowerCase();
  return HOST_SOURCES.find(([re]) => re.test(host))?.[1] ?? 'CAREER_PAGE';
}

/**
 * Import workflow for boards without a public API (LinkedIn, Naukri, Instahyre, Wellfound,
 * Indeed, Hirist, Foundit). We do NOT run logged-in scrapers against these sites. Instead:
 *   1. User pastes a job URL -> we fetch the public page once and read its schema.org
 *      JobPosting JSON-LD (published by most boards for Google Jobs indexing), or
 *   2. The browser extension / bookmarklet posts the page HTML the user is already viewing, or
 *   3. User pastes the JD text directly.
 */
@Injectable()
export class UrlImportService {
  async fromUrl(url: string, html?: string): Promise<RawJob> {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) throw new BadRequestException('Only http(s) URLs are supported');
    this.assertPublicHost(u.hostname);

    const page = html ?? (await this.fetchPage(u.toString()));
    const posting = this.extractJsonLd(page);
    const source = sourceFromUrl(url);
    const externalId = createHash('sha1').update(u.origin + u.pathname).digest('hex').slice(0, 24);

    if (posting) {
      const description = htmlToText(String(posting.description ?? ''));
      const loc = posting.jobLocation?.[0]?.address ?? posting.jobLocation?.address;
      const location = [loc?.addressLocality, loc?.addressRegion, loc?.addressCountry?.name ?? loc?.addressCountry]
        .filter((x) => typeof x === 'string' && x)
        .join(', ');
      const salary = posting.baseSalary?.value;
      return {
        source,
        externalId,
        url,
        title: String(posting.title ?? 'Untitled role'),
        companyName: String(posting.hiringOrganization?.name ?? 'Unknown company'),
        location: location || null,
        country: typeof loc?.addressCountry === 'string' ? loc.addressCountry : null,
        workMode: posting.jobLocationType === 'TELECOMMUTE' ? 'REMOTE' : detectWorkMode(description, location),
        employmentType: Array.isArray(posting.employmentType) ? posting.employmentType.join(', ') : posting.employmentType ?? null,
        salaryMin: typeof salary?.minValue === 'number' ? Math.round(salary.minValue) : null,
        salaryMax: typeof salary?.maxValue === 'number' ? Math.round(salary.maxValue) : null,
        salaryCurrency: posting.baseSalary?.currency ?? null,
        description,
        visaSponsorship: detectVisa(description),
        postedAt: posting.datePosted ? new Date(posting.datePosted) : null,
      };
    }

    const text = htmlToText(page);
    if (text.length < 200) {
      throw new BadRequestException(
        'This page requires sign-in or blocks automated access. Paste the job description text instead, or use the browser extension.',
      );
    }
    const title = /<title[^>]*>([^<]+)<\/title>/i.exec(page)?.[1]?.trim() ?? 'Imported role';
    return {
      source,
      externalId,
      url,
      title,
      companyName: u.hostname.replace(/^www\./, ''),
      description: text.slice(0, 20_000),
      workMode: detectWorkMode(text),
      visaSponsorship: detectVisa(text),
    };
  }

  private async fetchPage(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new BadRequestException(`Could not fetch the job page (HTTP ${res.status}). Paste the description instead.`);
    const body = await res.text();
    return body.slice(0, 2_000_000);
  }

  private extractJsonLd(html: string): any | null {
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      try {
        const json = JSON.parse(m[1].trim());
        const nodes = Array.isArray(json) ? json : json['@graph'] ?? [json];
        const posting = nodes.find((n: any) => n?.['@type'] === 'JobPosting');
        if (posting) return posting;
      } catch {
        /* malformed block, keep looking */
      }
    }
    return null;
  }

  /** SSRF guard: refuse private, loopback and link-local targets. */
  private assertPublicHost(host: string) {
    const h = host.toLowerCase();
    const blocked =
      h === 'localhost' ||
      h.endsWith('.local') ||
      h.endsWith('.internal') ||
      (isIP(h) && /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1|fc|fd|fe80)/.test(h));
    if (blocked) throw new BadRequestException('This URL is not allowed');
  }
}
