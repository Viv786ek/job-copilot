#!/usr/bin/env node
/** Live connectivity check for every source: one known board per ATS and every feed. Exit 1 if a keyless source fails. */
import { BOARD_CONNECTORS } from '../ats';
import { crawlCareerPage } from '../careers';
import { FEED_CONNECTORS } from '../feeds';
import type { AtsType } from '../types';

const SAMPLES: Record<AtsType, string> = {
  greenhouse: 'stripe',
  lever: 'palantir',
  ashby: 'ramp',
  workable: 'huggingface',
  smartrecruiters: 'BoschGroup',
  recruitee: 'bunq',
  personio: 'personio',
};

async function main() {
  let failed = 0;
  for (const [ats, slug] of Object.entries(SAMPLES) as Array<[AtsType, string]>) {
    const t = Date.now();
    try {
      const jobs = await BOARD_CONNECTORS[ats].fetchBoard({ name: slug, ats, slug });
      console.log(`ok   ${ats.padEnd(16)} ${String(jobs.length).padStart(5)} jobs  ${Date.now() - t}ms`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${ats.padEnd(16)} ${(e as Error).message}`);
    }
  }
  for (const c of FEED_CONNECTORS) {
    if (!c.enabled(process.env)) {
      console.log(`skip ${c.source.padEnd(16)} needs ${c.requires?.join(', ')}`);
      continue;
    }
    const t = Date.now();
    try {
      const jobs = await c.fetchAll(process.env, { limit: 100, keywords: ['software engineer'], countries: ['gb'] });
      console.log(`ok   ${c.source.padEnd(16)} ${String(jobs.length).padStart(5)} jobs  ${Date.now() - t}ms`);
    } catch (e) {
      if (!c.requires?.length) failed++;
      console.log(`FAIL ${c.source.padEnd(16)} ${(e as Error).message}`);
    }
  }
  const page = await crawlCareerPage('https://jobs.lever.co/palantir').catch((e) => ({ method: `error: ${(e as Error).message}`, jobs: [] }));
  console.log(`ok   career-page URL   ${String(page.jobs.length).padStart(5)} jobs  via ${page.method}`);
  process.exit(failed ? 1 : 0);
}

main();
