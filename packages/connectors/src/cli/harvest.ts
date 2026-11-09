#!/usr/bin/env node
/**
 * Harvests every enabled source and writes the static dataset.
 *   node dist/cli/harvest.js --companies data/companies.json --out ../../apps/web/public/data [--max-age 60]
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { buildDataset } from '../dataset';
import { harvest } from '../harvest';
import type { CompanyBoard } from '../types';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : def;
};

async function main() {
  const companiesFile = resolve(arg('--companies', resolve(__dirname, '../../data/companies.json')));
  const outDir = resolve(arg('--out', resolve(__dirname, '../../../../apps/web/public/data')));
  const boards: CompanyBoard[] = JSON.parse(readFileSync(companiesFile, 'utf8')).boards;
  const log = (m: string) => console.log(`[harvest] ${m}`);
  log(`${boards.length} company boards; output → ${outDir}`);

  const result = await harvest({ boards, maxAgeDays: Number(arg('--max-age', '60')), log });
  const { meta, index, shards } = buildDataset(result);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'jobs'), { recursive: true });
  writeFileSync(join(outDir, 'meta.json'), JSON.stringify(meta));
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(index));
  for (const [shard, data] of shards) writeFileSync(join(outDir, 'jobs', `${shard}.json`), JSON.stringify(data));

  log(`jobs: ${meta.totalJobs}, companies: ${meta.companies}, countries: ${meta.countries.length}`);
  for (const s of meta.sources) log(`  ${s.source.padEnd(16)} ${s.ok ? 'ok ' : s.skipped ? 'off' : 'ERR'} ${s.jobs}${s.skipped ? ` (${s.skipped})` : ''}${s.error ? ` ${s.error}` : ''}`);
  if (meta.totalJobs === 0) {
    console.error('Harvest produced no jobs; refusing to publish an empty dataset.');
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
