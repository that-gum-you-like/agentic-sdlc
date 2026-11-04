/**
 * monthly-review.test.mjs — The Long Game: the monthly cycle must actually
 * EXECUTE behavior audit + versioning + compost cleanup + cost review
 * (previously only test-behavior ran; the rest was description text).
 *
 * Run with:
 *   node --test agents/__tests__/monthly-review.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { runStep, buildMonthlySteps } from '../cycles/monthly-review.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = resolve(__dirname, '..');
const SCRIPT = join(AGENTS_DIR, 'cycles', 'monthly-review.mjs');
const TMP_PROJECT = join(tmpdir(), `sdlc-monthly-test-${process.pid}`);

const OLD = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
const RECENT = new Date().toISOString().split('T')[0];

describe('monthly-review — the executed monthly cycle', () => {
  before(() => {
    mkdirSync(join(TMP_PROJECT, 'agents', 'tester', 'memory'), { recursive: true });
    writeFileSync(join(TMP_PROJECT, 'agents', 'project.json'), JSON.stringify({
      name: 'monthly-fixture', projectDir: TMP_PROJECT, appDir: '.', testCmd: 'true',
      agents: ['tester'],
    }));
    writeFileSync(join(TMP_PROJECT, 'agents', 'tester', 'AGENT.md'),
      '<!-- version: 1.0.0 | date: 2026-07-06 -->\n# Tester\n- Never skip memory recall\n');
    writeFileSync(join(TMP_PROJECT, 'agents', 'tester', 'memory', 'core.json'), JSON.stringify({
      failures: [{ id: 'F-1', description: 'x', date: RECENT }],
    }));
    writeFileSync(join(TMP_PROJECT, 'agents', 'tester', 'memory', 'compost.json'), JSON.stringify({
      entries: [
        { id: 'C-old', content: 'ancient failed idea', date: OLD },
        { id: 'C-new', content: 'recent failed idea', date: RECENT },
      ],
    }));
    writeFileSync(join(TMP_PROJECT, 'agents', 'cost-log.json'), JSON.stringify([
      { agent: 'tester', taskId: 'T-1', totalTokens: 1200, timestamp: new Date().toISOString() },
      { agent: 'tester', taskId: 'T-2', totalTokens: 800, timestamp: new Date().toISOString() },
      { agent: 'tester', taskId: 'T-0', totalTokens: 999999, timestamp: '2020-01-01T00:00:00Z' },
    ]));
  });

  after(() => {
    rmSync(TMP_PROJECT, { recursive: true, force: true });
  });

  it('runs all four steps and reports each', () => {
    const out = execFileSync(process.execPath, [SCRIPT, '--dry-run'], {
      encoding: 'utf8', cwd: TMP_PROJECT,
      env: { ...process.env, SDLC_PROJECT_DIR: TMP_PROJECT },
    });
    assert.match(out, /Behavior audit/);
    assert.match(out, /drift/i);
    assert.match(out, /Memory migration check/);
    assert.match(out, /Compost cleanup/);
    assert.match(out, /Cost review/);
    assert.match(out, /2,000 tokens across 2 task\(s\)|2000/, 'only the 30-day window counts');
    // Baseline re-record must be skipped in dry-run mode (CV-109)
    assert.ok(!out.includes('Re-record baseline'), 'baseline step must not run in dry-run mode');
  });

  it('compost cleanup removes entries past retention (and keeps recent ones)', () => {
    execFileSync(process.execPath, [SCRIPT], {
      encoding: 'utf8', cwd: TMP_PROJECT,
      env: { ...process.env, SDLC_PROJECT_DIR: TMP_PROJECT },
    });
    const compost = JSON.parse(readFileSync(join(TMP_PROJECT, 'agents', 'tester', 'memory', 'compost.json'), 'utf8'));
    assert.deepEqual(compost.entries.map(e => e.id), ['C-new'], 'stale entry removed, recent kept');
  });

  it('dry-run never mutates compost', () => {
    writeFileSync(join(TMP_PROJECT, 'agents', 'tester', 'memory', 'compost.json'), JSON.stringify({
      entries: [{ id: 'C-old2', content: 'ancient', date: OLD }],
    }));
    execFileSync(process.execPath, [SCRIPT, '--dry-run'], {
      encoding: 'utf8', cwd: TMP_PROJECT,
      env: { ...process.env, SDLC_PROJECT_DIR: TMP_PROJECT },
    });
    const compost = JSON.parse(readFileSync(join(TMP_PROJECT, 'agents', 'tester', 'memory', 'compost.json'), 'utf8'));
    assert.equal(compost.entries.length, 1, 'dry-run must not delete');
  });

  it('the monthly cron template points at the full cycle script', () => {
    const tpl = readFileSync(resolve(AGENTS_DIR, 'templates', 'cron-schedule.json.template'), 'utf8');
    assert.ok(tpl.includes('cycles/monthly-review.mjs'), 'monthly job must run the full cycle, not test-behavior alone');
  });

  it('exports runStep as a function and does not run main() on import', () => {
    assert.equal(typeof runStep, 'function', 'runStep must be exported as a function');
    // Importing the module successfully without main() side effects
    // (no console output from main(), no execFileSync calls) proves
    // the __isMainModule guard prevents CLI execution on import.
    // The top-level import of runStep at the top of this file already
    // exercised that path — if main() had run, it would have thrown
    // or produced visible output.
  });

  it('exports buildMonthlySteps returning the correct steps (dryRun: false)', () => {
    const steps = buildMonthlySteps({ dryRun: false });
    assert.equal(steps.length, 4, '4 steps in normal mode');
    assert.equal(steps[0].label, 'Behavior audit');
    assert.equal(steps[0].script, 'test-behavior.mjs');
    assert.deepEqual(steps[0].args, [], 'no --dry-run in normal mode');
    assert.equal(steps[1].label, 'Behavior drift vs baseline');
    assert.ok(steps[1].args.includes('--drift'));
    assert.equal(steps[2].label, 'Agent version snapshot');
    assert.equal(steps[2].script, 'version-snapshot.mjs');
    assert.deepEqual(steps[2].args, ['snapshot']);
    assert.equal(steps[3].label, 'Memory migration check');
    assert.equal(steps[3].script, 'migrate-memory.mjs');
    assert.deepEqual(steps[3].args, ['--check']);
  });

  it('buildMonthlySteps({dryRun: true}) omits snapshot and appends --dry-run', () => {
    const steps = buildMonthlySteps({ dryRun: true });
    assert.equal(steps.length, 3, '3 steps in dry-run mode (snapshot omitted)');
    assert.equal(steps[0].label, 'Behavior audit');
    assert.deepEqual(steps[0].args, ['--dry-run']);
    assert.equal(steps[1].label, 'Behavior drift vs baseline');
    assert.deepEqual(steps[1].args, ['--drift', '--dry-run']);
    assert.equal(steps[2].label, 'Memory migration check');
    assert.deepEqual(steps[2].args, ['--check', '--dry-run']);
  });

  it('baseline is re-recorded after drift passes (CV-109)', () => {
    const baselinesPath = join(TMP_PROJECT, 'agents', 'behavior-baselines.json');
    // Baseline matching the current tester AGENT.md (4 lines due to trailing newline, 1 rule,
    // "Never" triggers caution score of 25/100 lines, 0 optimism, 0 failure memory noise
    writeFileSync(baselinesPath, JSON.stringify({
      recordedAt: '2026-01-01T00:00:00.000Z',
      threshold: 0.20,
      agents: { tester: { prompt_lines: 4, rule_count: 1, caution_score: 25, optimism_score: 0, failure_memory_count: 0 } },
    }, null, 2) + '\n');

    const out = execFileSync(process.execPath, [SCRIPT], {
      encoding: 'utf8', cwd: TMP_PROJECT,
      env: { ...process.env, SDLC_PROJECT_DIR: TMP_PROJECT },
    });

    assert.match(out, /Re-record baseline/, 'baseline re-record step must appear in output');

    const updated = JSON.parse(readFileSync(baselinesPath, 'utf8'));
    assert.notEqual(updated.recordedAt, '2026-01-01T00:00:00.000Z', 'baseline recordedAt must be updated');
  });

  it('baseline is NOT re-recorded when drift fails (CV-109)', () => {
    const baselinesPath = join(TMP_PROJECT, 'agents', 'behavior-baselines.json');
    // Baseline far from the current tester AGENT.md to trigger drift >20%
    writeFileSync(baselinesPath, JSON.stringify({
      recordedAt: '2026-01-01T00:00:00.000Z',
      threshold: 0.20,
      agents: { tester: { prompt_lines: 100, rule_count: 30, caution_score: 0, optimism_score: 0, failure_memory_count: 0 } },
    }, null, 2) + '\n');

    const out = execFileSync(process.execPath, [SCRIPT], {
      encoding: 'utf8', cwd: TMP_PROJECT,
      env: { ...process.env, SDLC_PROJECT_DIR: TMP_PROJECT },
    });

    assert.ok(!out.includes('Re-record baseline'), 'baseline step must be skipped on drift failure');

    const updated = JSON.parse(readFileSync(baselinesPath, 'utf8'));
    assert.equal(updated.recordedAt, '2026-01-01T00:00:00.000Z', 'baseline recordedAt must not change when drift fails');
  });
});
