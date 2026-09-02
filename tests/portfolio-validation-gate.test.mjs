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
