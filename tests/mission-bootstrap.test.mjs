#!/usr/bin/env node
/**
 * Tests for mission-bootstrap.mjs (openspec: mission-intake).
 * Pure helpers + a real dry-run (zero side effects). No repos are created.
 *
 * Run: node tests/mission-bootstrap.test.mjs
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';

import {
  validateName,
  smokeUrlFor,
  cronMinutesFor,
  patchProjectJson,
  rewriteBudgetLadders,
  buildCronJobs,
  bootstrap,
  missionDomainFor,
  VERCEL_TEAM_SLUG,
  MISSION_BASE_DOMAIN,
} from '../agents/mission-bootstrap.mjs';

let passed = 0;
let failed = 0;
const failures = [];
const queue = [];
function t(name, fn) { queue.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }

console.log('mission-bootstrap tests');

t('validateName accepts kebab names, rejects everything that would break repo/vercel/dirs', () => {
  for (const good of ['tally2', 'ask-meadow', 'hermes-pilot', 'ab']) assert(validateName(good), `should accept ${good}`);
  for (const bad of ['', 'A-app', '1app', 'app--x', 'app-', 'my app', 'a', 'x'.repeat(40), 'app_x', null]) {
    assert(!validateName(bad), `should reject ${JSON.stringify(bad)}`);
  }
});

t('smokeUrlFor uses the team-scoped alias (bare <name>.vercel.app may be foreign-owned)', () => {
  assert(smokeUrlFor('demo') === `https://demo-${VERCEL_TEAM_SLUG}.vercel.app`, smokeUrlFor('demo'));
});

t('missions live on subdomains of brycewadley.com by default', () => {
  assert(MISSION_BASE_DOMAIN === 'brycewadley.com', 'base domain');
  assert(missionDomainFor('demo') === 'demo.brycewadley.com', missionDomainFor('demo'));
  assert(missionDomainFor('demo', 'other.dev') === 'demo.other.dev', 'override supported');
});

t('cronMinutesFor never lands on the framework minutes, is deterministic, varies by name (REQ-002)', () => {
  const banned = new Set([0, 15, 30, 45]);
  const seen = new Set();
  for (const name of ['alpha', 'bravo', 'charlie', 'hermes-pilot', 'ask-meadow', 'x1', 'x2', 'x3']) {
    const { drain, review } = cronMinutesFor(name);
    assert(drain.length && review.length, `${name}: non-empty schedules`);
    for (const m of [...drain.split(','), ...review.split(',')].map(Number)) {
      assert(!banned.has(m), `${name}: minute ${m} collides with framework timers`);
      assert(m >= 0 && m < 60, `${name}: minute ${m} out of range`);
    }
    assert(JSON.stringify(cronMinutesFor(name)) === JSON.stringify(cronMinutesFor(name)), `${name}: deterministic`);
    seen.add(drain);
  }
  assert(seen.size > 1, 'different names should usually get different minutes');
});

t('patchProjectJson wires telegram+desktop+deploy with approval; --no-deploy stays dark', () => {
  const base = { name: 'demo', notification: { provider: 'none', triggers: { blocker: true } }, llm: { defaultProvider: 'anthropic' } };
  const on = patchProjectJson(base, { name: 'demo', deploy: true });
  assert(on.notification.provider === 'telegram' && on.notification.desktop === true, 'notify wiring');
  assert(on.deploy.enabled === true && on.deploy.approval === 'telegram', 'deploy enabled behind telegram approval');
  assert(on.deploy.verify.smokeUrl === smokeUrlFor('demo'), 'computed smoke URL');
  assert(on.llm.defaultProvider === 'openrouter', 'llm provider flipped to openrouter');
  assert(on.deploy.verifyTests === true, 'test gate on');
  const off = patchProjectJson(base, { name: 'demo', deploy: false });
  assert(off.deploy.enabled === false, '--no-deploy leaves the deploy dark');
});

t('rewriteBudgetLadders leaves zero Claude/Anthropic models (REQ-002, pilot lesson)', () => {
  const fw = {
    emergencyFallbackModel: 'deepseek/deepseek-v4-flash',
    agents: {
      'sdlc-developer': { model: 'qwen/qwen3-coder', fallbackChain: ['qwen/qwen3-coder', 'deepseek/deepseek-v4-flash'], modelPreferences: { feature: 'qwen/qwen3-coder' } },
      'sdlc-reviewer': { model: 'deepseek/deepseek-chat-v3.1', fallbackChain: ['deepseek/deepseek-chat-v3.1'], modelPreferences: {} },
    },
  };
  const scaffolded = {
    emergencyFallbackModel: 'claude-sonnet-4-6',
    agents: {
      backend: { model: 'claude-sonnet-4-6', dailyTokens: 500000, permissions: 'full-edit' },
      reviewer: { model: 'claude-sonnet-4-6', dailyTokens: 200000, permissions: 'read-only' },
    },
  };
  const out = rewriteBudgetLadders(scaffolded, fw);
  const dump = JSON.stringify(out).toLowerCase();
  assert(!dump.includes('claude') && !dump.includes('anthropic'), `no Claude models may survive: ${dump}`);
  assert(out.agents.backend.model === 'qwen/qwen3-coder', 'coder ladder for non-review agents');
  assert(out.agents.reviewer.model === 'deepseek/deepseek-chat-v3.1', 'review ladder for reviewer');
  assert(out.agents.backend.dailyTokens === 500000 && out.agents.reviewer.permissions === 'read-only', 'budgets/permissions preserved');
});

t('buildCronJobs targets the project via env and the framework scripts by absolute path', () => {
  const jobs = buildCronJobs('demo', '/home/x');
  assert(jobs.length === 2, 'drain + review');
  assert(jobs[0].script === '/usr/bin/env SDLC_REPO=/home/x/demo /home/x/agentic-sdlc/agents/hermes-drain.sh', jobs[0].script);
  assert(jobs[1].script.includes('SDLC_PROJECT_DIR=/home/x/demo') && jobs[1].script.includes('pr-auto-review.mjs'), jobs[1].script);
});

t('bootstrap --dry-run prints a full plan with zero side effects (REQ-001)', async () => {
  const fakeHome = join(tmpdir(), `mission-dry-${process.pid}`);
  const logs = [];
  const { plan, projectDir } = await bootstrap({ name: 'dry-run-demo', dryRun: true, home: fakeHome, log: (m) => logs.push(m) });
  assert(plan.length >= 7, `plan should list all steps, got ${plan.length}`);
  assert(!existsSync(projectDir), 'dry-run must not create the project dir');
  assert(!existsSync(fakeHome), 'dry-run must not create anything under home');
  assert(logs.some(l => l.includes('PLAN:')), 'dry-run logs PLAN lines');
  assert(!logs.some(l => l.includes('DONE:')), 'dry-run must not execute steps');
});

t('bootstrap rejects invalid names before any side effect', async () => {
  let threw = false;
  try { await bootstrap({ name: 'Bad Name', dryRun: true }); } catch { threw = true; }
  assert(threw, 'invalid name must throw');
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
