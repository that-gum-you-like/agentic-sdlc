#!/usr/bin/env node
/**
 * Tests for sentinel/advisory-feed.mjs + semver-lite.mjs — live threat intel.
 * openspec: supply-chain-security-program (SCS-REQ-040 – SCS-REQ-043)
 *
 * Every network call is injected. These tests never touch the network, and one
 * of them asserts that our package names are never put into an outbound URL.
 *
 * Run: node tests/sentinel-advisory-feed.test.mjs
 */

import {
  satisfiesRange, satisfiesComparator, compareVersions, parseVersion,
} from '../agents/sentinel/semver-lite.mjs';
import {
  matchAdvisories, scanAdvisories, fetchEcosystemAdvisories, fetchKev,
} from '../agents/sentinel/advisory-feed.mjs';

let passed = 0, failed = 0;
const failures = [];
const queue = [];

// Tests are QUEUED and awaited in order. An earlier version of this harness
// let async tests settle after the summary printed, so it reported "8 passed"
// while 13 ran — a harness that miscounts is the same class of bug as a
// permissive one, and it hides exactly what it is meant to reveal.
function test(name, fn) { queue.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function runAll() {
  for (const { name, fn } of queue) {
    process.stdout.write(`  ${name} ... `);
    try { await fn(); console.log('OK'); passed++; }
    catch (err) { console.log('FAIL'); failures.push({ name, err: err.message }); failed++; }
  }
}

console.log('sentinel advisory-feed tests');

// --- semver-lite ---
test('parses and compares versions', () => {
  assert(compareVersions('1.2.3', '1.2.4') === -1, '1.2.3 < 1.2.4');
  assert(compareVersions('2.0.0', '1.9.9') === 1, '2.0.0 > 1.9.9');
  assert(compareVersions('1.0.0', '1.0.0') === 0, 'equal');
  assert(compareVersions('1.0.0-rc1', '1.0.0') === -1, 'prerelease sorts below release');
  assert(parseVersion('v15.5.19').major === 15, 'leading v tolerated');
  assert(compareVersions('nonsense', '1.0.0') === null, 'unparseable → null');
});

test('evaluates comparators and AND ranges', () => {
  assert(satisfiesComparator('1.0.0', '< 2.0.0') === true, '< works');
  assert(satisfiesComparator('2.0.0', '>= 2.0.0') === true, '>= works');
  assert(satisfiesRange('1.5.0', '>= 1.0.0, < 2.0.0') === true, 'AND range');
  assert(satisfiesRange('2.5.0', '>= 1.0.0, < 2.0.0') === false, 'outside AND range');
});

// --- the real advisory that matters, as a regression fixture ---
test('reproduces the real Next.js advisory ranges (GHSA-2xp9-vwfh-vxw4)', () => {
  assert(satisfiesRange('15.5.19', '>= 10.0.0, < 15.5.24') === true, 'personal-website must match');
  assert(satisfiesRange('16.3.1', '>= 16.0.0, < 16.3.3') === true, 'tally must match');
  assert(satisfiesRange('16.2.10', '>= 16.0.0, < 16.3.3') === true, 'willtopaint must match');
  assert(satisfiesRange('16.3.4', '>= 16.0.0, < 16.3.3') === false, 'nels-workshop is patched and must NOT match');
  assert(satisfiesRange('16.3.4', '>= 10.0.0, < 15.5.24') === false, '16.x must not match the 15.x range');
});

// --- the rule that keeps this honest ---
test('an unparseable range is UNKNOWN, never "not affected"', () => {
  assert(satisfiesRange('1.0.0', '~> 1.0') === null, 'must be null');
  const { findings, unknownRanges } = matchAdvisories(
    [{ ghsa_id: 'GHSA-x', severity: 'high', vulnerabilities: [
      { package: { ecosystem: 'npm', name: 'foo' }, vulnerable_version_range: '~> weird' }] }],
    [{ ecosystem: 'npm', name: 'foo', version: '1.0.0', repo: 'tally' }],
  );
  assert(findings.length === 0, 'no confident finding from an unknown range');
  assert(unknownRanges.length === 1, 'must be recorded as unknown for a human to check');
});

test('matches an affected package and cites the advisory', () => {
  const { findings } = matchAdvisories(
    [{ ghsa_id: 'GHSA-abc', severity: 'critical', summary: 'RCE', published_at: '2026-09-01T00:00:00Z',
       html_url: 'https://github.com/advisories/GHSA-abc',
       vulnerabilities: [{ package: { ecosystem: 'npm', name: 'next' },
         vulnerable_version_range: '< 15.5.24', first_patched_version: '15.5.24' }] }],
    [{ ecosystem: 'npm', name: 'next', version: '15.5.19', repo: 'personal-website' }],
  );
  assert(findings.length === 1, `expected 1 finding, got ${findings.length}`);
  assert(findings[0].severity === 'high', 'critical maps to high');
  assert(/15\.5\.24/.test(findings[0].remedy), 'remedy must name the fixed version');
  assert(findings[0].evidence.some(e => /GHSA-abc/.test(e)), 'must cite the advisory URL');
});

test('an unaffected version produces nothing', () => {
  const { findings } = matchAdvisories(
    [{ ghsa_id: 'G', severity: 'critical', vulnerabilities: [
      { package: { ecosystem: 'npm', name: 'next' }, vulnerable_version_range: '< 15.5.24' }] }],
    [{ ecosystem: 'npm', name: 'next', version: '16.3.4', repo: 'nels-workshop' }],
  );
  assert(findings.length === 0, 'a patched version must be silent');
});

test('a package we do not have is ignored', () => {
  const { findings } = matchAdvisories(
    [{ ghsa_id: 'G', severity: 'critical', vulnerabilities: [
      { package: { ecosystem: 'npm', name: 'not-ours' }, vulnerable_version_range: '< 9' }] }],
    [{ ecosystem: 'npm', name: 'next', version: '1.0.0', repo: 'x' }],
  );
  assert(findings.length === 0, 'must not report packages we do not use');
});

// --- known-exploited escalation ---
test('a KEV-listed CVE escalates above its CVSS severity', () => {
  const adv = { ghsa_id: 'G', severity: 'low', cve_id: 'CVE-2026-1',
    vulnerabilities: [{ package: { ecosystem: 'npm', name: 'x' }, vulnerable_version_range: '< 2' }] };
  const inv = [{ ecosystem: 'npm', name: 'x', version: '1.0.0', repo: 'tally' }];

  const plain = matchAdvisories([adv], inv, new Set());
  assert(plain.findings[0].severity === 'low', 'baseline should be low');

  const exploited = matchAdvisories([adv], inv, new Set(['CVE-2026-1']));
  assert(exploited.findings[0].severity === 'high', 'KEV must escalate to high');
  assert(/ACTIVELY EXPLOITED/.test(exploited.findings[0].summary), 'must say so plainly');
});

// --- the privacy property, asserted rather than assumed ---
test('outbound requests never carry our package names', async () => {
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(String(url));
    return { ok: true, json: async () => ([]) };
  };
  await scanAdvisories({
    inventory: [{ ecosystem: 'npm', name: 'super-secret-internal-pkg', version: '1.0.0', repo: 'tally' }],
    ecosystems: ['npm'], since: '2026-09-01', fetchFn,
  });
  assert(urls.length > 0, 'expected outbound calls');
  for (const u of urls) {
    assert(!u.includes('super-secret-internal-pkg'),
      `PRIVACY VIOLATION: package name appeared in an outbound URL: ${u}`);
    assert(!/tally/.test(u), `PRIVACY VIOLATION: repo name appeared in ${u}`);
  }
});

