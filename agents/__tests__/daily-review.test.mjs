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

import { upsertDashboardSection } from '../cycles/daily-review.mjs';

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

// ---------------------------------------------------------------------------
// upsertDashboardSection tests (CV-118)
// ---------------------------------------------------------------------------
// These target the four rejection points from PR#88 review:
//   1. regex matching sections with content
//   2. section content replacement correctness
//   3. special characters in body / replacement
//   4. edge case coverage
// ---------------------------------------------------------------------------

describe('daily-review upsertDashboardSection — pattern matching (rejection 1)', () => {

  it('replaces an existing section with multiline content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-dashboard-'));
    const path = join(dir, 'test.md');
    writeFileSync(path, [
      '# Dashboard',
      '',
      '## Status',
      'Line one',
      'Line two',
      '',
      '## Metrics',
      '- Completed: 5',
      '- Blocked: 2',
      '',
    ].join('\n'));

    upsertDashboardSection('Metrics', 'New metrics report', path);
    const written = readFileSync(path, 'utf8');
    assert.match(written, /## Metrics\n\nNew metrics report/);
  });

  it('replaces a section at file start with content following it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-dashboard-'));
    const path = join(dir, 'test.md');
    writeFileSync(path, '## Metrics\nOld\n\n## Status\nOK\n');

    upsertDashboardSection('Metrics', 'New', path);
    const written = readFileSync(path, 'utf8');
    assert.match(written, /^## Metrics\n\nNew/);
    assert.match(written, /## Status\nOK/);
  });

  it('handles section with no blank line between heading and content', () => {
    // The content immediately follows the heading line (no blank line).
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-dashboard-'));
    const path = join(dir, 'test.md');
    writeFileSync(path, '## A\nContent here\n## B\nMore here\n');

    upsertDashboardSection('A', 'Replaced', path);
    const written = readFileSync(path, 'utf8');
    assert.match(written, /## A\n\nReplaced/);
    assert.match(written, /## B\nMore here/);
  });

  it('handles section with `## ` mid-line (not a heading boundary)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-dashboard-'));
    const path = join(dir, 'test.md');
    writeFileSync(path, '## References\nSee ## the-ref for details\n## Other\nData\n');

    upsertDashboardSection('References', 'Updated refs', path);
    const written = readFileSync(path, 'utf8');
    assert.match(written, /## References\n\nUpdated refs/);
    assert.doesNotMatch(written, /the-ref for details/);
    // The next section MUST be preserved — this was rejection #1 (regex
    // matching across multiple sections when body contains mid-line ##).
    assert.match(written, /## Other\nData/);
  });

  it('regression: section with mid-line ## must not eat the next heading boundary', () => {
    // Previous regex [\s\S]*?(?=\n## |$) would consume past the mid-line ##
    // reference and eat the next section's heading + content too.
    const path = join(mkdtempSync(join(tmpdir(), 'sdlc-dashboard-')), 'test.md');
    writeFileSync(path, '## Section A\nContent with ## mid-line ref\n## Section B\nPreserved\n## Section C\nAlso preserved\n');

    upsertDashboardSection('Section A', 'Updated A', path);
    const written = readFileSync(path, 'utf8');
    assert.match(written, /## Section A\n\nUpdated A/);
    assert.match(written, /## Section B\nPreserved/);
    assert.match(written, /## Section C\nAlso preserved/);
    const headingCount = (written.match(/^## /gm) || []).length;
    assert.equal(headingCount, 3, 'all three headings must be preserved');
  });

});

describe('daily-review upsertDashboardSection — content replacement (rejection 2)', () => {

  it('replaces body and leaves other sections intact', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-dashboard-'));
    const path = join(dir, 'test.md');
    writeFileSync(path, '## Status\nFirst\n\n## Metrics\nSecond\n\n## Action\nThird\n');

    upsertDashboardSection('Metrics', 'Updated metrics', path);
    const written = readFileSync(path, 'utf8');
    assert.match(written, /## Metrics\n\nUpdated metrics/);
    assert.match(written, /## Status\nFirst/);
    assert.match(written, /## Action\nThird/);
    const headings = written.match(/^## /gm);
    assert.equal(headings?.length, 3, 'must have exactly 3 section headings');
  });

  it('replaces with empty body', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-dashboard-'));
    const path = join(dir, 'test.md');
    writeFileSync(path, '## Section\nOld\n\n## Other\nData\n');

    upsertDashboardSection('Section', '', path);
    const written = readFileSync(path, 'utf8');
    assert.match(written, /## Section\n\n/);
    assert.doesNotMatch(written, /Old/);
  });

  it('calling twice with different bodies leaves exactly one section with the second body', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-dashboard-'));
    const path = join(dir, 'test.md');
    writeFileSync(path, '# Dashboard\n\n## Status\nAll good\n');

    upsertDashboardSection('Metrics', 'Version 1', path);
    upsertDashboardSection('Metrics', 'Version 2', path);

    const written = readFileSync(path, 'utf8');
    assert.equal(written.match(/## Metrics/g)?.length, 1, 'exactly one Metrics section');
    assert.match(written, /## Metrics\n\nVersion 2/);
    assert.doesNotMatch(written, /Version 1/);
    assert.match(written, /## Status\nAll good/);
  });

  it('returns true when replacing and false when appending', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-dashboard-'));
    const path = join(dir, 'test.md');
    writeFileSync(path, '## Target\nContent\n');

    assert.equal(upsertDashboardSection('Target', 'Updated', path), true);
    assert.equal(upsertDashboardSection('Missing', 'Appended', path), false);
  });

});

describe('daily-review upsertDashboardSection — special chars (rejection 3)', () => {

  it('body with dollar signs ($&, $1, $`)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-dashboard-'));
    const path = join(dir, 'test.md');
    writeFileSync(path, '## Section\nOld\n\n## Other\nData\n');

    upsertDashboardSection('Section', 'Cost: $500, plus $& and $1 and $`', path);
    const written = readFileSync(path, 'utf8');
    assert.match(written, /\$500/);
    assert.match(written, /\$&/);
    assert.match(written, /\$1/);
  });

  it('body with backslashes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-dashboard-'));
    const path = join(dir, 'test.md');
    writeFileSync(path, '## Path\nOld\n\n## Other\nData\n');

    upsertDashboardSection('Path', 'C:\\Users\\test\\file.txt', path);
    const written = readFileSync(path, 'utf8');
    assert.match(written, /C:\\Users/);
    assert.match(written, /\\file\.txt/);
  });

  it('body with regex special characters', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-dashboard-'));
    const path = join(dir, 'test.md');
    writeFileSync(path, '## Config\nOld\n\n## Other\nData\n');

    upsertDashboardSection('Config', 'value={a+b} (test) [list] ^.*$', path);
    const written = readFileSync(path, 'utf8');
    assert.match(written, /\{a\+b\}/);
    assert.match(written, /\[list\]/);
  });

  it('title with dollars, brackets, pipe, and parens', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-dashboard-'));
    const path = join(dir, 'test.md');
    writeFileSync(path, '## Status (v1.0) [alpha]\nOld\n\n## Other\nData\n');

    upsertDashboardSection('Status (v1.0) [alpha]', 'Updated', path);
    const written = readFileSync(path, 'utf8');
    assert.match(written, /## Status \(v1\.0\) \[alpha\]\n\nUpdated/);
  });

  it('title with dollar sign $', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-dashboard-'));
    const path = join(dir, 'test.md');
    writeFileSync(path, '## $price\nOld\n\n## Other\nData\n');

    upsertDashboardSection('$price', 'Updated', path);
    const written = readFileSync(path, 'utf8');
    assert.match(written, /## \$price\n\nUpdated/);
    assert.doesNotMatch(written, /Old/);
  });

});

describe('daily-review upsertDashboardSection — edge cases (rejection 4)', () => {

  it('appends to an empty file without leading newlines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-dashboard-'));
    const path = join(dir, 'test.md');
    writeFileSync(path, '');

    upsertDashboardSection('New', 'Content', path);
    const written = readFileSync(path, 'utf8');
    assert.match(written, /^## New\n\nContent/);
  });

  it('replaces the only section in a single-section file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-dashboard-'));
    const path = join(dir, 'test.md');
    writeFileSync(path, '## Solo\nOriginal\n');

    upsertDashboardSection('Solo', 'Replaced', path);
    const written = readFileSync(path, 'utf8');
    assert.match(written, /^## Solo\n\nReplaced/);
  });

  it('section at EOF without trailing newline', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-dashboard-'));
    const path = join(dir, 'test.md');
    writeFileSync(path, '## Status\nOK\n## Metrics\nOld');

    upsertDashboardSection('Metrics', 'New', path);
    const written = readFileSync(path, 'utf8');
    assert.match(written, /## Metrics\n\nNew/);
  });

  it('body with blank line and indentation', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'sdlc-dashboard-')), 'test.md');
    writeFileSync(path, '## Section\nOld\n');

    upsertDashboardSection('Section', 'First\n\n\tIndented\nLast', path);
    const written = readFileSync(path, 'utf8');
    assert.match(written, /## Section\n\nFirst\n\n\tIndented\nLast/);
  });

  it('body with triple-backtick code fence', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'sdlc-dashboard-')), 'test.md');
    writeFileSync(path, '## Section\nOld\n\n## Other\nData\n');

    upsertDashboardSection('Section', '```\ncode\n```', path);
    const written = readFileSync(path, 'utf8');
    assert.match(written, /```/);
  });

  it('appends with pipe table body containing newlines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-dashboard-'));
    const path = join(dir, 'test.md');
    writeFileSync(path, '# Dashboard\n\n## Status\nAll good\n');

    upsertDashboardSection('OpenSpec status', '| Change | Phase |\n|--------|-------|\n| CV-118 | tasks |', path);
    const written = readFileSync(path, 'utf8');
    assert.match(written, /## OpenSpec status\n\n\| Change \| Phase \|/);
    assert.match(written, /## Status\nAll good/);
  });

  it('does not mutate content when section title appears mid-line', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'sdlc-dashboard-')), 'test.md');
    writeFileSync(path, '## Heading\nRefer to ## Section in docs\n## Footer\nEnd\n');

    upsertDashboardSection('Footer', 'Updated footer', path);
    const written = readFileSync(path, 'utf8');
    // The mid-line ## reference must not be treated as a heading
    assert.match(written, /Refer to ## Section/);
    assert.match(written, /## Footer\n\nUpdated footer/);
    // The ## Heading section must be preserved and its body must still
    // contain the mid-line ## reference
    assert.match(written, /## Heading\nRefer to ## Section/);
  });

});

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