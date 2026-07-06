/**
 * checklist-growth.test.mjs — Curriculum Ph5: Senior-dev checklist that GROWS
 *
 * Tests that pattern-hunt appends one-line checklist items to the project's
 * senior-dev review checklist file when recurring patterns are confirmed.
 *
 * Requirements tested:
 *   - Append: new recurring pattern adds a checklist item under ## Auto-added
 *   - Idempotent: re-running does not duplicate items
 *   - No-op: when no checklist file exists, patterns are skipped gracefully
 *   - Dry-run: reports what it would do without modifying the file
 *
 * Run with:
 *   node --test agents/__tests__/checklist-growth.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = resolve(__dirname, '..');
const SCRIPT = join(AGENTS_DIR, 'pattern-hunt.mjs');
const TMP_PROJECT = join(tmpdir(), `sdlc-checklist-test-${process.pid}`);

function runHunt(args = []) {
  return execFileSync(process.execPath, [SCRIPT, '--json', ...args], {
    encoding: 'utf8',
    cwd: TMP_PROJECT,
    env: { ...process.env, SDLC_PROJECT_DIR: TMP_PROJECT },
  });
}

function review(n, issue) {
  return `## Review: change ${n}

**Commit:** abcde${n}0
**Verdict:** CHANGES_REQUESTED

### Issues Found

1. ${issue}

_Reviewed by Richmond Avenal at 2026-07-0${n}T00:00:00Z_
`;
}

const CHECKLIST_TEMPLATE = `# Review Checklist

Use this checklist before marking any task complete or submitting work for review.

## Code Quality

- [ ] No \`any\` types — every value has an explicit, meaningful type
- [ ] No \`console.log\` left in production code — use a logger or remove debug output

## Test Coverage

- [ ] Every new function has at least one test
- [ ] Every bug fix has a regression test
`;

describe('pattern-hunt — Checklist growth (curriculum Ph5)', () => {
  before(() => {
    mkdirSync(join(TMP_PROJECT, 'agents', 'reviewer', 'reviews'), { recursive: true });
    mkdirSync(join(TMP_PROJECT, 'agents', 'reviewer', 'memory'), { recursive: true });
    writeFileSync(join(TMP_PROJECT, 'agents', 'project.json'), JSON.stringify({
      name: 'checklist-fixture', projectDir: TMP_PROJECT, appDir: '.', testCmd: 'true',
      agents: ['reviewer'],
    }));
    // Three reviews with the same recurring issue (>= threshold 3)
    for (let n = 1; n <= 3; n++) {
      writeFileSync(join(TMP_PROJECT, 'agents', 'reviewer', 'reviews', `review-${n}.md`),
        review(n, '[major] console.log found in production code — remove or replace with logger'));
    }
    // Give the fixture a git repo so git-log analysis paths run quietly
    execFileSync('git', ['init', '-q'], { cwd: TMP_PROJECT });
    execFileSync('git', ['-C', TMP_PROJECT, 'config', 'user.email', 't@example.com']);
    execFileSync('git', ['-C', TMP_PROJECT, 'config', 'user.name', 'Checklist Test']);
    execFileSync('git', ['-C', TMP_PROJECT, 'add', '.']);
    execFileSync('git', ['-C', TMP_PROJECT, 'commit', '-q', '-m', 'fixture']);
  });

  after(() => {
    rmSync(TMP_PROJECT, { recursive: true, force: true });
  });

  it('appends a checklist item when recurring pattern is confirmed and checklist exists', () => {
    // Create the checklist file before first run
    writeFileSync(
      join(TMP_PROJECT, 'agents', 'reviewer', 'checklist.md'),
      CHECKLIST_TEMPLATE,
    );

    const out = JSON.parse(runHunt());
    assert.ok(out.recurringPatterns.length >= 1, 'fixture must produce a recurring pattern');
    assert.ok(out.checklistGrowth, 'output must include the checklistGrowth section');
    const appended = out.checklistGrowth.details.filter(d => d.action === 'appended');
    assert.ok(appended.length >= 1, `at least one checklist item appended, got ${JSON.stringify(out.checklistGrowth)}`);

    // Read the checklist file and verify the auto-added section
    const checklist = readFileSync(join(TMP_PROJECT, 'agents', 'reviewer', 'checklist.md'), 'utf8');
    assert.ok(checklist.includes('## Auto-added by pattern-hunt'),
      'checklist must contain the Auto-added section header');
    assert.ok(checklist.includes('- [ ] console-log:'),
      'checklist must contain the console-log item');
    assert.ok(checklist.includes('seen in 3 reviews'),
      'checklist item must reference the occurrence count');
  });

  it('is idempotent — re-running does not duplicate checklist items', () => {
    const out = JSON.parse(runHunt());
    const appended = out.checklistGrowth.details.filter(d => d.action === 'appended');
    assert.equal(appended.length, 0, 'no new items appended on re-run');
    const skipped = out.checklistGrowth.details.filter(
      d => d.action === 'skipped' && d.reason === 'checklist item already exists'
    );
    assert.ok(skipped.length >= 1, 'existing item is reported as skipped');

    // Verify exactly one console-log item in the checklist
    const checklist = readFileSync(join(TMP_PROJECT, 'agents', 'reviewer', 'checklist.md'), 'utf8');
    const matches = checklist.match(/- \[ \] console-log:/g);
    assert.equal(matches.length, 1, 'exactly one console-log item in checklist');
  });

  it('no-op with skip reason when no checklist file exists', () => {
    // Remove the checklist file
    rmSync(join(TMP_PROJECT, 'agents', 'reviewer', 'checklist.md'), { force: true });

    const out = JSON.parse(runHunt());
    assert.ok(out.checklistGrowth, 'output must include the checklistGrowth section');
    const allSkipped = out.checklistGrowth.details.every(
      d => d.action === 'skipped' && d.reason === 'no checklist file found'
    );
    assert.ok(allSkipped, 'all patterns skipped when no checklist file exists');
    assert.equal(out.checklistGrowth.appended, 0, 'nothing appended');
  });

  it('--dry-run reports what it would append without modifying the file', () => {
    // Re-create the checklist file
    writeFileSync(
      join(TMP_PROJECT, 'agents', 'reviewer', 'checklist.md'),
      CHECKLIST_TEMPLATE,
    );

    const out = JSON.parse(runHunt(['--dry-run']));
    assert.ok(out.checklistGrowth, 'output must include the checklistGrowth section');
    // In dry-run, the console-log item may not exist yet (we removed it above),
    // or may exist from the idempotent test. Either way, dry-run just reports.
    const wouldAppend = out.checklistGrowth.details.filter(d => d.action === 'would-append');
    const skipped = out.checklistGrowth.details.filter(d => d.action === 'skipped');
    assert.ok(wouldAppend.length > 0 || skipped.length > 0,
      'dry-run must report either would-append or skipped details');

    // Verify the checklist file was NOT modified (only template content)
    const checklist = readFileSync(join(TMP_PROJECT, 'agents', 'reviewer', 'checklist.md'), 'utf8');
    // The file should NOT have the auto-added section (dry-run doesn't write)
    assert.ok(!checklist.includes('## Auto-added by pattern-hunt'),
      'dry-run must not modify the checklist file');
  });
});