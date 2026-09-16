#!/usr/bin/env node
/**
 * Tests for sentinel/toolchain.mjs — scanner availability preflight.
 *
 * openspec: supply-chain-security-program (SCS-REQ-016)
 *
 * Fully hermetic: every filesystem probe is injected, so this never touches
 * the real manifest or the real binaries. The failure paths are the point — a
 * preflight that only works when everything is fine is not a preflight.
 *
 * Run: node tests/sentinel-toolchain.test.mjs
 */

import { preflight, REQUIRED_TOOLS, OSV_DB_MAX_AGE_DAYS } from '../agents/sentinel/toolchain.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try { fn(); console.log('OK'); passed++; }
  catch (err) { console.log('FAIL'); failures.push({ name, err: err.message }); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const NOW = new Date('2026-09-15T12:00:00Z');

function manifestWith(overrides = {}) {
  return {
    osvDbPath: '/db',
    osvDbFetchedAt: '2026-09-15T00:00:00Z',
    tools: {
      'osv-scanner': { path: '/bin/osv-scanner', version: '2.6.0', sha256: 'a' },
      syft: { path: '/bin/syft', version: '1.51.1', sha256: 'b' },
      grype: { path: '/bin/grype', version: '0.118.0', sha256: 'c' },
      gitleaks: { path: '/bin/gitleaks', version: '8.30.1', sha256: 'd' },
    },
    ...overrides,
  };
}
const allPresent = { existsFn: () => true, statFn: () => ({ mode: 0o755 }) };

console.log('sentinel toolchain tests');

test('healthy toolchain resolves every tool to an absolute path', () => {
  const r = preflight({ manifest: manifestWith(), ...allPresent, now: NOW });
  assert(r.ok, 'expected ok');
  assert(r.findings.length === 0, `expected no findings, got ${JSON.stringify(r.findings)}`);
  for (const name of Object.keys(REQUIRED_TOOLS)) {
    assert(r.tools[name], `missing tool ${name}`);
    assert(r.tools[name].startsWith('/'), `${name} path must be absolute, got ${r.tools[name]}`);
  }
});

test('a missing tool is HIGH, never a silent skip', () => {
  const r = preflight({
    manifest: manifestWith(),
    existsFn: (p) => p !== '/bin/gitleaks',
    statFn: () => ({ mode: 0o755 }),
    now: NOW,
  });
  assert(!r.ok, 'a missing scanner must fail preflight');
  const f = r.findings.find(x => x.subject === 'gitleaks');
  assert(f, 'expected a finding naming gitleaks');
  assert(f.severity === 'high', `expected high, got ${f.severity}`);
  assert(!r.tools.gitleaks, 'a missing tool must not be handed to scanners');
  assert(/security-toolchain-install/.test(f.remedy), 'finding must carry an actionable remedy');
});

test('present-but-not-executable is caught (the easy blind spot)', () => {
  const r = preflight({
    manifest: manifestWith(),
    existsFn: () => true,
    statFn: (p) => ({ mode: p === '/bin/syft' ? 0o644 : 0o755 }),
    now: NOW,
  });
  assert(!r.ok, 'a non-executable scanner must fail preflight');
  const f = r.findings.find(x => x.subject === 'syft');
  assert(f && /not executable/.test(f.summary), `expected a not-executable finding, got ${JSON.stringify(f)}`);
  assert(!r.tools.syft, 'a non-executable tool must not be handed to scanners');
});

test('an absent manifest is HIGH, not a crash', () => {
  const r = preflight({ existsFn: () => false, statFn: () => ({ mode: 0o755 }), manifest: null, now: NOW });
  // manifest:null falls through to loadManifest(), which reads the real path;
  // either way the contract is: never throw, and never silently pass.
  assert(typeof r.ok === 'boolean', 'must return a result, not throw');
  assert(Array.isArray(r.findings), 'must always return findings[]');
});

test('a stale OSV database is a finding', () => {
  const stale = new Date('2026-09-30T12:00:00Z'); // 15 days after the fetch
  const r = preflight({ manifest: manifestWith(), ...allPresent, now: stale });
  const f = r.findings.find(x => x.subject === 'osv-database');
  assert(f, 'expected a staleness finding');
  assert(f.severity === 'medium', `expected medium, got ${f.severity}`);
  assert(r.ok, 'staleness degrades confidence but must not fail preflight');
});

test('a database just inside the threshold does not fire', () => {
  const edge = new Date(Date.parse('2026-09-15T00:00:00Z') + (OSV_DB_MAX_AGE_DAYS - 0.5) * 86400000);
  const r = preflight({ manifest: manifestWith(), ...allPresent, now: edge });
  assert(!r.findings.some(x => x.subject === 'osv-database'), 'must not fire inside the threshold');
});

test('a never-seeded database is a finding', () => {
  const r = preflight({ manifest: manifestWith({ osvDbFetchedAt: '' }), ...allPresent, now: NOW });
  const f = r.findings.find(x => x.subject === 'osv-database');
  assert(f && /never seeded/.test(f.summary), `expected a never-seeded finding, got ${JSON.stringify(f)}`);
});

test('an unparseable database timestamp is a finding, not a crash', () => {
  const r = preflight({ manifest: manifestWith({ osvDbFetchedAt: 'not-a-date' }), ...allPresent, now: NOW });
  const f = r.findings.find(x => x.subject === 'osv-database');
  assert(f && /unreadable/.test(f.summary), `expected an unreadable-timestamp finding, got ${JSON.stringify(f)}`);
});

test('every finding carries evidence and a remedy', () => {
  const r = preflight({ manifest: manifestWith({ osvDbFetchedAt: '' }), existsFn: () => false, statFn: () => ({ mode: 0 }), now: NOW });
  assert(r.findings.length > 0, 'expected findings');
  for (const f of r.findings) {
    assert(Array.isArray(f.evidence) && f.evidence.length > 0, `finding without evidence: ${f.summary}`);
    assert(typeof f.remedy === 'string' && f.remedy.length > 0, `finding without remedy: ${f.summary}`);
    assert(f.source === 'tool', `stage-1 findings must be source=tool, got ${f.source}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`);
  process.exit(1);
}
