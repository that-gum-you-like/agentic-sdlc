/**
 * portfolio.mjs — roster CRUD and validation.
 * Spec: openspec/changes/business-os/specs/portfolio-registry.md REQ-001..REQ-003
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  load, validate, list, show, add, set, status, OWNERS, STAGES, TIERS,
} from '../portfolio.mjs';

const base = () => ({ version: 1, projects: [] });
const proj = (o = {}) => ({ name: 'demo', owner: 'self', stage: 'build', ...o });

function withFile(contents, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'portfolio-'));
  const p = join(dir, 'portfolio.json');
  writeFileSync(p, typeof contents === 'string' ? contents : JSON.stringify(contents));
  try { return fn(p); } finally { rmSync(dir, { recursive: true, force: true }); }
}

// --- REQ-001: shape -------------------------------------------------------

test('a conforming portfolio validates clean', () => {
  assert.deepEqual(validate({ version: 1, projects: [proj()] }), []);
});

test('missing name, bad owner, and bad stage are each reported', () => {
  const errs = validate({ version: 1, projects: [{ owner: 'nobody', stage: 'shipping' }] });
  assert.ok(errs.some((e) => /missing required field "name"/.test(e)));
  assert.ok(errs.some((e) => /owner "nobody"/.test(e)));
  assert.ok(errs.some((e) => /stage "shipping"/.test(e)));
});

test('duplicate names are rejected', () => {
  const errs = validate({ version: 1, projects: [proj(), proj()] });
  assert.ok(errs.some((e) => /duplicate name "demo"/.test(e)));
});

test('owner:client without a client name is rejected', () => {
  const errs = validate({ version: 1, projects: [proj({ owner: 'client' })] });
  assert.ok(errs.some((e) => /non-empty "client" name is required/.test(e)));
  assert.deepEqual(validate({ version: 1, projects: [proj({ owner: 'client', client: 'Acme' })] }), []);
});

test('a whitespace-only client name does not satisfy owner:client', () => {
  const errs = validate({ version: 1, projects: [proj({ owner: 'client', client: '   ' })] });
  assert.ok(errs.some((e) => /non-empty "client" name is required/.test(e)));
});

test('non-kebab-case names are rejected', () => {
  for (const bad of ['Demo', 'my_project', '-leading', 'a'.repeat(40)]) {
    const errs = validate({ version: 1, projects: [proj({ name: bad })] });
    assert.ok(errs.some((e) => /kebab-case/.test(e)), `${bad} should be rejected`);
  }
});

// --- REQ-001 / environment-tiering REQ-001: the tier is the point ---------

test('an environment with no tier is rejected, and the message says there is no default', () => {
  const errs = validate({ version: 1, projects: [proj({ environments: [{ name: 'production' }] })] });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /missing required field "tier"/);
  assert.match(errs[0], /no default/);
});

test('tier matching is exact — case variants and near-misses are rejected', () => {
  for (const bad of ['Scratch', 'CUSTOMER-PRODUCTION', 'prod', 'production', ' scratch', '']) {
    const errs = validate({ version: 1, projects: [proj({ environments: [{ name: 'e', tier: bad }] })] });
    assert.ok(errs.length > 0, `tier ${JSON.stringify(bad)} must be rejected`);
  }
});

test('all three tiers are accepted', () => {
  for (const t of TIERS) {
    assert.deepEqual(validate({ version: 1, projects: [proj({ environments: [{ name: 'e', tier: t }] })] }), []);
  }
});

test('credentialVars must be NAMES, never values', () => {
  const ok = validate({ version: 1, projects: [proj({ environments: [{ name: 'e', tier: 'scratch', credentialVars: ['TALLY_PROD_URL'] }] })] });
  assert.deepEqual(ok, []);
  // Things that look like pasted secrets rather than variable names.
  for (const bad of ['sk-abc123', 'eyJhbGciOiJIUzI1', 'https://x.supabase.co', 'lowercase_name']) {
    const errs = validate({ version: 1, projects: [proj({ environments: [{ name: 'e', tier: 'scratch', credentialVars: [bad] }] })] });
    assert.ok(errs.some((e) => /variable NAME/.test(e)), `${bad} should be rejected`);
  }
});

test('one malformed environment does not mask a sibling', () => {
  const errs = validate({ version: 1, projects: [proj({ environments: [
    { name: 'staging', tier: 'scratch' },
    { name: 'production' },
  ] })] });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /env "production"/);
});

// --- REQ-001: load error paths are named, not stack traces ----------------

test('a missing file, non-JSON, non-object, and missing projects array are each named', () => {
  assert.throws(() => load('/nonexistent/portfolio.json'), /portfolio not found/);
  withFile('{not json', (p) => assert.throws(() => load(p), /not valid JSON/));
  withFile('[]', (p) => assert.throws(() => load(p), /must be a JSON object/));
  withFile({ version: 1 }, (p) => assert.throws(() => load(p), /"projects" array/));
});

// --- REQ-002: verbs -------------------------------------------------------

test('add refuses a duplicate and writes nothing', () => {
  const doc = { version: 1, projects: [proj()] };
  assert.throws(() => add(doc, proj()), /already exists/);
  assert.equal(doc.projects.length, 1, 'input document must not be mutated');
});

test('add refuses a project that would fail validation', () => {
  assert.throws(() => add(base(), proj({ owner: 'client' })), /refusing to add/);
});

test('set refuses an unknown key and an invalid value', () => {
  const doc = { version: 1, projects: [proj()] };
  assert.throws(() => set(doc, 'demo', 'tier', 'scratch'), /not settable/);
  assert.throws(() => set(doc, 'demo', 'stage', 'shipping'), /refusing to set/);
  assert.throws(() => set(doc, 'nope', 'stage', 'live'), /no such project/);
});

test('set coerces enabled to a real boolean', () => {
  const doc = { version: 1, projects: [proj()] };
  assert.equal(set(doc, 'demo', 'enabled', 'true').projects[0].enabled, true);
  assert.equal(set(doc, 'demo', 'enabled', 'false').projects[0].enabled, false);
  assert.throws(() => set(doc, 'demo', 'enabled', 'yes'), /must be true or false/);
});

test('setting owner to client without a client name is refused', () => {
  const doc = { version: 1, projects: [proj()] };
  assert.throws(() => set(doc, 'demo', 'owner', 'client'), /refusing to set/);
});

test('show returns the project or names the miss', () => {
  const doc = { version: 1, projects: [proj()] };
  assert.equal(show(doc, 'demo').name, 'demo');
  assert.throws(() => show(doc, 'ghost'), /no such project "ghost"/);
});

test('list summarizes owner, stage, drain toggle, and tiers', () => {
  const doc = { version: 1, projects: [proj({ owner: 'client', client: 'Acme', enabled: true,
    environments: [{ name: 'production', tier: 'customer-production' }] })] };
  const [row] = list(doc);
  assert.equal(row.client, 'Acme');
  assert.equal(row.enabled, true);
  assert.deepEqual(row.environments, [{ name: 'production', tier: 'customer-production' }]);
});

test('status counts tiers and flags untiered environments', () => {
  const doc = { version: 1, projects: [
    proj({ name: 'a', environments: [{ name: 'p', tier: 'customer-production' }] }),
    proj({ name: 'b', owner: 'client', client: 'Acme', environments: [{ name: 'p' }] }),
  ] };
  const s = status(doc);
  assert.equal(s.projects, 2);
  assert.equal(s.byTier['customer-production'], 1);
  assert.equal(s.untiered, 1, 'an environment with no tier must be visible in status');
  assert.deepEqual(s.clients, ['Acme']);
});

// --- rule #9 --------------------------------------------------------------

test('importing the module runs no CLI side effects', () => {
  // If it did, importing above would already have exited the test process.
  assert.equal(typeof list, 'function');
  assert.ok(OWNERS.includes('self') && STAGES.includes('live'));
});
