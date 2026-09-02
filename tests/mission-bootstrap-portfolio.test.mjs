#!/usr/bin/env node
/**
 * Tests for mission-bootstrap.mjs portfolio registration
 * (openspec: wireframe-gate REQ-003, task T-601).
 *
 * A bootstrapped mission is born with exactly two tiered environments — staging
 * on `scratch`, production on `internal-production` — registered in
 * portfolio.json. A second run neither duplicates the entry nor re-provisions;
 * `--dry-run` prints both environments and writes nothing; no bootstrap path
 * may produce a `customer-production` environment.
 *
 * Run: node tests/mission-bootstrap-portfolio.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  MISSION_ENVIRONMENTS,
  buildPortfolioEntry,
  registerInPortfolio,
  bootstrap,
} from '../agents/mission-bootstrap.mjs';
import { validate } from '../agents/portfolio.mjs';

test('MISSION_ENVIRONMENTS is exactly the staging + production pair, never customer-production', () => {
  assert.equal(MISSION_ENVIRONMENTS.length, 2, 'exactly two environments');
  const byName = Object.fromEntries(MISSION_ENVIRONMENTS.map((e) => [e.name, e.tier]));
  assert.deepEqual(byName, { staging: 'scratch', production: 'internal-production' });
  for (const e of MISSION_ENVIRONMENTS) {
    assert.ok(e.name && e.tier, 'every environment carries name + tier');
    assert.notEqual(e.tier, 'customer-production', 'no bootstrap path may produce customer-production');
  }
});

test('buildPortfolioEntry yields exactly two tiered environments and a schema-valid project', () => {
  const entry = buildPortfolioEntry('demo-mission', { description: 'test mission' });
  assert.equal(entry.name, 'demo-mission');
  assert.equal(entry.description, 'test mission');
  assert.equal(entry.owner, 'self');
  assert.equal(entry.stage, 'idea');
  assert.equal(entry.environments.length, 2, 'exactly two environments');
  const byName = Object.fromEntries(entry.environments.map((e) => [e.name, e.tier]));
  assert.deepEqual(byName, { staging: 'scratch', production: 'internal-production' });
  for (const e of entry.environments) {
    assert.notEqual(e.tier, 'customer-production', 'mission is never born customer-production');
  }
  const problems = validate({ version: 1, projects: [entry] });
  assert.deepEqual(problems, [], `entry must pass portfolio validation, got: ${problems.join('; ')}`);
});

test('registerInPortfolio adds once; a second run neither duplicates nor changes anything', () => {
  const doc = { version: 1, projects: [] };
  const first = registerInPortfolio(doc, 'demo-mission');
  assert.equal(first.status, 'added');
  assert.equal(first.doc.projects.length, 1);
  assert.equal(first.doc.projects[0].environments.length, 2);

  const second = registerInPortfolio(first.doc, 'demo-mission');
  assert.equal(second.status, 'exists');
  assert.equal(second.doc.projects.length, 1, 'second run must not duplicate the portfolio entry');
  assert.equal(second.doc.projects[0].environments.length, 2, 'second run must not re-provision environments');
  assert.deepEqual(second.doc, first.doc, 'second run changes nothing');
});

test('bootstrap --dry-run prints both environments and writes nothing (REQ-003)', async () => {
  const fakeHome = join(tmpdir(), `mission-portfolio-dry-${process.pid}`);
  const fakePortfolio = join(fakeHome, 'portfolio.json');
  const logs = [];
  const { plan } = await bootstrap({
    name: 'dry-run-demo',
    dryRun: true,
    home: fakeHome,
    portfolioPath: fakePortfolio,
    log: (m) => logs.push(m),
  });

  const planLine = plan.find((p) => p.includes('portfolio:'));
  assert.ok(planLine, 'dry-run plans a portfolio registration step');
  assert.ok(planLine.includes('staging (scratch)'), `dry-run prints the staging environment: ${planLine}`);
  assert.ok(planLine.includes('production (internal-production)'), `dry-run prints the production environment: ${planLine}`);
  assert.ok(logs.some((l) => l.includes('PLAN: portfolio:')), 'registration step is logged as PLAN');
  assert.ok(
    logs.some((l) => l.includes('environments: staging (scratch) + production (internal-production)')),
    'summary names both environments'
  );
  assert.ok(!logs.some((l) => l.includes('DONE: portfolio:')), 'dry-run must not execute the registration');
  assert.ok(!existsSync(fakePortfolio), 'dry-run must not write the portfolio file');
  assert.ok(!existsSync(fakeHome), 'dry-run must create nothing under home');
});

// ---------------------------------------------------------------------------
// REQ-004 — client ownership is explicit, promotion is a reviewed commit (T-602)
// ---------------------------------------------------------------------------

test('buildPortfolioEntry with --client "Acme" yields owner: client + client name, same tier pair', () => {
  const entry = buildPortfolioEntry('acme-mission', { description: 'client work', client: 'Acme' });
  assert.equal(entry.owner, 'client', 'owner must be "client"');
  assert.equal(entry.client, 'Acme', 'client name carried on the entry');
  const byName = Object.fromEntries(entry.environments.map((e) => [e.name, e.tier]));
  assert.deepEqual(byName, { staging: 'scratch', production: 'internal-production' }, 'client ownership still provisions the same pair');
  const problems = validate({ version: 1, projects: [entry] });
  assert.deepEqual(problems, [], `client entry must validate, got: ${problems.join('; ')}`);
});

test('--client alone changes no tier; absent --client keeps owner: self and no client field', () => {
  const plain = buildPortfolioEntry('acme-mission', { description: 'x' });
  const client = buildPortfolioEntry('acme-mission', { description: 'x', client: 'Acme' });
  assert.equal(plain.owner, 'self');
  assert.equal('client' in plain, false, 'no --client means no client field');
  assert.equal(client.owner, 'client');
  assert.equal(client.client, 'Acme');
  const tiers = (e) => e.environments.map((env) => `${env.name}:${env.tier}`).sort().join(',');
  assert.equal(tiers(client), tiers(plain), '--client must not change any tier');
});

test('registerInPortfolio threads client through to the registered entry (REQ-004)', () => {
  const doc = { version: 1, projects: [] };
  const { doc: next, status } = registerInPortfolio(doc, 'acme-mission', { description: 'x', client: 'Acme' });
  assert.equal(status, 'added');
  assert.equal(next.projects[0].owner, 'client');
  assert.equal(next.projects[0].client, 'Acme');
  assert.equal(next.projects[0].environments.length, 2, 'client entry still has exactly two environments');
});

test('bootstrap --dry-run with a client plans owner: client and still writes nothing', async () => {
  const fakeHome = join(tmpdir(), `mission-client-dry-${process.pid}`);
  const fakePortfolio = join(fakeHome, 'portfolio.json');
  const logs = [];
  const { plan } = await bootstrap({
    name: 'acme-mission',
    dryRun: true,
    client: 'Acme',
    home: fakeHome,
    portfolioPath: fakePortfolio,
    log: (m) => logs.push(m),
  });
  const planLine = plan.find((p) => p.includes('portfolio:'));
  assert.ok(planLine.includes('owner client (Acme)'), `dry-run plan names the client owner: ${planLine}`);
  assert.ok(planLine.includes('staging (scratch)') && planLine.includes('production (internal-production)'), 'same tier pair planned');
  assert.ok(logs.some((l) => l.includes('owner:       client (Acme)')), 'summary reports the client owner');
  assert.ok(!existsSync(fakePortfolio), 'dry-run must not write the portfolio file');
});

test('no code path can write customer-production into portfolio.json (REQ-004, grep-style)', () => {
  const src = readFileSync(new URL('../agents/mission-bootstrap.mjs', import.meta.url), 'utf8');
  // Grep the write path: every line that feeds an environment tier or a
  // portfolio write. `customer-production` may appear only in comments and
  // the MISSION_ENVIRONMENTS frozen pair — never as something bootstrap
  // could write.
  const codeOnly = src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n');
  assert.ok(
    codeOnly.includes('customer-production') === false,
    'the string customer-production must not appear in executable bootstrap code'
  );
});