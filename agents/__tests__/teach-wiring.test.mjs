/**
 * teach-wiring.test.mjs — Curriculum Ph7: the TEACH step of the improvement
 * loop (Find → Defeat → Teach). pattern-hunt must record recurring patterns
 * into agent long-term memory (idempotently), not just into a report.
 *
 * Runs the pattern-hunt CLI against a temp project fixture with a reviews
 * corpus that trips the recurrence threshold.
 *
 * Run with:
 *   node --test agents/__tests__/teach-wiring.test.mjs
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
const TMP_PROJECT = join(tmpdir(), `sdlc-teach-test-${process.pid}`);

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

describe('pattern-hunt — Teach step (curriculum Ph7)', () => {
  before(() => {
    mkdirSync(join(TMP_PROJECT, 'agents', 'reviewer', 'reviews'), { recursive: true });
    mkdirSync(join(TMP_PROJECT, 'agents', 'reviewer', 'memory'), { recursive: true });
    writeFileSync(join(TMP_PROJECT, 'agents', 'project.json'), JSON.stringify({
      name: 'teach-fixture', projectDir: TMP_PROJECT, appDir: '.', testCmd: 'true',
      agents: ['reviewer'],
    }));
    // Three reviews with the same recurring issue class (>= threshold 3)
    for (let n = 1; n <= 3; n++) {
      writeFileSync(join(TMP_PROJECT, 'agents', 'reviewer', 'reviews', `review-${n}.md`),
        review(n, '[major] Service call is missing error handling — errors are silently swallowed'));
    }
    // Give the fixture a git repo so git-log analysis paths run quietly
    execFileSync('git', ['init', '-q'], { cwd: TMP_PROJECT });
    execFileSync('git', ['-C', TMP_PROJECT, 'config', 'user.email', 't@example.com']);
    execFileSync('git', ['-C', TMP_PROJECT, 'config', 'user.name', 'Teach Test']);
    execFileSync('git', ['-C', TMP_PROJECT, 'add', '.']);
    execFileSync('git', ['-C', TMP_PROJECT, 'commit', '-q', '-m', 'fixture']);
  });

  after(() => {
    rmSync(TMP_PROJECT, { recursive: true, force: true });
  });

  it('records a recurring pattern into agent long-term memory', () => {
    const out = JSON.parse(runHunt());
    assert.ok(out.recurringPatterns.length >= 1, 'fixture must produce a recurring pattern');
    assert.ok(out.teaching, 'output must include the teaching section');
    assert.ok(out.teaching.taught >= 1, `at least one lesson taught, got ${JSON.stringify(out.teaching)}`);

    const mem = JSON.parse(readFileSync(join(TMP_PROJECT, 'agents', 'reviewer', 'memory', 'long-term.json'), 'utf8'));
    const taught = mem.entries.filter(e => e.source === 'pattern-hunt');
    assert.ok(taught.length >= 1, 'long-term memory must carry the lesson');
    assert.match(taught[0].content, /Recurring anti-pattern \(3x/);
    assert.ok(taught[0].pattern, 'entry carries the pattern category for idempotency');
  });

  it('is idempotent — re-running does not duplicate the lesson', () => {
    const out = JSON.parse(runHunt());
    assert.equal(out.teaching.taught, 0, 'nothing new to teach');
    assert.ok(out.teaching.alreadyTaught >= 1);
    const mem = JSON.parse(readFileSync(join(TMP_PROJECT, 'agents', 'reviewer', 'memory', 'long-term.json'), 'utf8'));
    const taught = mem.entries.filter(e => e.source === 'pattern-hunt');
    assert.equal(taught.length, 1, 'exactly one lesson per pattern per agent');
  });

  it('--dry-run teaches nothing but reports what it would do', () => {
    rmSync(join(TMP_PROJECT, 'agents', 'reviewer', 'memory', 'long-term.json'));
    const out = JSON.parse(runHunt(['--dry-run']));
    assert.equal(out.teaching.taught, 0);
    assert.ok(out.teaching.details.some(d => d.action === 'would-teach'));
  });

  it('attributes lessons via commit authorship when resolvable', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'pattern-hunt.mjs'), 'utf8');
    assert.ok(src.includes('resolveCommitAgent'), 'authorship attribution path exists');
    assert.ok(/git log -1 --pretty=%an/.test(src), 'attribution uses git authorship');
  });
});
