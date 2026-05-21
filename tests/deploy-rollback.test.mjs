#!/usr/bin/env node
/**
 * Tests for agents/deploy-rollback.mjs
 *
 * Smoke + behavior tests covering the 5 scenarios in
 * openspec/changes/archive/automated-deploy-rollback/specs/automated-rollback-helper-behavior.md
 *
 * Run: node tests/deploy-rollback.test.mjs
 */

import fs from 'fs';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const HELPER = join(process.cwd(), 'agents/deploy-rollback.mjs');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try {
    fn();
    console.log('OK');
    passed++;
  } catch (err) {
    console.log('FAIL');
    failures.push({ name, err: err.message });
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function makeFixture(projectJsonContent) {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-rollback-test-'));
  fs.mkdirSync(join(dir, 'agents'), { recursive: true });
  fs.mkdirSync(join(dir, 'pm'), { recursive: true });
  writeFileSync(
    join(dir, 'agents', 'project.json'),
    JSON.stringify(projectJsonContent, null, 2)
  );
  return dir;
}

function runHelper(cwd, args = []) {
  return spawnSync('node', [HELPER, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, SDLC_PROJECT_DIR: cwd },
  });
}

console.log('\ndeploy-rollback.mjs');

test('Scenario 2: missing rollbackCmd exits 1', () => {
  const dir = makeFixture({ name: 'no-rollback' });
  const result = runHelper(dir, ['--reason', 'test-no-cmd']);
  assert(result.status === 1, `expected exit 1, got ${result.status}\n${result.stdout}\n${result.stderr}`);
  assert(
    /No rollbackCmd configured/i.test(result.stderr + result.stdout),
    'expected "No rollbackCmd configured" in output'
  );
  rmSync(dir, { recursive: true });
});

test('Scenario 1: happy path with echo rollback succeeds', () => {
  const dir = makeFixture({
    name: 'happy',
    rollbackCmd: 'echo rolled-back-OK',
    notification: { provider: 'none', triggers: {} },
  });
  const result = runHelper(dir, ['--reason', 'smoke-failure', '--no-debounce']);
  assert(result.status === 0, `expected exit 0, got ${result.status}\n${result.stdout}\n${result.stderr}`);
  assert(
    /Rollback complete/i.test(result.stdout),
    `expected "Rollback complete" in stdout. Got:\n${result.stdout}`
  );
  rmSync(dir, { recursive: true });
});

test('Scenario 3: failing rollback exits 2', () => {
  const dir = makeFixture({
    name: 'fails',
    rollbackCmd: 'false',
    notification: { provider: 'none', triggers: {} },
  });
  const result = runHelper(dir, ['--reason', 'fail-test']);
  assert(result.status === 2, `expected exit 2, got ${result.status}\n${result.stdout}\n${result.stderr}`);
  assert(
    /FAILED/i.test(result.stderr + result.stdout),
    'expected "FAILED" in output'
  );
  rmSync(dir, { recursive: true });
});

test('Scenario 5: --dry-run does not execute and exits 0', () => {
  const dir = makeFixture({
    name: 'dry',
    rollbackCmd: `touch ${join(tmpdir(), 'should-not-exist-' + Date.now())}.tmp`,
  });
  const result = runHelper(dir, ['--dry-run', '--reason', 'dry-test']);
  assert(result.status === 0, `expected exit 0, got ${result.status}\n${result.stdout}\n${result.stderr}`);
  assert(/DRY RUN/i.test(result.stdout), 'expected DRY RUN messaging');
  rmSync(dir, { recursive: true });
});

test('Scenario 4: debounce marker written after successful fire', () => {
  const dir = makeFixture({
    name: 'debounce',
    rollbackCmd: 'echo first',
    rollbackDebounce: 60,
    notification: { provider: 'none', triggers: {} },
  });
  const result = runHelper(dir, ['--reason', 'debounce-test', '--no-debounce']);
  assert(result.status === 0, `expected exit 0, got ${result.status}`);
  const markerPath = join(dir, 'pm', '.last-rollback');
  assert(existsSync(markerPath), 'expected pm/.last-rollback to exist');
  const ts = readFileSync(markerPath, 'utf8').trim();
  assert(/\d{4}-\d{2}-\d{2}T/.test(ts), `expected ISO timestamp, got "${ts}"`);
  rmSync(dir, { recursive: true });
});

test('Exit code 3 when project.json missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-rollback-test-no-pj-'));
  const result = runHelper(dir, ['--reason', 'missing-pj']);
  assert(result.status === 3, `expected exit 3, got ${result.status}\n${result.stdout}\n${result.stderr}`);
  rmSync(dir, { recursive: true });
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.err}`));
  process.exit(1);
}
process.exit(0);
