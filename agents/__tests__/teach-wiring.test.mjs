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
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
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
        review(n, '[critical] Service call is missing error handling — errors are silently swallowed'));
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
    assert.equal(taught[0].feeling, 'embarrassed', 'critical severity maps to feeling embarrassed');
    assert.match(taught[0].impact, /3/, 'impact mentions recurrence count');
    assert.equal(taught[0].whatIDoNow, 'ruleAdded', 'whatIDoNow is always ruleAdded');
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

// ---------------------------------------------------------------------------
// CV-246: Cross-domain teaching — agents sharing a domain in domains.json
//         get a learnedFrom entry in long-term memory when a peer-agent is
//         taught a recurring pattern.
// ---------------------------------------------------------------------------

const CROSS_TMP = join(tmpdir(), `sdlc-cross-teach-test-${process.pid}`);

function runCrossHunt(args = []) {
  return execFileSync(process.execPath, [SCRIPT, '--json', ...args], {
    encoding: 'utf8',
    cwd: CROSS_TMP,
    env: { ...process.env, SDLC_PROJECT_DIR: CROSS_TMP },
  });
}

/** Shared fixture — sets up three agents: reviewer (taught), peer-reviewer
 *  (shares domain with reviewer), and designer (no shared domain). */
function crossSetUp(domains) {
  for (const name of ['reviewer', 'peer-reviewer', 'designer']) {
    mkdirSync(join(CROSS_TMP, 'agents', name, 'reviews'), { recursive: true });
    mkdirSync(join(CROSS_TMP, 'agents', name, 'memory'), { recursive: true });
  }
  writeFileSync(join(CROSS_TMP, 'agents', 'domains.json'), JSON.stringify(domains, null, 2));
  writeFileSync(join(CROSS_TMP, 'agents', 'project.json'), JSON.stringify({
    name: 'cross-teach-fixture', projectDir: CROSS_TMP, appDir: '.', testCmd: 'true',
    agents: ['reviewer', 'peer-reviewer', 'designer'],
  }));
  // Three reviews triggering a recurring pattern, attributed to reviewer
  for (let n = 1; n <= 3; n++) {
    writeFileSync(join(CROSS_TMP, 'agents', 'reviewer', 'reviews', `review-${n}.md`),
      review(n, '[major] Function uses regex that is fragile and may cause false positives'));
  }
  execFileSync('git', ['init', '-q'], { cwd: CROSS_TMP });
  execFileSync('git', ['-C', CROSS_TMP, 'config', 'user.email', 't@example.com']);
  execFileSync('git', ['-C', CROSS_TMP, 'config', 'user.name', 'Cross Teach Test']);
  execFileSync('git', ['-C', CROSS_TMP, 'add', '.']);
  execFileSync('git', ['-C', CROSS_TMP, 'commit', '-q', '-m', 'fixture']);
}

