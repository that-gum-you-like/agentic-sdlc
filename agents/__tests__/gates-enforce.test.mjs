/**
 * gates-enforce.test.mjs — Regression tests for REQ-H1 (quality gates that ENFORCE).
 *
 * Covers:
 *   1. review-hook pre-commit gate: blocking violations in the staged diff
 *      exit nonzero (commit blocked); clean diffs pass; install wires BOTH hooks
 *   2. schema-validator fails CLOSED without Ajv (built-in fallback validator)
 *   3. pattern-hunt never generates an always-passing scaffold for unknown categories
 *   4. alignment-monitor score derives from counted checks, not magic decrements
 *
 * Run with:
 *   node --test agents/__tests__/gates-enforce.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync, lstatSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = resolve(__dirname, '..');
const REVIEW_HOOK = join(AGENTS_DIR, 'review-hook.mjs');
const TMP_REPO = join(tmpdir(), `sdlc-gate-test-${process.pid}`);

function inRepo(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: TMP_REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

describe('review-hook — enforcing pre-commit gate (REQ-H1)', () => {
  before(() => {
    mkdirSync(TMP_REPO, { recursive: true });
    inRepo('git', ['init', '-q']);
    inRepo('git', ['config', 'user.email', 'gate-test@example.com']);
    inRepo('git', ['config', 'user.name', 'Gate Test']);
    writeFileSync(join(TMP_REPO, 'base.txt'), 'clean base file\n');
    inRepo('git', ['add', '.']);
    inRepo('git', ['commit', '-q', '-m', 'base']);
  });

  after(() => {
    rmSync(TMP_REPO, { recursive: true, force: true });
  });

  it('check-staged exits nonzero when a secret is staged (BLOCKS the commit)', () => {
    writeFileSync(join(TMP_REPO, 'leaky.js'), 'const password = "hunter2-super-secret";\n');
    inRepo('git', ['add', 'leaky.js']);
    let code = 0;
    let out = '';
    try {
      out = inRepo(process.execPath, [REVIEW_HOOK, 'check-staged']);
    } catch (err) {
      code = err.status;
      out = String(err.stdout || '');
    }
    assert.equal(code, 1, 'a staged secret must block the commit (exit 1)');
    assert.match(out, /FAIL/, 'the blocking violation is reported');
    inRepo('git', ['reset', '-q']);
    rmSync(join(TMP_REPO, 'leaky.js'));
  });

  it('check-staged exits zero on a clean staged diff', () => {
    writeFileSync(join(TMP_REPO, 'clean.js'), 'export const add = (a, b) => a + b;\n');
    inRepo('git', ['add', 'clean.js']);
    const out = inRepo(process.execPath, [REVIEW_HOOK, 'check-staged']);
    assert.match(out, /PASS/);
    inRepo('git', ['reset', '-q']);
    rmSync(join(TMP_REPO, 'clean.js'));
  });

  it('a REAL git commit is blocked once the hook is installed', () => {
    inRepo(process.execPath, [REVIEW_HOOK, 'install']);
    assert.ok(lstatSync(join(TMP_REPO, '.git', 'hooks', 'pre-commit')).isSymbolicLink(), 'pre-commit hook installed');
    assert.ok(lstatSync(join(TMP_REPO, '.git', 'hooks', 'post-commit')).isSymbolicLink(), 'post-commit hook installed');

    writeFileSync(join(TMP_REPO, 'creds.js'), 'const api_key = "sk-000-fixture-not-real";\n');
    inRepo('git', ['add', 'creds.js']);
    let blocked = false;
    try {
      inRepo('git', ['commit', '-q', '-m', 'try to commit a secret']);
    } catch {
      blocked = true;
    }
    assert.ok(blocked, 'git commit must fail via the pre-commit hook');
    const head = inRepo('git', ['log', '-1', '--pretty=%s']).trim();
    assert.equal(head, 'base', 'no new commit landed');
  });

  it('empty catch blocks (silent failures) also block', () => {
    inRepo('git', ['reset', '-q']);
    writeFileSync(join(TMP_REPO, 'silent.js'), 'try { risky(); } catch () {}\n');
    inRepo('git', ['add', 'silent.js']);
    let code = 0;
    try {
      inRepo(process.execPath, [REVIEW_HOOK, 'check-staged']);
    } catch (err) {
      code = err.status;
    }
    assert.equal(code, 1, 'silent error swallowing must block');
  });
});

describe('schema-validator — fails CLOSED without Ajv (REQ-H1)', () => {
  it('rejects an invalid payload even when ajv is not installed', async () => {
    const { validate, clearCaches } = await import('../schema-validator.mjs');
    clearCaches();
    const result = await validate('task-claim', { taskId: 'T-1' }); // missing required fields
    assert.equal(result.valid, false, 'missing required fields must fail closed');
    assert.ok(result.errors.length > 0);
  });

  it('accepts a valid payload via the built-in fallback', async () => {
    const { validate } = await import('../schema-validator.mjs');
    const result = await validate('task-claim', {
      taskId: 'T-1', agentName: 'tester', claimedAt: '2026-07-06T00:00:00Z', estimatedTokens: 1000,
    });
    assert.equal(result.valid, true, JSON.stringify(result.errors || []));
  });

  it('validateSync also produces real verdicts without Ajv', async () => {
    const { validateSync } = await import('../schema-validator.mjs');
    const bad = validateSync('task-claim', { taskId: 42 });
    assert.equal(bad.valid, false);
  });

  it('miniValidate enforces enum, type, pattern, and additionalProperties', async () => {
    const { miniValidate } = await import('../schema-validator.mjs');
    const schema = {
      type: 'object',
      required: ['level'],
      additionalProperties: false,
      properties: {
        level: { type: 'string', enum: ['low', 'high'] },
        count: { type: 'integer', minimum: 0 },
      },
    };
    assert.equal(miniValidate(schema, { level: 'low', count: 2 }).length, 0);
    assert.ok(miniValidate(schema, { level: 'nope' }).length > 0, 'enum violation');
    assert.ok(miniValidate(schema, { level: 'low', count: -1 }).length > 0, 'minimum violation');
    assert.ok(miniValidate(schema, { level: 'low', rogue: true }).length > 0, 'additionalProperties violation');
    assert.ok(miniValidate(schema, {}).length > 0, 'required violation');
  });

  it('never returns the old fail-open "validation skipped" result', async () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'schema-validator.mjs'), 'utf8');
    assert.ok(!src.includes('validation skipped'), 'fail-open skip path must be gone');
  });
});

describe('pattern-hunt — no always-passing generated tests (REQ-H1)', () => {
  it('the generic TODO scaffold (always-empty newViolations) is gone', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'pattern-hunt.mjs'), 'utf8');
    assert.ok(!src.includes('TODO: Add pattern-specific detection logic'),
      'the always-passing scaffold template must not exist');
    assert.ok(src.includes("action: 'needs-detector'"),
      'unknown categories must surface as needs-detector instead of generating a no-op test');
  });
});

describe('alignment-monitor — score from real signals (REQ-H1)', () => {
  it('derives the score from counted checks, not magic decrements', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'alignment-monitor.mjs'), 'utf8');
    assert.ok(!/findings\.score\s*-=/.test(src), 'hand-tuned score decrements must be gone');
    assert.ok(src.includes('checksTotal') && src.includes('checksFailed'),
      'score must be computed from executed check counts');
    assert.ok(/checksFailed\s*\/\s*findings\.checksTotal/.test(src),
      'score must be the pass ratio of real checks');
  });
});
