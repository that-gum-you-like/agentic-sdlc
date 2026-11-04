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

import { openspecStatusTable, bugMetrics, runUserTests } from '../cycles/daily-review.mjs';

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


/**
 * CV-119 / CV-REQ-020: the OpenSpec status table.
 *
 * The table is built from what is on disk and nothing else, so the fixture is
 * a real `openspec/changes` tree: two active changes, one archived change, one
 * change with neither status.json nor tasks.md, and a stray file at the root.
 */
function fixtureChangesDir() {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-openspec-status-'));

  // Active change with a full status.json and a part-done tasks.md.
  mkdirSync(join(dir, 'alpha'));
  writeFileSync(join(dir, 'alpha/status.json'), JSON.stringify({
    status: 'proposed', phase: 'tasks', readiness: 'ready-for-dev',
  }));
  writeFileSync(join(dir, 'alpha/tasks.md'), [
    '- [x] **A-1**: done one',
    '- [x] **A-2**: done two',
    '- [ ] **A-3**: pending three',
    '- [ ] **A-4**: pending four',
    '- [ ] **A-5**: pending five',
  ].join('\n'));

  // Active change with no readiness field and one of two tasks done.
  mkdirSync(join(dir, 'beta'));
  writeFileSync(join(dir, 'beta/status.json'), JSON.stringify({
    status: 'implemented', phase: 'verify',
  }));
  writeFileSync(join(dir, 'beta/tasks.md'), '- [x] **B-1**: done\n- [ ] **B-2**: pending\n');

  // Active change with nothing measurable on disk.
  mkdirSync(join(dir, 'zeta'));

  // Archived change — counted, never listed as a row.
  mkdirSync(join(dir, 'archive/2026-01-01-gamma'), { recursive: true });
  writeFileSync(join(dir, 'archive/2026-01-01-gamma/status.json'), JSON.stringify({
    status: 'implemented', phase: 'verify', readiness: 'done',
  }));

  // Stray file at the root of the changes dir — not a change.
  writeFileSync(join(dir, 'NOTES.md'), 'not a change directory\n');

  return dir;
}

describe('openspecStatusTable (CV-REQ-020)', () => {
  it('lists each active change with phase/status/readiness/tasks and both counts', () => {
    const table = openspecStatusTable(fixtureChangesDir());

    assert.match(table, /Active changes: 3 \| Archived: 1/,
      'three active change dirs and one archived dir must be counted');
    assert.ok(table.includes('| alpha | tasks | proposed | ready-for-dev | 2/5 |'),
      `alpha row wrong:\n${table}`);
    assert.ok(table.includes('| beta | verify | implemented | - | 1/2 |'),
      `beta row wrong (missing readiness renders '-', 1 of 2 tasks done):\n${table}`);
    assert.ok(table.includes('| zeta | - | - | - | - |'),
      `zeta row wrong (no status.json / tasks.md renders '-'):\n${table}`);
    assert.ok(!table.includes('gamma'),
      'archived changes are counted, not listed as active rows');
    assert.ok(!table.includes('NOTES.md'),
      'a file at the changes-dir root is not a change');
  });

  it('renders rows alphabetically so the dashboard does not churn between runs', () => {
    const table = openspecStatusTable(fixtureChangesDir());
    const alpha = table.indexOf('| alpha |');
    const beta = table.indexOf('| beta |');
    const zeta = table.indexOf('| zeta |');
    assert.ok(alpha >= 0 && beta > alpha && zeta > beta,
      `rows must be alpha, beta, zeta in that order:\n${table}`);
  });

  it('does not throw and counts zero when the changes dir is missing', () => {
    const table = openspecStatusTable(join(tmpdir(), 'does-not-exist-openspec-changes'));
    assert.match(table, /Active changes: 0 \| Archived: 0/);
    assert.match(table, /\| Change \| Phase \| Status \| Readiness \| Tasks \|/,
      'the header must still be present for an empty tree');
  });

  it('distinguishes an empty tasks.md (0/0) from a missing one (-)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-openspec-empty-'));
    mkdirSync(join(dir, 'delta'));
    writeFileSync(join(dir, 'delta/status.json'), JSON.stringify({ status: 'draft', phase: 'design', readiness: 'draft' }));
    writeFileSync(join(dir, 'delta/tasks.md'), '# Tasks\n\n_None authored yet._\n');

    const table = openspecStatusTable(dir);
    assert.ok(table.includes('| delta | design | draft | draft | 0/0 |'),
      `a present-but-empty tasks.md is measured as 0/0, not '-' (missing):\n${table}`);
  });
});

