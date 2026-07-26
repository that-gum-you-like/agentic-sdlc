#!/usr/bin/env node
/**
 * Tests for deploy-runner.mjs (openspec: autonomous-deploy-pipeline).
 *
 * The runner's judgment lives in pure functions — parseApprovalCommand,
 * decide(), smokeVerify, loadDeployConfig, parseArgs — so the state machine is
 * tested deterministically with no git, no network, no Telegram.
 *
 * Run: node tests/deploy-runner.test.mjs
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  parseApprovalCommand,
  decide,
  smokeVerify,
  loadDeployConfig,
  parseArgs,
  DEFAULTS,
} from '../agents/deploy-runner.mjs';

let passed = 0;
let failed = 0;
const failures = [];

const queue = [];
function t(name, fn) { queue.push({ name, fn }); }

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log('deploy-runner tests');

// --- parseApprovalCommand (REQ-002) ---
t('parseApprovalCommand accepts APPROVE/REJECT <sha8> case-insensitively', () => {
  assert(JSON.stringify(parseApprovalCommand('APPROVE deadbeef')) === '{"action":"approve","sha8":"deadbeef"}', 'approve');
  assert(parseApprovalCommand('reject 0a1b2c3d').action === 'reject', 'reject lower');
  assert(parseApprovalCommand('  Approve  DEADBEEF  ').sha8 === 'deadbeef', 'whitespace + case normalize');
});

t('parseApprovalCommand rejects everything else', () => {
  for (const bad of ['yes', 'APPROVE', 'APPROVE deadbee', 'APPROVE deadbeef9', 'APPROVE nothexxx', 'deploy please', '', null, 'APPROVE deadbeef now']) {
    assert(parseApprovalCommand(bad) === null, `should reject: ${JSON.stringify(bad)}`);
  }
});

// --- decide() state machine (REQ-001, REQ-002, REQ-003, REQ-005) ---
const base = {
  enabled: true, targetSha: 'abc123def456', lastDeployedSha: 'old',
  failed: false, rejected: false, approved: false, pending: false,
  approvalMode: 'telegram', cooldownOk: true,
};

t('decide: disabled project never acts', () => {
  assert(decide({ ...base, enabled: false }) === 'disabled', 'disabled');
});

t('decide: up-to-date target is a no-op', () => {
  assert(decide({ ...base, lastDeployedSha: base.targetSha }) === 'up-to-date', 'same sha');
});

t('decide: unresolvable target never guesses a deploy', () => {
  assert(decide({ ...base, targetSha: null }) === 'terminal', 'null target must be terminal');
});

t('decide: failed and rejected tokens are terminal for the sha (no retry loops)', () => {
  assert(decide({ ...base, failed: true }) === 'terminal', 'failed');
  assert(decide({ ...base, rejected: true }) === 'terminal', 'rejected');
  assert(decide({ ...base, failed: true, approved: true }) === 'terminal', 'failure outranks approval');
});

t('decide: approval is required before deploy; request exactly once', () => {
  assert(decide({ ...base }) === 'request-approval', 'first sight → request');
  assert(decide({ ...base, pending: true }) === 'wait-approval', 'already requested → wait');
  assert(decide({ ...base, approved: true }) === 'deploy', 'approved → deploy');
});

t('decide: approval for one sha never releases another (token files are sha-bound)', () => {
  // The caller looks up token files BY sha8 — an approval recorded for sha A
  // simply does not exist for sha B. Modeled here: same state, approved=false.
  assert(decide({ ...base, approved: false, pending: true }) === 'wait-approval', 'no cross-sha release');
});

t('decide: approval "none" skips the gate but still honors cooldown', () => {
  assert(decide({ ...base, approvalMode: 'none' }) === 'deploy', 'no gate');
  assert(decide({ ...base, approvalMode: 'none', cooldownOk: false }) === 'cooldown', 'cooldown still applies');
});

t('decide: cooldown blocks an immediate re-attempt after approval', () => {
  assert(decide({ ...base, approved: true, cooldownOk: false }) === 'cooldown', 'cooldown');
});

// --- smokeVerify (REQ-004) ---
t('smokeVerify passes on expected status and skips when unconfigured', async () => {
  const ok = await smokeVerify({ smokeUrl: 'https://x', expectStatus: 200, timeoutSeconds: 1, fetchStatus: async () => 200 });
  assert(ok.ok === true && ok.status === 200, 'match');
  const skipped = await smokeVerify({ smokeUrl: null, expectStatus: 200, timeoutSeconds: 1 });
  assert(skipped.ok === true && skipped.skipped === true, 'no url → skip, not fail');
});

t('smokeVerify fails after timeout with the last status', async () => {
  let clock = 0;
  const r = await smokeVerify({
    smokeUrl: 'https://x', expectStatus: 200, timeoutSeconds: 1,
    fetchStatus: async () => 500, sleepMs: 1, now: () => (clock += 600),
  });
  assert(r.ok === false && r.status === 500, `expected timeout failure, got ${JSON.stringify(r)}`);
});

// --- loadDeployConfig (REQ-001, REQ-008) ---
t('loadDeployConfig: disabled/missing/invalid configs never yield a deployable plan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-cfg-'));
  try {
    assert(loadDeployConfig(dir).error, 'missing project.json is an error, not a silent skip');
    mkdirSync(join(dir, 'agents'), { recursive: true });
    writeFileSync(join(dir, 'agents', 'project.json'), JSON.stringify({ name: 'x' }));
    assert(loadDeployConfig(dir).disabled === true, 'no deploy block → disabled');
    writeFileSync(join(dir, 'agents', 'project.json'), JSON.stringify({ name: 'x', deploy: { enabled: true } }));
    assert(loadDeployConfig(dir).error, 'enabled without deployCmd is an error');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t('loadDeployConfig: defaults are applied (approval telegram, tests on, 200/60/600)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-cfg-'));
  try {
    mkdirSync(join(dir, 'agents'), { recursive: true });
    writeFileSync(join(dir, 'agents', 'project.json'), JSON.stringify({
      name: 'x', testCmd: 'node t.mjs', deploy: { enabled: true, deployCmd: 'true', verify: { smokeUrl: 'https://e' } },
    }));
    const cfg = loadDeployConfig(dir);
    assert(cfg.deploy.approval === DEFAULTS.approval, 'approval defaults to telegram — autonomy is opt-OUT of the gate, never accidental');
    assert(cfg.deploy.verifyTests === true, 'test gate defaults on');
    assert(cfg.deploy.verify.expectStatus === 200 && cfg.deploy.verify.timeoutSeconds === 60, 'verify defaults');
    assert(cfg.deploy.cooldownSeconds === 600, 'cooldown default');
    assert(cfg.testCmd === 'node t.mjs', 'project testCmd honored');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --- parseArgs (REQ-001) ---
t('parseArgs collects repeated --project-dir and --dry-run', () => {
  const a = parseArgs(['--project-dir', '/tmp/a', '--dry-run', '--project-dir', '/tmp/b']);
  assert(a.projectDirs.length === 2 && a.dryRun === true, JSON.stringify(a));
});

// --- sequential runner (async-aware) ---
for (const { name, fn } of queue) {
  process.stdout.write(`  ${name} ... `);
  try {
    await fn();
    console.log('OK');
    passed++;
  } catch (err) {
    console.log('FAIL');
    failures.push({ name, err: err.message });
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`);
  process.exit(1);
}
