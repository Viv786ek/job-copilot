/**
 * Offline contract test for the whole discovery pipeline using the mock provider:
 * connector → enrichment (country, visa, relocation, skills) → de-duplication → dataset.
 * Run: npm test -w @copilot/connectors
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDataset } from './dataset';
import { harvest } from './harvest';
import { MOCK_JOBS } from './mock';

test('mock pipeline produces enriched, de-duplicated jobs', async () => {
  const yesterday = Math.floor(Date.now() / 86_400_000) - 1;
  const result = await harvest({ boards: [], env: { JOB_SOURCES_MODE: 'mock' }, firstSeen: new Map([['__none__', yesterday]]) });

  assert.equal(result.jobs.length, MOCK_JOBS.length - 1, 'the syndicated duplicate collapses into the original');
  const byTitle = (t: string) => result.jobs.find((j) => j.title === t)!;

  const backend = byTitle('Senior Backend Engineer');
  assert.equal(backend.source, 'GREENHOUSE', 'the company ATS copy wins over the aggregator copy');
  assert.deepEqual(backend.alsoOn?.map((a) => a.source), ['HIMALAYAS']);
  assert.deepEqual(backend.countries, ['DE']);
  assert.equal(backend.visa.status, 'SPONSORS');
  assert.ok(backend.visa.visaTypes.includes('EU Blue Card'));
  assert.equal(backend.visa.relocation, true);
  assert.ok(backend.analysis.requiredSkills.includes('Kafka'));

  const frontend = byTitle('Frontend Engineer');
  assert.equal(frontend.remoteScope, 'REGION');
  assert.equal(frontend.visa.status, 'NO_SPONSORSHIP');

  assert.equal(byTitle('Full Stack Developer').remoteScope, 'GLOBAL');
  assert.deepEqual(byTitle('Data Engineer').countries, ['AE']);
  assert.equal(byTitle('Data Engineer').visa.relocation, true);

  const { meta, index, shards } = buildDataset(result);
  assert.equal(meta.totalJobs, 4);
  const row = index.rows.find((r) => r[1] === 'Full Stack Developer')!;
  assert.deepEqual([row[17], row[18], row[19]], [90000, 120000, 'USD'], 'salary columns');
  assert.equal(index.rows.find((r) => r[1] === 'Senior Backend Engineer')![21], 1, 'alsoOn count');
  const detail = [...shards.values()].flatMap((s) => Object.values(s)).find((d) => d.alsoOn.length);
  assert.equal(detail?.alsoOn[0].source, 'HIMALAYAS');
});
