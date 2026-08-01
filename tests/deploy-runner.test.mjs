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
  redactRemote,
  DEFAULTS,
  buildApprovalMessage,
  deployBotHandle,
  _resetDeployBotHandle,
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
// --- credential redaction (added 2026-07-30 after a live token hit stdout) ---
t('redactRemote strips embedded credentials from a git remote', () => {
  const leaky = 'https://x-access-token:gho_AAAABBBBCCCCDDDD@github.com/that-gum-you-like/wireframe-live.git';
  const safe = redactRemote(leaky);
  assert(!safe.includes('gho_'), `token survived redaction: ${safe}`);
  assert(!safe.includes('x-access-token'), `userinfo survived redaction: ${safe}`);
  assert(safe === 'https://***@github.com/that-gum-you-like/wireframe-live.git', safe);
});

t('redactRemote leaves a credential-free remote untouched', () => {
  const plain = 'https://github.com/that-gum-you-like/agentic-sdlc.git';
  assert(redactRemote(plain) === plain, redactRemote(plain));
  const ssh = 'git@github.com:that-gum-you-like/agentic-sdlc.git';
  assert(redactRemote(ssh) === ssh, redactRemote(ssh));
});

// --- approval message (openspec: deploy-approval-usability) ---
// Added 2026-08-01 after the pipeline sat at zero deploys: the request said
// "Reply to the DEPLOY bot" without naming it, and the bot that delivers the
// message is not the bot that can accept the reply.
const MSG_ARGS = {
  projectName: 'personal-website',
  baseBranch: 'main',
  sha8: 'db255a7c',
  subject: 'feat: something',
  handle: '@Nels_hermes_deploy_bot',
};

t('approval message names the deploy bot and the exact command', () => {
  const msg = buildApprovalMessage(MSG_ARGS);
  assert(msg.includes('@Nels_hermes_deploy_bot'), `no handle: ${msg}`);
  assert(msg.includes('https://t.me/Nels_hermes_deploy_bot'), `no t.me link: ${msg}`);
  assert(msg.includes('APPROVE db255a7c'), `no approve command: ${msg}`);
  assert(msg.includes('REJECT db255a7c'), `no reject command: ${msg}`);
  assert(/DIFFERENT bot/i.test(msg), `no different-bot warning: ${msg}`);
  assert(!msg.includes('t.me/@'), `t.me link must not keep the @: ${msg}`);
});

t('approval message commands round-trip through parseApprovalCommand', () => {
  // The instruction we print must be one the runner will actually accept — a
  // standalone line matching the parser's whole-string regex.
  for (const args of [MSG_ARGS, { ...MSG_ARGS, handle: null }]) {
    const lines = buildApprovalMessage(args).split('\n');
    const approve = lines.find((l) => /^APPROVE /.test(l));
    assert(approve, 'no standalone APPROVE line');
    const parsed = parseApprovalCommand(approve);
    assert(parsed && parsed.action === 'approve' && parsed.sha8 === 'db255a7c',
      `emitted APPROVE line is not parseable: ${JSON.stringify(approve)}`);
  }
});

t('approval message falls back safely without a handle', () => {
  const msg = buildApprovalMessage({ ...MSG_ARGS, handle: null });
  assert(msg.includes('APPROVE db255a7c'), `no approve command: ${msg}`);
  assert(/DEPLOY bot/i.test(msg), `no deploy-bot mention: ${msg}`);
  assert(/DIFFERENT bot/i.test(msg), `no different-bot warning: ${msg}`);
  assert(!msg.includes('undefined') && !msg.includes('null'), `leaked placeholder: ${msg}`);
  assert(!msg.includes('t.me'), `fallback must not emit a bogus link: ${msg}`);
});

t('deployBotHandle returns null without a token and never throws', async () => {
  _resetDeployBotHandle();
  const h = await deployBotHandle('');           // no token — must not hit the network
  assert(h === null, `expected null, got ${JSON.stringify(h)}`);
  _resetDeployBotHandle();
});


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