/**
 * CV-120 / CV-REQ-020: bug + fix-task metrics.
 *
 * The function reads only the two trees it is handed, so the fixtures are real
 * `openspec/changes` and `tasks/queue` directories under a tmp dir — never the
 * repo's own (whose contents change with every merged PR).
 */
function fixtureBugTree({ active = [], archived = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-bug-metrics-'));
  const changesDir = join(root, 'changes');
  const queueDir = join(root, 'queue');
  mkdirSync(changesDir, { recursive: true });
  mkdirSync(queueDir, { recursive: true });
  for (const name of active) mkdirSync(join(changesDir, name), { recursive: true });
  for (const name of archived) mkdirSync(join(changesDir, 'archive', name), { recursive: true });
  return { changesDir, queueDir };
}

function writeQueueTask(queueDir, id, status) {
  writeFileSync(join(queueDir, `${id}.json`), JSON.stringify({ id, status }));
}

describe('bugMetrics (CV-REQ-020)', () => {
  it('reports 50% when one bug is active and its sibling is archived', () => {
    const { changesDir, queueDir } = fixtureBugTree({
      active: ['bug-1234-login-crash'],
      archived: ['2026-01-01-bug-1200-timeout'],
    });

    const block = bugMetrics(changesDir, queueDir);
    assert.match(block, /Active: 1 \| Archived: 1 \| Resolution rate: 50%/,
      `one active and one archived bug must resolve to 50%:\n${block}`);
  });

  it('counts prod-error-* changes as bugs alongside bug-* changes', () => {
    const { changesDir, queueDir } = fixtureBugTree({
      active: ['prod-error-4711-checkout-500'],
      archived: ['2025-12-31-prod-error-4700-queue-stall', '2025-12-30-bug-4100-null'],
    });

    const block = bugMetrics(changesDir, queueDir);
    assert.match(block, /Active: 1 \| Archived: 2 \| Resolution rate: 67%/,
      `prod-error and bug changes count together (1 of 3 resolved, rounded):\n${block}`);
  });

  it('ignores non-bug changes and never counts the archive dir itself as a bug', () => {
    const { changesDir, queueDir } = fixtureBugTree({
      active: ['curriculum-v2-conformance', 'bug-9001-stale-lock'],
      archived: ['2026-01-01-archived-feature'],
    });

    const block = bugMetrics(changesDir, queueDir);
    assert.match(block, /Active: 1 \| Archived: 0 \| Resolution rate: 0%/,
      `only bug-* changes are counted; 'archive' is not a bug:\n${block}`);
  });

  it('renders `none` — not 0% and not NaN — when no bug changes exist', () => {
    const { changesDir, queueDir } = fixtureBugTree({ active: ['some-feature'] });

    const block = bugMetrics(changesDir, queueDir);
    assert.match(block, /Active: 0 \| Archived: 0 \| Resolution rate: none/,
      `an empty denominator must read 'none':\n${block}`);
    assert.ok(!block.includes('NaN'), 'resolution rate must never render NaN');
    assert.ok(!block.includes('0%'), 'no bugs recorded must not look like 0% resolved');
  });

  it('splits FIX-* tasks into pending and completed, counting blocked as pending', () => {
    const { changesDir, queueDir } = fixtureBugTree({ active: ['bug-1'] });
    writeQueueTask(queueDir, 'FIX-70', 'completed');
    writeQueueTask(queueDir, 'FIX-71', 'pending');
    writeQueueTask(queueDir, 'FIX-72', 'blocked');
    writeQueueTask(queueDir, 'FIX-73', 'in_progress');
    writeQueueTask(queueDir, 'OS-curriculum-v2-conformance-1', 'pending');

    const block = bugMetrics(changesDir, queueDir);
    assert.match(block, /\| Pending FIX tasks \| 3 \|/,
      `pending, blocked and in-progress repairs are all outstanding:\n${block}`);
    assert.match(block, /\| Completed FIX tasks \| 1 \|/,
      `only a completed FIX task is finished:\n${block}`);
  });

  it('renders zeros for a missing changes dir and a missing queue dir without throwing', () => {
    const missing = join(tmpdir(), 'sdlc-bug-metrics-does-not-exist');

    const block = bugMetrics(join(missing, 'changes'), join(missing, 'queue'));
    assert.match(block, /Active: 0 \| Archived: 0 \| Resolution rate: none/,
      `absent trees count zero and read 'none':\n${block}`);
    assert.match(block, /\| Pending FIX tasks \| 0 \|/);
    assert.match(block, /\| Completed FIX tasks \| 0 \|/);
  });

  it('skips malformed FIX task files instead of failing the whole report', () => {
    const { changesDir, queueDir } = fixtureBugTree({ archived: ['2026-01-01-bug-1'] });
    writeFileSync(join(queueDir, 'FIX-99.json'), '{ not valid json');
    writeQueueTask(queueDir, 'FIX-98', 'pending');

    const block = bugMetrics(changesDir, queueDir);
    assert.match(block, /\| Pending FIX tasks \| 1 \|/,
      `the readable FIX task is still counted:\n${block}`);
    assert.match(block, /Resolution rate: 100%/, 'all bugs archived is 100%');
  });
});

describe('upsertDashboardSection (CV-REQ-020)', () => {
  const tmpFile = (text) => {
    const f = join(mkdtempSync(join(tmpdir(), 'dash-')), 'DASHBOARD.md');
    if (text !== null) writeFileSync(f, text);
    return f;
  };
  let upsert;
  before(async () => { ({ upsertDashboardSection: upsert } = await import('../cycles/daily-review.mjs')); });

  it('replaces only the named section, keeping its neighbours', () => {
    const f = tmpFile('# Dash\n\n## A\n\nold a\n\n## B\n\nkeep b\n');
    assert.equal(upsert('A', 'new a', f), true);
    assert.equal(readFileSync(f, 'utf8'), '# Dash\n\n## A\n\nnew a\n\n## B\n\nkeep b\n');
  });

  it('a body with "## " mid-line or ### subheadings stays inside the section', () => {
    const f = tmpFile('## A\n\nx\n## B\n\nb\n');
    upsert('A', 'see ## not a heading\n### sub\ny', f);
    const out = readFileSync(f, 'utf8');
    assert.match(out, /## A\n\nsee ## not a heading\n### sub\ny\n\n## B\n\nb\n/);
    upsert('A', 'z', f);
    assert.doesNotMatch(readFileSync(f, 'utf8'), /### sub/, 'the old ### subheading is part of A and is replaced');
  });

  it('titles with regex characters need no escaping; $& in the body is verbatim', () => {
    const f = tmpFile('## Bug metrics (bug-*)\n\nold\n');
    assert.equal(upsert('Bug metrics (bug-*)', 'cost $& and $1', f), true);
    assert.equal(readFileSync(f, 'utf8'), '## Bug metrics (bug-*)\n\ncost $& and $1\n');
  });

  it('appends when absent, and creates a missing file', () => {
    const f = tmpFile('# Dash\n');
    assert.equal(upsert('New', 'n', f), false);
    assert.equal(readFileSync(f, 'utf8'), '# Dash\n\n## New\n\nn\n');
    const g = tmpFile(null);
    upsert('Only', 'o', g);
    assert.equal(readFileSync(g, 'utf8'), '## Only\n\no\n');
  });

  it('is idempotent', () => {
    const f = tmpFile('## A\n\nx\n');
    upsert('A', 'y', f); const once = readFileSync(f, 'utf8');
    upsert('A', 'y', f);
    assert.equal(readFileSync(f, 'utf8'), once);
  });
});

/**
 * CV-REQ-015: runUserTests — browser user-test integration in the daily review.
 *
 * The function accepts a config and an optional {runner} for dependency injection.
 * - With a Playwright config, the runner is called and the dashboard shows PASS or
 *   FAIL with the pm/user-tests/<date> path.
 * - Without a config, the runner is NOT called and the dashboard shows skipped.
 */

/** Build a fixture project dir with an optional playwright.config file. */
function fixtureForUserTests({ withPlaywrightConfig = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-usertests-'));
  mkdirSync(join(dir, 'agents'), { recursive: true });
  mkdirSync(join(dir, 'pm'), { recursive: true });
  writeFileSync(
    join(dir, 'agents/project.json'),
    JSON.stringify({ name: 'user-test-fixture', notification: { provider: 'none', triggers: {} } })
  );
  writeFileSync(join(dir, 'pm/DASHBOARD.md'),
    '# Fixture — User Test Dashboard\n\n**Last updated:** 2026-11-03\n\n## Current Status\n_Initial._\n');
  if (withPlaywrightConfig) {
    writeFileSync(join(dir, 'playwright.config.ts'), 'export default {};\n');
  }
  return dir;
}

/** Build a minimal config object matching loadConfig() shape. */
function fixtureConfig(dir) {
  return {
    projectDir: dir,
    appPath: dir,
    dashboardPath: join(dir, 'pm/DASHBOARD.md'),
  };
}

describe('runUserTests (CV-REQ-015)', () => {
  it('calls the runner when Playwright config exists and records PASS on success', () => {
    const dir = fixtureForUserTests({ withPlaywrightConfig: true });
    const config = fixtureConfig(dir);
    const tracker = { called: 0 };

    const result = runUserTests(config, {
      runner: (label, script, args) => {
        tracker.called++;
        assert.equal(label, 'User tests');
        assert.equal(script, 'browser-user-test.mjs');
        assert.equal(args.join(' '), 'run');
        return { label, ok: true };
      },
    });

    assert.equal(tracker.called, 1, 'runner must be called exactly once when config exists');
    assert.equal(result.status, 'pass');

    const dashboard = readFileSync(config.dashboardPath, 'utf8');
    assert.match(dashboard, /## User tests/,
      'dashboard must contain a User tests section');
    assert.match(dashboard, /PASS \| pm\/user-tests\//,
      'dashboard must show PASS and the pm/user-tests path when tests pass');
  });

  it('records FAIL when the runner returns ok=false', () => {
    const dir = fixtureForUserTests({ withPlaywrightConfig: true });
    const config = fixtureConfig(dir);

    const result = runUserTests(config, {
      runner: (label) => ({ label, ok: false }),
    });

    assert.equal(result.status, 'fail');

    const dashboard = readFileSync(config.dashboardPath, 'utf8');
    assert.match(dashboard, /FAIL \| pm\/user-tests\//,
      'dashboard must show FAIL and the pm/user-tests path when tests fail');
  });

  it('skips and does not call runner when no Playwright config exists', () => {
    const dir = fixtureForUserTests({ withPlaywrightConfig: false });
    const config = fixtureConfig(dir);
    let runnerCalled = false;

    const result = runUserTests(config, {
      runner: () => {
        runnerCalled = true;
        return { label: 'User tests', ok: true };
      },
    });

    assert.equal(runnerCalled, false, 'runner must NOT be called when no Playwright config');
    assert.equal(result.status, 'skipped');
    assert.equal(result.detail, 'no-playwright-config');

    const dashboard = readFileSync(config.dashboardPath, 'utf8');
    assert.match(dashboard, /## User tests/,
      'dashboard must contain a User tests section even when skipped');
    assert.match(dashboard, /skipped \| no-playwright-config/,
      'dashboard must show skipped with reason no-playwright-config');
  });
});
