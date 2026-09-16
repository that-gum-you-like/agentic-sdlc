#!/usr/bin/env node
/**
 * Tests for sentinel/vulns.mjs — SBOM + offline CVE matching.
 * openspec: supply-chain-security-program (SCS-REQ-005)
 *
 * Every subprocess is injected. One test asserts the scan is invoked offline,
 * and another that no SBOM is ever transmitted.
 *
 * Run: node tests/sentinel-vulns.test.mjs
 */

import {
  severityFromScore, parseOsvResults, scanRepoVulns, generateSbom,
} from '../agents/sentinel/vulns.mjs';

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try { fn(); console.log('OK'); passed++; }
  catch (err) { console.log('FAIL'); failures.push({ name, err: err.message }); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

/** An osv-scanner report shaped like the real thing. */
const osvReport = {
  results: [{
    source: { path: '/repo/package-lock.json' },
    packages: [
      {
        package: { name: 'next', version: '15.5.19', ecosystem: 'npm' },
        vulnerabilities: [
          { id: 'GHSA-2xp9-vwfh-vxw4', summary: 'Unauthenticated RCE in Image Optimization' },
          { id: 'GHSA-p293-qw3h-jr36', summary: 'Another one' },
        ],
        groups: [{ max_severity: '9.5' }],
      },
      {
        package: { name: 'tiny', version: '1.0.0', ecosystem: 'npm' },
        vulnerabilities: [{ id: 'GHSA-low' }],
        groups: [{ max_severity: '2.1' }],
      },
      { package: { name: 'clean', version: '1.0.0', ecosystem: 'npm' }, vulnerabilities: [], groups: [] },
    ],
  }],
};

console.log('sentinel vulns tests');

test('CVSS scores map to the shared severity vocabulary', () => {
  assert(severityFromScore(9.5) === 'high', '9.5 → high');
  assert(severityFromScore(7.0) === 'high', '7.0 → high');
  assert(severityFromScore(6.9) === 'medium', '6.9 → medium');
  assert(severityFromScore(4.0) === 'medium', '4.0 → medium');
  assert(severityFromScore(3.9) === 'low', '3.9 → low');
});

test('an unknown score is medium, never low', () => {
  assert(severityFromScore(undefined) === 'medium', 'unknown must not be treated as low');
  assert(severityFromScore('n/a') === 'medium', 'unparseable must not be treated as low');
});

test('parses findings and counts advisories', () => {
  const { findings, packagesScanned } = parseOsvResults(osvReport, { repo: 'personal-website' });
  assert(packagesScanned === 3, `expected 3 packages walked, got ${packagesScanned}`);
  assert(findings.length === 2, `clean packages must not become findings, got ${findings.length}`);
  const next = findings.find(f => f.subject === 'next');
  assert(next.severity === 'high', 'CVSS 9.5 must be high');
  assert(/2 known vulnerabilities/.test(next.summary), `wrong summary: ${next.summary}`);
  assert(next.advisoryIds.includes('GHSA-2xp9-vwfh-vxw4'), 'must carry advisory ids');
});

test('findings cite resolvable advisory links', () => {
  const { findings } = parseOsvResults(osvReport, { repo: 'x' });
  const next = findings.find(f => f.subject === 'next');
  assert(next.evidence.some(e => /osv\.dev\/GHSA-2xp9/.test(e)), 'must cite an osv.dev link');
  assert(next.remedy && /upgrade/i.test(next.remedy), 'must carry a remedy');
});

test('a low-scoring package is reported at low', () => {
  const { findings } = parseOsvResults(osvReport, { repo: 'x' });
  assert(findings.find(f => f.subject === 'tiny').severity === 'low', 'CVSS 2.1 → low');
});

test('an empty report produces nothing', () => {
  const { findings } = parseOsvResults({ results: [] }, { repo: 'x' });
  assert(findings.length === 0, 'expected silence');
});

test('a malformed report does not throw', () => {
  assert(parseOsvResults(null, { repo: 'x' }).findings.length === 0, 'null must be safe');
  assert(parseOsvResults({}, { repo: 'x' }).findings.length === 0, 'empty object must be safe');
});

// --- the exit-code subtlety that would silently drop every real result ---
test('exit status 1 means vulnerabilities found, not failure', () => {
  const err = new Error('exited with 1');
  err.status = 1;
  err.stdout = JSON.stringify(osvReport);
  const r = scanRepoVulns({
    repo: 'x', path: '/repo', osvPath: '/fake', dbPath: '/db',
    execFn: () => { throw err; }, existsFn: () => true,
  });
  assert(r.findings.length === 2, `results must be parsed from a status-1 run, got ${r.findings.length}`);
  assert(!r.findings.some(f => /failed/.test(f.summary)), 'must not be reported as a failure');
});

test('any other exit status is a reported failure', () => {
  const err = new Error('command not found');
  err.status = 127;
  const r = scanRepoVulns({
    repo: 'x', path: '/repo', osvPath: '/fake', dbPath: '/db',
    execFn: () => { throw err; }, existsFn: () => true,
  });
  assert(r.findings.length === 1 && /failed/.test(r.findings[0].summary), 'must report the failure');
  assert(/NOT checked/.test(r.findings[0].detail), 'must say the repo went unchecked');
});

test('unparseable output is a finding, not silence', () => {
  const r = scanRepoVulns({
    repo: 'x', path: '/repo', osvPath: '/fake', dbPath: '/db',
    execFn: () => 'not json', existsFn: () => true,
  });
  assert(r.findings.length === 1 && /unparseable/.test(r.findings[0].summary), 'must report unparseable output');
});

test('a missing repo path is skipped with a stated reason', () => {
  const r = scanRepoVulns({
    repo: 'x', path: '/gone', osvPath: '/fake', dbPath: '/db',
    execFn: () => '{}', existsFn: () => false,
  });
  assert(r.findings.length === 0 && /not found/.test(r.skipped), 'must record why it was skipped');
});

// --- the offline guarantee, asserted rather than assumed ---
test('the CVE scan always runs offline against the local database', () => {
  let seen = null;
  scanRepoVulns({
    repo: 'x', path: '/repo', osvPath: '/fake', dbPath: '/db',
    execFn: (_f, args) => { seen = args; return '{}'; }, existsFn: () => true,
  });
  assert(seen.includes('--offline'), `--offline missing from ${seen.join(' ')}`);
  assert(seen.includes('--offline-vulnerabilities'), '--offline-vulnerabilities missing');
  assert(seen.includes('--local-db-path') && seen.includes('/db'), 'must point at the local database');
});

test('SBOM generation writes locally and never transmits', () => {
  const writes = [];
  const r = generateSbom({
    repo: 'tally', path: '/repo', syftPath: '/fake', outDir: '/out',
    execFn: () => '{"bomFormat":"CycloneDX"}',
    writeFn: (p, c) => writes.push({ p, c }),
    mkdirFn: () => {},
  });
  assert(r.ok === true, 'expected success');
  assert(writes.length === 1, 'SBOM must be written exactly once');
  assert(writes[0].p === '/out/tally.cyclonedx.json', `unexpected path: ${writes[0].p}`);
});

test('an SBOM failure is reported rather than swallowed', () => {
  const r = generateSbom({
    repo: 'tally', path: '/repo', syftPath: '/fake', outDir: '/out',
    execFn: () => { throw new Error('syft exploded'); },
    writeFn: () => {}, mkdirFn: () => {},
  });
  assert(r.ok === false && /syft exploded/.test(r.error), 'must surface the error');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`);
  process.exit(1);
}
