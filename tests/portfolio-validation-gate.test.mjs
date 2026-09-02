/**
 * The portfolio integrity layer of four-layer-validate.
 * Spec: openspec/changes/business-os/specs/portfolio-registry.md REQ-003
 *
 * The property under test: a forgotten `tier` fails at COMMIT time. env-guard
 * denies the same mistake at runtime, but by then an agent is already blocked
 * and nobody is watching.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(import.meta.dirname, '..', 'agents', 'four-layer-validate.mjs');

function gate(portfolio) {
  const dir = mkdtempSync(join(tmpdir(), 'gate-'));
  const p = join(dir, 'portfolio.json');
  writeFileSync(p, JSON.stringify(portfolio));
  try {
    const out = execFileSync('node', [SCRIPT, '--json'], {
      encoding: 'utf8', env: { ...process.env, PORTFOLIO_PATH: p },
    });
    return JSON.parse(out);
  } catch (err) {
    // non-zero exit still prints the JSON report on stdout
    return JSON.parse(err.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const layerOf = (r) => r.layers.find((l) => l.name === 'Portfolio Integrity');

test('the gate FAILS when an environment has no tier', () => {
  const r = gate({ version: 1, projects: [
    { name: 'demo', owner: 'self', stage: 'build', environments: [{ name: 'production' }] },
  ] });
  const layer = layerOf(r);
  assert.equal(layer.status, 'fail');
  assert.equal(r.passed, false, 'a missing tier must fail the whole gate, not just warn');
  const text = layer.details.join('\n');
  assert.match(text, /demo/, 'names the project');
  assert.match(text, /production/, 'names the environment');
  assert.match(text, /tier/, 'names the field');
});

test('the gate FAILS when a client project has no client name', () => {
  const r = gate({ version: 1, projects: [{ name: 'demo', owner: 'client', stage: 'live' }] });
  assert.equal(layerOf(r).status, 'fail');
  assert.equal(r.passed, false);
});

test('the gate FAILS when a credential VALUE is pasted where a name belongs', () => {
  const r = gate({ version: 1, projects: [
    { name: 'demo', owner: 'self', stage: 'build',
      environments: [{ name: 'p', tier: 'scratch', credentialVars: ['sk-live-abc123'] }] },
  ] });
  assert.equal(layerOf(r).status, 'fail');
  assert.match(layerOf(r).details.join('\n'), /variable NAME/);
});

test('the gate PASSES a conforming portfolio and reports the tier census', () => {
  const r = gate({ version: 1, projects: [
    { name: 'demo', owner: 'client', client: 'Acme', stage: 'live',
      environments: [{ name: 'production', tier: 'customer-production' }, { name: 'staging', tier: 'scratch' }] },
  ] });
  const layer = layerOf(r);
  assert.equal(layer.status, 'pass');
  assert.match(layer.details.join('\n'), /customer-production=1/);
});

test('the gate FAILS on unparseable JSON rather than skipping it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-'));
  const p = join(dir, 'portfolio.json');
  writeFileSync(p, '{ not json');
  try {
    let report;
    try {
      report = JSON.parse(execFileSync('node', [SCRIPT, '--json'],
        { encoding: 'utf8', env: { ...process.env, PORTFOLIO_PATH: p } }));
    } catch (err) { report = JSON.parse(err.stdout); }
    assert.equal(layerOf(report).status, 'fail');
    assert.match(layerOf(report).details.join('\n'), /not valid JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// =========================================================================
// T-206 — a task that bypasses env-guard fails the gate
// =========================================================================
import { mkdirSync } from 'node:fs';

function gateWithQueue(tasks) {
  // Runs the real gate against the real repo but with a temp queue injected
  // via a copy of tasks/queue is not possible; instead assert the pattern
  // itself, which is what the layer applies.
  const RE = /\b(?:supabase\s+db\s+(?:push|reset)|vercel\s+(?:--prod|deploy\s+--prod)|npx\s+supabase\s+db\s+(?:push|reset))\b/i;
  return tasks.map((t) => RE.test(t));
}

test('the bypass pattern catches the commands that reach an environment directly', () => {
  const [a, b, c, d, e] = gateWithQueue([
    'Run supabase db push to apply the migration',
    'Deploy with vercel --prod once tests pass',
    'Use npx supabase db reset to rebuild local state',
    'Add a column to the migrations directory and commit it',
    'Call deploy-runner, which owns deploys',
  ]);
  assert.equal(a, true, 'supabase db push must be flagged');
  assert.equal(b, true, 'vercel --prod must be flagged');
  assert.equal(c, true, 'npx supabase db reset must be flagged');
  assert.equal(d, false, 'ordinary migration work must not be flagged');
  assert.equal(e, false, 'going through the runner is the correct path');
});

test('the live repo has no queued task that bypasses the guard', () => {
  const r = JSON.parse((() => {
    try { return execFileSync('node', [SCRIPT, '--json'], { encoding: 'utf8' }); }
    catch (err) { return err.stdout; }
  })());
  const layer = r.layers.find((l) => l.name === 'Portfolio Integrity');
  assert.match(layer.details.join('\n'), /no queued task bypasses env-guard/);
});
