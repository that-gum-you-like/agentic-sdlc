/**
 * cost-tracker-realized-usage.test.mjs — Regression tests for REQ-H3.
 *
 * The ledger must capture provider-REPORTED token usage from adapter
 * responses (recordRealizedUsage), with chars/4 estimateTokens remaining a
 * pre-flight estimate only. Runs the tracker in a subprocess against a temp
 * project so the real cost log is never touched.
 *
 * Run with:
 *   node --test agents/__tests__/cost-tracker-realized-usage.test.mjs
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
const TMP_PROJECT = join(tmpdir(), `sdlc-cost-capture-test-${process.pid}`);

function runInTempProject(script) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { ...process.env, SDLC_PROJECT_DIR: TMP_PROJECT },
  });
}

describe('cost-tracker — realized provider-reported usage capture (REQ-H3)', () => {
  before(() => {
    mkdirSync(join(TMP_PROJECT, 'agents'), { recursive: true });
    writeFileSync(join(TMP_PROJECT, 'agents', 'project.json'), JSON.stringify({
      name: 'cost-capture-fixture', projectDir: TMP_PROJECT, appDir: '.', testCmd: 'true',
      agents: ['tester'],
    }));
    writeFileSync(join(TMP_PROJECT, 'agents', 'budget.json'), JSON.stringify({
      agents: { tester: { model: 'deepseek/deepseek-v4-flash', dailyTokens: 100000 } },
    }));
  });

  after(() => {
    rmSync(TMP_PROJECT, { recursive: true, force: true });
  });

  it('writes provider-reported inputTokens/outputTokens and the realized model to the ledger', () => {
    runInTempProject(`
      import { recordRealizedUsage } from ${JSON.stringify(join(AGENTS_DIR, 'cost-tracker.mjs'))};
      const entry = recordRealizedUsage('tester', 'T-001', {
        text: 'ok', tokensUsed: 1234, inputTokens: 1000, outputTokens: 234,
        model: 'deepseek/deepseek-chat-v3.1',
      });
      if (!entry) throw new Error('expected a ledger entry');
    `);
    const log = JSON.parse(readFileSync(join(TMP_PROJECT, 'agents', 'cost-log.json'), 'utf8'));
    assert.equal(log.length, 1);
    assert.equal(log[0].inputTokens, 1000);
    assert.equal(log[0].outputTokens, 234);
    assert.equal(log[0].totalTokens, 1234);
    assert.equal(log[0].source, 'provider-reported');
    assert.equal(log[0].model, 'deepseek/deepseek-chat-v3.1', 'realized model from the response, not budget config');
  });

  it('skips entries when the provider reported no usage (no zero pollution)', () => {
    runInTempProject(`
      import { recordRealizedUsage } from ${JSON.stringify(join(AGENTS_DIR, 'cost-tracker.mjs'))};
      const entry = recordRealizedUsage('tester', 'T-002', { text: 'ok' });
      if (entry !== null) throw new Error('expected null for unreported usage');
    `);
    const log = JSON.parse(readFileSync(join(TMP_PROJECT, 'agents', 'cost-log.json'), 'utf8'));
    assert.ok(log.every(e => e.taskId !== 'T-002'), 'no ledger entry for unreported usage');
  });

  it('CLI record entries are tagged source:manual', () => {
    runInTempProject(`
      import ${JSON.stringify(join(AGENTS_DIR, 'cost-tracker.mjs'))};
    `); // import must not write anything (guard check)
    execFileSync(process.execPath, [join(AGENTS_DIR, 'cost-tracker.mjs'), 'record', 'tester', 'T-003', '500', '100'], {
      encoding: 'utf8',
      env: { ...process.env, SDLC_PROJECT_DIR: TMP_PROJECT },
    });
    const log = JSON.parse(readFileSync(join(TMP_PROJECT, 'agents', 'cost-log.json'), 'utf8'));
    const entry = log.find(e => e.taskId === 'T-003');
    assert.ok(entry, 'CLI record must write an entry');
    assert.equal(entry.source, 'manual');
    assert.equal(entry.totalTokens, 600);
  });

  it('pr-auto-review wires realized usage capture after the LLM call', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'pr-auto-review.mjs'), 'utf8');
    assert.ok(src.includes('recordRealizedUsage'), 'the live adapter consumer must capture realized usage');
  });

  it('adapters still expose estimateTokens as a pre-flight estimate (not removed)', async () => {
    const openrouter = await import('../adapters/llm/openrouter.mjs');
    assert.equal(typeof openrouter.estimateTokens, 'function');
    assert.equal(openrouter.estimateTokens('abcdefgh'), 2, 'chars/4 stays as the pre-flight estimate');
  });
});
