/**
 * wave2-preflight.test.mjs — Verify the wave 2 preflight audit report.
 * Spec: environment-tiering/REQ-006 — Wave 2 timers are enabled only after
 * a stale state audit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';

const REPORT_PATH = join(import.meta.dirname, '..', '..', 'pm', 'wave2-preflight.md');

// Expected drained repos from cron-schedule.json
const DRAINED_REPOS = [
  'agentic-sdlc',
  'hermes-pilot',
  'personal-website',
  'nels-workshop',
  'willtopaint',
];

test('wave2 preflight report exists', () => {
  assert.ok(fs.existsSync(REPORT_PATH), `Report not found at ${REPORT_PATH}`);
});

test('wave2 preflight report names every drained repo', () => {
  const content = fs.readFileSync(REPORT_PATH, 'utf8');
  for (const repo of DRAINED_REPOS) {
    assert.ok(
      content.includes(repo),
      `Report must mention drained repo "${repo}"`,
    );
  }
});

test('wave2 preflight report contains queue depth', () => {
  const content = fs.readFileSync(REPORT_PATH, 'utf8');
  // Should reference the queue status in some form
  assert.ok(
    /tasks.*queue|pending|in.progress/i.test(content),
    'Report should reference queue depth information',
  );
});

test('wave2 preflight report contains open PR count per repo', () => {
  const content = fs.readFileSync(REPORT_PATH, 'utf8');
  // Should reference open PR counts
  assert.ok(
    /open PR|PR count|Open PRs/i.test(content),
    'Report should reference open PR information',
  );
});

test('wave2 preflight report contains last-deployed SHA vs origin comparison', () => {
  const content = fs.readFileSync(REPORT_PATH, 'utf8');
  // Should reference last-deployed tracking
  assert.ok(
    /last-deployed|\.last-deployed/i.test(content),
    'Report should reference last-deployed tracking',
  );
});

test('wave2 preflight report identifies drift if present', () => {
  const content = fs.readFileSync(REPORT_PATH, 'utf8');
  // The report should have a drift or match section for each tracked repo
  assert.ok(
    /Drift|Match|N\/A/i.test(content),
    'Report should identify drift status for each repo',
  );
});