test('queries are scoped by ecosystem and date only', async () => {
  const urls = [];
  const fetchFn = async (url) => { urls.push(String(url)); return { ok: true, json: async () => ([]) }; };
  await fetchEcosystemAdvisories('npm', { since: '2026-09-01', fetchFn, maxPages: 1 });
  assert(/ecosystem=npm/.test(urls[0]), 'must scope by ecosystem');
  assert(/published=%3E2026-09-01|published=>2026-09-01/.test(urls[0]), 'must scope by date');
});

// --- failure must never look like success ---
test('a feed failure becomes a finding, not silence', async () => {
  const fetchFn = async () => { throw new Error('ENETUNREACH'); };
  const { findings } = await scanAdvisories({ inventory: [], ecosystems: ['npm'], fetchFn });
  assert(findings.some(f => /could not fetch npm advisories/.test(f.summary)),
    'an unreachable feed must be reported');
  assert(findings.some(f => /could not reach the CISA/.test(f.summary)), 'KEV failure must be reported too');
});

test('KEV failure still allows advisory matching to proceed', async () => {
  const fetchFn = async (url) => {
    if (String(url).includes('cisa.gov')) throw new Error('down');
    return { ok: true, json: async () => ([{ ghsa_id: 'G', severity: 'high',
      vulnerabilities: [{ package: { ecosystem: 'npm', name: 'x' }, vulnerable_version_range: '< 2' }] }]) };
  };
  const { findings } = await scanAdvisories({
    inventory: [{ ecosystem: 'npm', name: 'x', version: '1.0.0', repo: 'tally' }],
    ecosystems: ['npm'], fetchFn,
  });
  assert(findings.some(f => f.subject === 'x'), 'advisory matching must still run without KEV');
});

test('an HTTP error is surfaced', async () => {
  const fetchFn = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const { findings } = await scanAdvisories({ inventory: [], ecosystems: ['npm'], fetchFn });
  assert(findings.some(f => /503/.test(f.detail)), 'HTTP status should reach the finding');
});

await runAll();

console.log(`\n${passed} passed, ${failed} failed`);
if (passed + failed !== queue.length) {
  console.log(`  ✗ harness error: ${queue.length} queued but ${passed + failed} reported`);
  process.exit(1);
}
if (failed > 0) {
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`);
  process.exit(1);
}
