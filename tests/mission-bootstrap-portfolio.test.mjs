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
import { existsSync } from 'node:fs';
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