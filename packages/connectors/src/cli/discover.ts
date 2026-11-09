#!/usr/bin/env node
/**
 * Builds data/companies.json: verified ATS boards for YC hiring companies + curated product companies.
 *   node dist/cli/discover.js [--out data/companies.json] [--merge]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { CURATED_COMPANIES } from '../curated';
import { discoverBoards, loadYcHiring } from '../discover';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : def;
};

async function main() {
  const out = resolve(arg('--out', resolve(__dirname, '../../data/companies.json')));
  const log = (m: string) => console.log(`[discover] ${m}`);
  const yc = await loadYcHiring();
  log(`YC hiring companies: ${yc.length}; curated: ${CURATED_COMPANIES.length}`);
  const boards = await discoverBoards([...CURATED_COMPANIES, ...yc], { log, concurrency: 32 });

  // Keep previously verified boards that a transient error may have hidden this run.
  const previous: typeof boards = process.argv.includes('--merge') && existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')).boards ?? [] : [];
  const key = (b: { ats: string; slug: string }) => `${b.ats}:${b.slug}`;
  const merged = new Map(previous.map((b) => [key(b), b]));
  for (const b of boards) merged.set(key(b), b);

  const list = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), count: list.length, boards: list }, null, 1));
  const byAts = list.reduce<Record<string, number>>((m, b) => ((m[b.ats] = (m[b.ats] ?? 0) + 1), m), {});
  log(`wrote ${list.length} boards to ${out} ${JSON.stringify(byAts)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
