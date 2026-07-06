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
});
