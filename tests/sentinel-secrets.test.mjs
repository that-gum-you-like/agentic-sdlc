#!/usr/bin/env node
/**
 * Tests for sentinel/secrets.mjs — credentials in working trees and history.
 * openspec: supply-chain-security-program (SCS-REQ-004)
 *
 * gitleaks is fully injected; these never shell out. The central test is the
 * invariant one: a planted secret must not survive into any output field.
 *
 * Run: node tests/sentinel-secrets.test.mjs
 */

import {
  redactFinding, fingerprintOf, runGitleaks, auditSecrets, scanRepoSecrets,
} from '../agents/sentinel/secrets.mjs';

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try { fn(); console.log('OK'); passed++; }
  catch (err) { console.log('FAIL'); failures.push({ name, err: err.message }); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// Assembled at runtime rather than written as a literal. A literal token here
// is a real secret-scanner hit on this very file — the first live run flagged
// tests/sentinel-secrets.test.mjs as containing a GitHub PAT. A security tool
// that fires on its own test fixtures burns exactly the attention it needs.
const PLANTED = ['ghp', '_', 'A1b2C3d4E5f6', 'G7h8I9j0K1l2', 'M3n4O5p6Q7r8'].join('');

/** A gitleaks record as emitted WITHOUT --redact — the worst case. */
const rawRecord = {
  RuleID: 'github-pat', File: '.env', StartLine: 1, Commit: 'abc123', Date: '2026-01-01',
  Author: 'someone', Fingerprint: 'abc123:.env:github-pat:1',
  Secret: PLANTED, Match: `GITHUB_TOKEN=${PLANTED}`, Line: `GITHUB_TOKEN=${PLANTED}`,
  Description: `token ${PLANTED}`, Message: `commit containing ${PLANTED}`,
};

/** Wire runGitleaks to a fake gitleaks that returns the given records. */
function fakeGitleaks(records, { throwStatus } = {}) {
  return {
    gitleaksPath: '/fake/gitleaks',
    execFn: () => { if (throwStatus !== undefined) { const e = new Error('boom'); e.status = throwStatus; throw e; } },
    readFn: () => JSON.stringify(records),
    tmpFn: () => '/tmp/fake',
    rmFn: () => {},
    existsFn: () => true,
  };
}

console.log('sentinel secrets tests');

// --- THE invariant ---
test('redactFinding removes every value-bearing field', () => {
  const safe = redactFinding(rawRecord);
  const dumped = JSON.stringify(safe);
  assert(!dumped.includes(PLANTED), `SECRET LEAKED: ${dumped}`);
  assert(safe.RuleID === 'github-pat' && safe.File === '.env', 'location metadata must be kept');
  for (const f of ['Secret', 'Match', 'Line', 'Description', 'Message']) {
    assert(!(f in safe), `${f} must be stripped`);
  }
});

test('no secret value reaches a finding, even unredacted from gitleaks', () => {
  const { findings } = auditSecrets([redactFinding(rawRecord)], { fingerprints: [] }, { repo: 'x' });
  const dumped = JSON.stringify(findings);
  assert(!dumped.includes(PLANTED), `SECRET LEAKED into findings: ${dumped}`);
  assert(findings.length === 1, 'the finding itself must still be reported');
});

test('evidence carries location only, never a value', () => {
  const { findings } = auditSecrets([redactFinding(rawRecord)], { fingerprints: [] }, { repo: 'x' });
  for (const e of findings[0].evidence) {
    assert(!String(e).includes(PLANTED), `evidence leaked the secret: ${e}`);
  }
  assert(findings[0].evidence.some(e => /\.env/.test(e)), 'evidence must point at the file');
});

// --- history is the point ---
test('a history finding says rotation is what matters', () => {
  const { findings } = auditSecrets([redactFinding(rawRecord)], { fingerprints: [] },
    { repo: 'x', location: 'history' });
  assert(/does NOT revoke/.test(findings[0].detail), 'must say deleting the file is not revoking');
  assert(/Rotat/i.test(findings[0].remedy), 'remedy must lead with rotation');
});

test('working-tree and history findings are distinguishable', () => {
  const wt = auditSecrets([redactFinding(rawRecord)], { fingerprints: [] }, { repo: 'x', location: 'working tree' });
  assert(/working tree/.test(wt.findings[0].summary), 'must name the location');
});

// --- baseline / drift ---
test('baselined fingerprints are suppressed', () => {
  const rec = redactFinding(rawRecord);
  const { findings } = auditSecrets([rec], { fingerprints: [fingerprintOf(rec)] }, { repo: 'ai-gateway' });
  assert(findings.length === 0, 'a known credential location must report drift only');
});

test('a NEW secret in a baselined repo still fires', () => {
  const known = redactFinding(rawRecord);
  const fresh = redactFinding({ ...rawRecord, File: 'new.env', Fingerprint: 'def:new.env:github-pat:1' });
  const { findings } = auditSecrets([known, fresh], { fingerprints: [fingerprintOf(known)] }, { repo: 'ai-gateway' });
  assert(findings.length === 1 && findings[0].subject === 'new.env',
    'drift must still be reported inside a baselined repo');
});

test('fingerprints are stable and returned for re-baselining', () => {
  const rec = redactFinding(rawRecord);
  const a = auditSecrets([rec], { fingerprints: [] }, { repo: 'x' });
  const b = auditSecrets([rec], { fingerprints: [] }, { repo: 'x' });
  assert(a.fingerprints[0] === b.fingerprints[0], 'fingerprint must be stable across runs');
});

test('fingerprintOf falls back when gitleaks omits one', () => {
  const fp = fingerprintOf({ File: 'a.js', RuleID: 'r', StartLine: 3 });
  assert(fp === 'worktree:a.js:r:3', `unexpected fallback fingerprint: ${fp}`);
});

// --- exit codes: the subtle one ---
test('exit status 1 means leaks found, not failure', () => {
  const r = runGitleaks('git', '/repo', fakeGitleaks([rawRecord], { throwStatus: 1 }));
  assert(r.ok === true, 'status 1 must be treated as a successful scan');
  assert(r.records.length === 1, 'records must still be parsed');
});

test('any other exit status is a real failure', () => {
  const r = runGitleaks('git', '/repo', fakeGitleaks([], { throwStatus: 2 }));
  assert(r.ok === false, 'status 2 must be a failure');
  assert(r.records.length === 0, 'no records on failure');
});

test('a scan failure becomes a finding, never a clean result', () => {
  const { findings } = scanRepoSecrets({
    repo: 'tally', path: '/repo', baseline: { fingerprints: [] },
    ...fakeGitleaks([], { throwStatus: 127 }),
  });
  assert(findings.length === 2, `expected a failure finding per mode, got ${findings.length}`);
  assert(findings.every(f => /secret scan failed/.test(f.summary)), 'must report the failure');
  assert(findings.every(f => /NOT checked/.test(f.detail)), 'must say the repo went unchecked');
});

test('an unparseable report is a failure, not silence', () => {
  const r = runGitleaks('git', '/repo', {
    gitleaksPath: '/fake', execFn: () => {}, readFn: () => '{not json',
    tmpFn: () => '/tmp/fake', rmFn: () => {}, existsFn: () => true,
  });
  assert(r.ok === false && /unparseable/.test(r.error), `expected a parse failure, got ${JSON.stringify(r)}`);
});

test('an empty report is a clean result', () => {
  const r = runGitleaks('dir', '/repo', {
    gitleaksPath: '/fake', execFn: () => {}, readFn: () => '',
    tmpFn: () => '/tmp/fake', rmFn: () => {}, existsFn: () => true,
  });
  assert(r.ok === true && r.records.length === 0, 'empty report means no findings');
});

test('scanRepoSecrets covers both the working tree and history', () => {
  const modes = [];
  const { findings } = scanRepoSecrets({
    repo: 'tally', path: '/repo', baseline: { fingerprints: [] },
    gitleaksPath: '/fake',
    execFn: (_f, args) => { modes.push(args[0]); },
    readFn: () => JSON.stringify([rawRecord]),
    tmpFn: () => '/tmp/fake', rmFn: () => {}, existsFn: () => true,
  });
  assert(modes.includes('dir') && modes.includes('git'),
    `both modes must run, got ${modes.join(',')}`);
  assert(findings.length === 2, 'a secret in both places is two findings');
});

test('gitleaks is always invoked with redaction on', () => {
  let seenArgs = null;
  runGitleaks('git', '/repo', {
    gitleaksPath: '/fake', execFn: (_f, args) => { seenArgs = args; },
    readFn: () => '[]', tmpFn: () => '/tmp/fake', rmFn: () => {}, existsFn: () => true,
  });
  assert(seenArgs.includes('--redact=100'), `--redact=100 missing from ${seenArgs.join(' ')}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`);
  process.exit(1);
}
