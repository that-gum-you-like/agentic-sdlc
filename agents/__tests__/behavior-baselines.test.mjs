/**
 * behavior-baselines.test.mjs — Curriculum Phase 7: behavior baselines + drift.
 *
 * test-behavior.mjs --baseline must persist deterministic per-agent metrics;
 * --drift must alert (exit 1) when a metric moves >20% after a prompt change
 * and stay quiet otherwise. Runs the CLI against a temp project fixture.
 *
 * Run with:
 *   node --test agents/__tests__/behavior-baselines.test.mjs
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
const SCRIPT = join(AGENTS_DIR, 'test-behavior.mjs');
const TMP_PROJECT = join(tmpdir(), `sdlc-baseline-test-${process.pid}`);

function runScript(args) {
  return execFileSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, SDLC_PROJECT_DIR: TMP_PROJECT },
  });
}

const BASE_AGENT_MD = `<!-- version: 1.0.0 | date: 2026-07-06 -->
# Tester Agent

## Operating Rules
- Never commit without tests
- Always read memory before starting
- Do not deploy without review
- Verify results before committing

## Memory Protocol
- recall core.json before every task
`;

describe('test-behavior — baselines + drift detection (curriculum Ph7)', () => {
  before(() => {
    mkdirSync(join(TMP_PROJECT, 'agents', 'tester', 'memory'), { recursive: true });
    mkdirSync(join(TMP_PROJECT, 'pm'), { recursive: true });
    writeFileSync(join(TMP_PROJECT, 'agents', 'project.json'), JSON.stringify({
      name: 'baseline-fixture', projectDir: TMP_PROJECT, appDir: '.', testCmd: 'true',
      agents: ['tester'],
    }));
    writeFileSync(join(TMP_PROJECT, 'agents', 'tester', 'AGENT.md'), BASE_AGENT_MD);
    writeFileSync(join(TMP_PROJECT, 'agents', 'tester', 'memory', 'core.json'), JSON.stringify({
      failures: [{ id: 'F-001', description: 'shipped untested code once', date: '2026-06-01' }],
    }));
  });

  after(() => {
    rmSync(TMP_PROJECT, { recursive: true, force: true });
  });

  it('--baseline records deterministic per-agent metrics', () => {
    const out = runScript(['--baseline']);
    assert.match(out, /baselines recorded for 1 agent/i);
    const baselines = JSON.parse(readFileSync(join(TMP_PROJECT, 'pm', 'behavior-baselines.json'), 'utf8'));
    const m = baselines.agents.tester;
    assert.ok(m, 'tester metrics recorded');
    assert.ok(m.prompt_lines > 0);
    assert.ok(m.rule_count >= 5, `bullet rules counted, got ${m.rule_count}`);
    assert.ok(m.caution_score > 0, 'never/always/do-not phrasing counted');
    assert.equal(m.failure_memory_count, 1);
    assert.equal(baselines.threshold, 0.2);
  });

  it('--drift is quiet when nothing changed (exit 0)', () => {
    const out = runScript(['--drift']);
    assert.match(out, /drift: none/i);
  });

  it('--drift alerts with exit 1 when a metric moves >20% after a prompt change', () => {
    // Gut the prompt: drop most cautionary rules — a real behavioral shift.
    writeFileSync(join(TMP_PROJECT, 'agents', 'tester', 'AGENT.md'), `<!-- version: 2.0.0 | date: 2026-07-06 -->
# Tester Agent

This is easy, just ship it quickly. It is all pretty straightforward and simply works.
Honestly it is trivially obvious and quick.
`);
    let code = 0;
    let out = '';
    try {
      out = runScript(['--drift']);
    } catch (err) {
      code = err.status;
      out = String(err.stdout || '');
    }
    assert.equal(code, 1, 'drift must exit nonzero');
    assert.match(out, /BEHAVIOR DRIFT/);
    assert.match(out, /caution_score/, 'the collapsed caution metric is named');
    assert.match(out, /optimism_score/, 'the ballooned optimism metric is named');
  });

  it('re-recording the baseline accepts the new prompt as intentional', () => {
    runScript(['--baseline']);
    const out = runScript(['--drift']);
    assert.match(out, /drift: none/i);
  });

  it('the normal project run includes the drift check when a baseline exists', () => {
    const out = runScript(['--project', '--dry-run']);
    assert.match(out, /Behavior Baselines & Drift/);
  });
});
