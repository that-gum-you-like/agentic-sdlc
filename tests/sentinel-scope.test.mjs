#!/usr/bin/env node
/**
 * Tests for sentinel/scope.mjs — blast-radius weighting.
 * openspec: supply-chain-security-program (SCS-REQ-009)
 *
 * Run: node tests/sentinel-scope.test.mjs
 */

import {
  expandHome, loadScope, resolveRepos, tierFor, weighSeverity, weighFindings,
} from '../agents/sentinel/scope.mjs';

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try { fn(); console.log('OK'); passed++; }
  catch (err) { console.log('FAIL'); failures.push({ name, err: err.message }); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const SCOPE = {
  protectedClasses: ['secrets', 'install-scripts', 'slopsquat'],
  repos: [
    { name: 'tally', path: '~/tally', tier: 1 },
    { name: 'personal-website', path: '~/personal-website', tier: 2 },
    { name: 'cyberdeck', path: '~/cyberdeck', tier: 3 },
    { name: 'languageapp', path: '~/languageapp', tier: 3, readOnly: true },
  ],
  extraManifests: ['~/a/package.json', '~/missing/package.json'],
};

console.log('sentinel scope tests');

test('expandHome expands a leading tilde only', () => {
  assert(expandHome('~/x', '/home/t') === '/home/t/x', 'tilde not expanded');
  assert(expandHome('/abs/x', '/home/t') === '/abs/x', 'absolute path must be untouched');
  assert(expandHome('rel/~x', '/home/t') === 'rel/~x', 'mid-path tilde must be untouched');
});

test('resolves present repos and REPORTS absent ones', () => {
  const { repos, missing } = resolveRepos({
    scope: SCOPE, home: '/home/t',
    existsFn: (p) => !p.includes('cyberdeck') && !p.includes('missing'),
  });
  assert(repos.length === 3, `expected 3 present, got ${repos.length}`);
  assert(missing.length === 1 && missing[0].name === 'cyberdeck',
    'an absent repo must be reported, not silently skipped');
});

test('lockfile presence is detected per repo', () => {
  const { repos } = resolveRepos({
    scope: SCOPE, home: '/home/t',
    existsFn: (p) => !p.endsWith('package-lock.json') || p.includes('tally'),
  });
  assert(repos.find(r => r.name === 'tally').hasLockfile === true, 'tally should have a lockfile');
  assert(repos.find(r => r.name === 'cyberdeck').hasLockfile === false, 'cyberdeck should not');
});

test('readOnly repos are marked', () => {
  const { repos } = resolveRepos({ scope: SCOPE, home: '/home/t', existsFn: () => true });
  assert(repos.find(r => r.name === 'languageapp').readOnly === true, 'languageapp must be read-only');
  assert(repos.find(r => r.name === 'tally').readOnly === false, 'tally is not read-only');
});

test('an unclassified repo defaults to tier 3 and is flagged', () => {
  const t = tierFor('brand-new-repo', SCOPE);
  assert(t.tier === 3, `expected tier 3, got ${t.tier}`);
  assert(t.classified === false, 'must be flagged as unclassified so it surfaces');
});

// --- the weighting rule the whole tiering exists for ---
test('tier 1 escalates medium to high', () => {
  assert(weighSeverity('medium', 1, 'vulns', SCOPE) === 'high', 'tier 1 must escalate medium');
  assert(weighSeverity('high', 1, 'vulns', SCOPE) === 'high', 'high stays high');
  assert(weighSeverity('low', 1, 'vulns', SCOPE) === 'low', 'low is not escalated');
});

test('tier 3 de-escalates high to medium', () => {
  assert(weighSeverity('high', 3, 'vulns', SCOPE) === 'medium', 'tier 3 should de-escalate');
});

test('tier 2 changes nothing', () => {
  for (const s of ['low', 'medium', 'high']) {
    assert(weighSeverity(s, 2, 'vulns', SCOPE) === s, `tier 2 must not change ${s}`);
  }
});

// --- the exception that keeps the weighting honest ---
test('protected classes are NEVER de-escalated, even at tier 3', () => {
  for (const scanner of ['secrets', 'install-scripts', 'slopsquat']) {
    assert(weighSeverity('high', 3, scanner, SCOPE) === 'high',
      `${scanner} must stay high at tier 3 — a leaked credential is just as valid in a personal repo`);
  }
});

test('protected classes are not escalated either — they are left exactly alone', () => {
  assert(weighSeverity('medium', 1, 'secrets', SCOPE) === 'medium',
    'protected classes carry their own severity unmodified');
});

test('weighFindings records what it changed and why', () => {
  const out = weighFindings([
    { repo: 'tally', scanner: 'vulns', severity: 'medium', summary: 'x' },
    { repo: 'cyberdeck', scanner: 'vulns', severity: 'high', summary: 'y' },
    { repo: 'cyberdeck', scanner: 'secrets', severity: 'high', summary: 'z' },
    { repo: 'personal-website', scanner: 'vulns', severity: 'medium', summary: 'w' },
  ], SCOPE);

  assert(out[0].severity === 'high' && out[0].originalSeverity === 'medium', 'tally medium should escalate');
  assert(/escalated/.test(out[0].weightedBecause), 'must explain the escalation');
  assert(out[1].severity === 'medium' && /de-escalated/.test(out[1].weightedBecause), 'cyberdeck high should de-escalate');
  assert(out[2].severity === 'high' && !out[2].originalSeverity, 'a secret must pass through untouched');
  assert(out[3].severity === 'medium' && !out[3].originalSeverity, 'tier 2 must pass through untouched');
});

// --- the real file has to agree with the design ---
test('the shipped scope.json puts blast radius above dependency count', () => {
  const s = loadScope();
  const tier = (n) => (s.repos.find(r => r.name === n) || {}).tier;
  assert(tier('agentic-sdlc') === 1, 'agentic-sdlc is executed by agents — must be tier 1');
  assert(tier('component-library') === 1, 'component-library is copied everywhere — must be tier 1');
  assert(tier('tally') === 1, 'tally holds customer data — must be tier 1');
  assert(tier('peach-shaker-5000') === 3, 'peach-shaker has the most packages and the least reach — tier 3');
  assert((s.repos.find(r => r.name === 'languageapp') || {}).readOnly === true, 'languageapp must be read-only');
  assert(s.protectedClasses.includes('secrets'), 'secrets must be a protected class');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`);
  process.exit(1);
}
