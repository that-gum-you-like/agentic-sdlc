/**
 * daily-review.test.mjs
 *
 * Regression for REQ-004 (liveness-heartbeat): `agents/cycles/daily-review.mjs`
 * must actually update `pm/DASHBOARD.md`. The bug: the date regex matched
 * `**Last Updated:**` (capital U) while the dashboard carried
 * `**Last updated:**`, and the activity insert targeted a `## Recent Activity`
 * heading the file did not have — so the dashboard's date had read
 * 2026-04-07 for months while the old test passed by asserting only that the
 * file was written.
 *
 * These tests run the real script against a fixture project and assert the
 * WRITTEN CONTENT: today's date present, the activity row under a heading
 * that exists, and missing headings reported on stderr.
 *
 * Run with:
 *   node --test agents/__tests__/daily-review.test.mjs
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const SCRIPT = resolve(REPO, 'agents/cycles/daily-review.mjs');

const TODAY = new Date().toISOString().split('T')[0];

/** Build a fixture project dir with the given dashboard content. */
function fixtureProject(dashboardContent) {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-dailyreview-'));
  mkdirSync(join(dir, 'agents'), { recursive: true });
  mkdirSync(join(dir, 'pm'), { recursive: true });
  writeFileSync(
    join(dir, 'agents/project.json'),
    JSON.stringify({ name: 'daily-review-fixture', notification: { provider: 'none', triggers: {} } })
  );
  writeFileSync(join(dir, 'pm/DASHBOARD.md'), dashboardContent);
  return dir;
}

/** Run the real daily-review script against a fixture project dir. */
function runReview(projectDir) {
  return spawnSync(process.execPath, [SCRIPT, '--project-dir', projectDir], {
    encoding: 'utf8',
  });
}

describe('daily-review dashboard update (REQ-004)', () => {
  it('writes today\'s date into a lowercase `**Last updated:**` line', () => {
    // The live dashboard shape: lowercase `Last updated:` and a
    // `## Recent Changes (OpenSpec)` heading, no `## Recent Activity`.
    const dir = fixtureProject(`# Fixture — Project Dashboard

**Last updated:** 2026-04-07

## Current Status
_Project initialized._

## Recent Changes (OpenSpec)
| Date | Agent | Action |
|------|-------|--------|
`);
    const result = runReview(dir);
    assert.equal(result.status, 0, result.stderr);

    const written = readFileSync(join(dir, 'pm/DASHBOARD.md'), 'utf8');
    // The written content — not merely that the file was written — carries
    // today's date on the line that previously never matched.
    assert.match(written, new RegExp(`\\*\\*Last updated:\\*\\* ${TODAY}`),
      'dashboard must show today\'s date on the existing lowercase line');
  });

  it('inserts the activity row under the heading that actually exists', () => {
    const dir = fixtureProject(`# Fixture — Project Dashboard

**Last updated:** 2026-04-07

## Current Status
_Project initialized._

## Recent Changes (OpenSpec)
| Date | Agent | Action |
|------|-------|--------|
`);
    const result = runReview(dir);
    assert.equal(result.status, 0, result.stderr);

    const written = readFileSync(join(dir, 'pm/DASHBOARD.md'), 'utf8');
    const headingIdx = written.indexOf('## Recent Changes (OpenSpec)');
    assert.ok(headingIdx >= 0, 'fixture heading must still be present');
    const row = `| ${TODAY} `;
    const rowIdx = written.indexOf(row);
    assert.ok(rowIdx > headingIdx, 'activity row must land inside the existing heading section');
    assert.match(written.slice(headingIdx, rowIdx), /\| Date \| Agent \| Action \|.*\n\|[-| ]+\|\n/s,
      'activity row must follow the table separator under the existing heading');
    assert.match(written, /\| System \| Daily review completed \|/,
      'activity entry must be recorded');
  });

  it('still updates a framework-template dashboard (`## Recent Activity`, capital U)', () => {
    // The template from setup.mjs uses `**Last Updated:**` and
    // `## Recent Activity` — that shape must keep working too.
    const dir = fixtureProject(`# Fixture — Project Dashboard

**Last Updated:** 2026-04-07

## Current Status
_Project initialized._

## Agent Roster
| Agent | Role |

## Recent Activity
| Date | Agent | Action |
|------|-------|--------|
`);
    const result = runReview(dir);
    assert.equal(result.status, 0, result.stderr);

    const written = readFileSync(join(dir, 'pm/DASHBOARD.md'), 'utf8');
    assert.match(written, new RegExp(`\\*\\*Last Updated:\\*\\* ${TODAY}`),
      'template dashboard must show today\'s date');
    const headingIdx = written.indexOf('## Recent Activity');
    const rowIdx = written.indexOf(`| ${TODAY} `);
    assert.ok(rowIdx > headingIdx, 'activity row must land under ## Recent Activity');
  });

  it('reports missing expected headings on stderr instead of silently no-op\'ing', () => {
    // Neither `**Last Updated:**` nor any activity heading exists.
    const dir = fixtureProject(`# Fixture — Project Dashboard

## Current Status
_No date line, no activity heading here._
`);
    const result = runReview(dir);
    assert.equal(result.status, 0, 'script must not crash on a degraded dashboard');
    assert.match(result.stderr, /Last Updated|activity heading/,
      'missing headings must be reported on stderr (REQ-004)');
  });

  it('regression: the old code failed this fixture (capital-U regex, ghost heading)', () => {
    // Re-run the real-world shape that was silently broken for months and
    // prove the written content changed — the old test asserted only that
    // the file was written, which passed while the date stayed stale.
    const original = `# Fixture — Project Dashboard

**Last updated:** 2026-04-07

## Recent Changes (OpenSpec)
| Date | Agent | Action |
|------|-------|--------|
`;
    const dir = fixtureProject(original);
    const result = runReview(dir);
    assert.equal(result.status, 0, result.stderr);

    const written = readFileSync(join(dir, 'pm/DASHBOARD.md'), 'utf8');
    assert.notEqual(written, original, 'dashboard content must actually change');
    assert.ok(written.includes(TODAY), 'written dashboard must carry today\'s date');
  });
});