describe('pattern-hunt — Cross-domain teaching (CV-246)', () => {
  after(() => {
    rmSync(CROSS_TMP, { recursive: true, force: true });
  });

  it('records learnedFrom entry on an agent sharing a domain', () => {
    // reviewer and peer-reviewer share domain "agents/*.mjs"; designer has none
    crossSetUp({
      reviewer: { patterns: ['agents/*.mjs'] },
      'peer-reviewer': { patterns: ['agents/*.mjs'] },
      designer: { patterns: ['design/'] },
    });

    const out = JSON.parse(runCrossHunt());
    assert.ok(out.recurringPatterns.length >= 1, 'fixture must produce a recurring pattern');
    assert.equal(out.teaching.taught, 1, 'reviewer was taught');
    assert.equal(out.teaching.crossTaught, 1, 'peer-reviewer got a cross-taught entry');

    // Verify peer-reviewer has the learnedFrom entry
    const peerMem = JSON.parse(readFileSync(join(CROSS_TMP, 'agents', 'peer-reviewer', 'memory', 'long-term.json'), 'utf8'));
    const learned = peerMem.entries.filter(e => e.source === 'pattern-hunt' && e.learnedFrom === 'reviewer');
    assert.equal(learned.length, 1, 'peer-reviewer has exactly one learnedFrom entry from reviewer');
    assert.ok(learned[0].content.startsWith('Learned from reviewer:'), 'content mentions the teaching agent');

    // Verify designer has NO learnedFrom entry (no shared domain → file never created)
    const desMemPath = join(CROSS_TMP, 'agents', 'designer', 'memory', 'long-term.json');
    if (existsSync(desMemPath)) {
      const desMem = JSON.parse(readFileSync(desMemPath, 'utf8'));
      const desLearned = desMem.entries.filter(e => e.source === 'pattern-hunt');
      assert.equal(desLearned.length, 0, 'designer (no shared domain) has no pattern-hunt entries');
    } else {
      assert.ok(true, 'designer memory file absent — correct for untaught agent');
    }
  });

  it('is idempotent — rerun does not duplicate cross-taught entries', () => {
    const out = JSON.parse(runCrossHunt());
    assert.equal(out.teaching.taught, 0, 'reviewer already taught');
    assert.equal(out.teaching.crossTaught, 0, 'no new cross-teachings');
    // Cross-teaching is implicitly idempotent: when the primary agent is already
    // taught, the cross-teaching block is never entered, so no duplication occurs.
    const peerMem = JSON.parse(readFileSync(join(CROSS_TMP, 'agents', 'peer-reviewer', 'memory', 'long-term.json'), 'utf8'));
    const learned = peerMem.entries.filter(e => e.source === 'pattern-hunt' && e.learnedFrom === 'reviewer');
    assert.equal(learned.length, 1, 'exactly one learnedFrom entry remains');
  });

  it('--dry-run writes nothing for cross-teaching', () => {
    // Fresh fixture so there's nothing already taught
    const FRESH_TMP = join(tmpdir(), `sdlc-cross-dry-${process.pid}`);
    try {
      for (const name of ['reviewer', 'peer-reviewer', 'designer']) {
        mkdirSync(join(FRESH_TMP, 'agents', name, 'reviews'), { recursive: true });
        mkdirSync(join(FRESH_TMP, 'agents', name, 'memory'), { recursive: true });
      }
      writeFileSync(join(FRESH_TMP, 'agents', 'domains.json'), JSON.stringify({
        reviewer: { patterns: ['agents/*.mjs'] },
        'peer-reviewer': { patterns: ['agents/*.mjs'] },
        designer: { patterns: ['design/'] },
      }, null, 2));
      writeFileSync(join(FRESH_TMP, 'agents', 'project.json'), JSON.stringify({
        name: 'cross-teach-fixture', projectDir: FRESH_TMP, appDir: '.', testCmd: 'true',
        agents: ['reviewer', 'peer-reviewer', 'designer'],
      }));
      for (let n = 1; n <= 3; n++) {
        writeFileSync(join(FRESH_TMP, 'agents', 'reviewer', 'reviews', `review-${n}.md`),
          review(n, '[critical] Hardcoded API endpoint URL that should be a config constant'));
      }
      execFileSync('git', ['init', '-q'], { cwd: FRESH_TMP });
      execFileSync('git', ['-C', FRESH_TMP, 'config', 'user.email', 't@example.com']);
      execFileSync('git', ['-C', FRESH_TMP, 'config', 'user.name', 'Dry Run Test']);
      execFileSync('git', ['-C', FRESH_TMP, 'add', '.']);
      execFileSync('git', ['-C', FRESH_TMP, 'commit', '-q', '-m', 'fixture']);

      const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--json', '--dry-run'], {
        encoding: 'utf8', cwd: FRESH_TMP, env: { ...process.env, SDLC_PROJECT_DIR: FRESH_TMP },
      }));

      assert.equal(out.teaching.taught, 0, 'dry-run taught is 0');
      assert.equal(out.teaching.crossTaught, 0, 'dry-run crossTaught is 0');
      assert.ok(out.teaching.details.some(d => d.action === 'would-teach'), 'details show would-teach');
      assert.ok(out.teaching.details.some(d => d.action === 'would-cross-teach'), 'details show would-cross-teach');

      // Verify no files were written
      assert.ok(!existsSync(join(FRESH_TMP, 'agents', 'reviewer', 'memory', 'long-term.json')),
        'reviewer memory not written in dry-run');
      assert.ok(!existsSync(join(FRESH_TMP, 'agents', 'peer-reviewer', 'memory', 'long-term.json')),
        'peer-reviewer memory not written in dry-run');
    } finally {
      rmSync(FRESH_TMP, { recursive: true, force: true });
    }
  });
});
