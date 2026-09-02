/**
 * The guard sits in front of the deploy path.
 * Spec: openspec/changes/business-os/specs/environment-tiering.md REQ-005, REQ-004a
 *
 * Builds a real throwaway git repo + bare origin so the runner takes its normal
 * path, and asserts the guard stops it short of deploying.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { environmentFor } from '../agents/deploy-runner.mjs';

const RUNNER = resolve(import.meta.dirname, '..', 'agents', 'deploy-runner.mjs');
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** A minimal deployable project with a bare origin, plus a portfolio naming it. */
// The deploy clone is keyed on project BASENAME (~/.sdlc-deploy-clone-<name>),
// so every fixture needs a unique name or a later test reuses an earlier
// fixture's clone, still pointed at a since-deleted origin.
let fixtureSeq = 0;

function fixture({ tier, approvalMode = 'none', envName = 'production', includeInPortfolio = true }) {
  const name = `guardfix${process.pid}x${++fixtureSeq}`;
  const root = mkdtempSync(join(tmpdir(), 'deployguard-'));
  const origin = join(root, 'origin.git');
  const work = join(root, name);
  mkdirSync(origin); mkdirSync(work);
  git(origin, ['init', '--bare', '-q']);
  git(work, ['init', '-q', '-b', 'main']);
  git(work, ['config', 'user.email', 'test@example.com']);
  git(work, ['config', 'user.name', 'test']);
  mkdirSync(join(work, 'agents'), { recursive: true });
  writeFileSync(join(work, 'agents', 'project.json'), JSON.stringify({
    name, projectDir: work, testCmd: 'true',
    deploy: {
      enabled: true, deployCmd: 'true', rollbackCmd: 'true', baseBranch: 'main',
      approval: approvalMode, verifyTests: false, cooldownSeconds: 0,
    },
  }));
  writeFileSync(join(work, 'README.md'), 'demo\n');
  git(work, ['add', '-A']);
  git(work, ['commit', '-qm', 'init']);
  git(work, ['remote', 'add', 'origin', origin]);
  git(work, ['push', '-q', 'origin', 'main']);

  const portfolioPath = join(root, 'portfolio.json');
  writeFileSync(portfolioPath, JSON.stringify({
    version: 1,
    projects: includeInPortfolio ? [{
      name, owner: 'self', stage: 'build', path: work,
      environments: [{ name: envName, tier, defaultDeploy: true }],
    }] : [],
  }));
  return { root, work, portfolioPath, name };
}

function cleanClone(name) {
  rmSync(join(process.env.HOME || tmpdir(), `.sdlc-deploy-clone-${name}`), { recursive: true, force: true });
}

function run(f) {
  try {
    return execFileSync('node', [RUNNER, '--project-dir', f.work], {
      encoding: 'utf8',
      env: { ...process.env, PORTFOLIO_PATH: f.portfolioPath, NOTIFY_PROVIDER: 'none' },
    });
  } catch (err) {
    return (err.stdout || '') + (err.stderr || '');
  }
}

test('a customer-production deploy is BLOCKED even when approval is set to none', () => {
  // REQ-004a: the tier overrides local config. "Going for speed" must not be
  // configurable onto a customer's database.
  const f = fixture({ tier: 'customer-production', approvalMode: 'none' });
  try {
    const out = run(f);
    assert.match(out, /BLOCKED by env-guard/);
    assert.match(out, /customer-production/);
    assert.doesNotMatch(out, /deploying/, 'it must not reach the deploy step');
  } finally { cleanClone(f.name); rmSync(f.root, { recursive: true, force: true }); }
});

test('a scratch deploy proceeds through the guard', () => {
  const f = fixture({ tier: 'scratch' });
  try {
    const out = run(f);
    assert.doesNotMatch(out, /BLOCKED by env-guard/);
    assert.match(out, /deploy/);
  } finally { cleanClone(f.name); rmSync(f.root, { recursive: true, force: true }); }
});

test('an internal-production deploy proceeds and is recorded', () => {
  const f = fixture({ tier: 'internal-production' });
  try {
    const out = run(f);
    assert.doesNotMatch(out, /BLOCKED by env-guard/);
  } finally { cleanClone(f.name); rmSync(f.root, { recursive: true, force: true }); }
});

test('a project absent from the portfolio is BLOCKED — no portfolio entry, no known tier', () => {
  const f = fixture({ tier: 'scratch', includeInPortfolio: false });
  try {
    const out = run(f);
    assert.match(out, /BLOCKED by env-guard/);
    assert.match(out, new RegExp(`unknown project "${f.name}"`));
  } finally { cleanClone(f.name); rmSync(f.root, { recursive: true, force: true }); }
});

test('an environment whose tier was forgotten is BLOCKED', () => {
  const f = fixture({ tier: undefined });
  try {
    const out = run(f);
    assert.match(out, /BLOCKED by env-guard/);
    assert.match(out, /no tier/);
  } finally { cleanClone(f.name); rmSync(f.root, { recursive: true, force: true }); }
});

test('environmentFor prefers explicit config, then defaultDeploy, then "production"', () => {
  assert.equal(environmentFor('x', { environment: 'staging' }), 'staging');
  const doc = { projects: [{ name: 'x', environments: [
    { name: 'a' }, { name: 'b', defaultDeploy: true },
  ] }] };
  assert.equal(environmentFor('x', {}, doc), 'b');
  assert.equal(environmentFor('unknown', {}, doc), 'production');
});
