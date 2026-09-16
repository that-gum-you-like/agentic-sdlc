#!/usr/bin/env node
/**
 * Tests for sentinel/lockfile-diff.mjs — lockfile changes as security diffs.
 *
 * openspec: supply-chain-security-program (SCS-REQ-001)
 *
 * Every test drives KNOWN-BAD fixtures. A scanner that has only ever been shown
 * not to fire is not tested.
 *
 * Run: node tests/sentinel-lockfile-diff.test.mjs
 */

import { parseLockfile, diffLockfiles, scanRepo } from '../agents/sentinel/lockfile-diff.mjs';

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try { fn(); console.log('OK'); passed++; }
  catch (err) { console.log('FAIL'); failures.push({ name, err: err.message }); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

/** Build a v3 lockfile with the given node_modules entries. */
function lock(entries) {
  return JSON.stringify({
    name: 'fixture', lockfileVersion: 3,
    packages: { '': { name: 'fixture' }, ...entries },
  });
}
const ok = (version, integrity = 'sha512-GOOD') => ({
  version, integrity, resolved: `https://registry.npmjs.org/x/-/x-${version}.tgz`,
});

console.log('sentinel lockfile-diff tests');

test('parses lockfile v3 and strips the root entry', () => {
  const m = parseLockfile(lock({ 'node_modules/left-pad': ok('1.0.0') }));
  assert(m.size === 1, `expected 1 entry, got ${m.size}`);
  assert(m.get('node_modules/left-pad').name === 'left-pad', 'name not derived');
});

test('parses lockfile v1 nested dependencies', () => {
  const v1 = JSON.stringify({
    lockfileVersion: 1,
    dependencies: { foo: { version: '1.0.0', dependencies: { bar: { version: '2.0.0' } } } },
  });
  const m = parseLockfile(v1);
  assert(m.has('node_modules/foo'), 'missing top-level dep');
  assert(m.has('node_modules/foo/node_modules/bar'), 'missing nested dep');
});

test('unparseable lockfile returns null rather than throwing', () => {
  assert(parseLockfile('{not json') === null, 'expected null');
  assert(parseLockfile('') === null, 'expected null for empty');
});

// --- the finding that has no innocent explanation ---
test('flags integrity change under an unchanged version', () => {
  const prev = parseLockfile(lock({ 'node_modules/next': ok('15.5.19', 'sha512-ORIGINAL') }));
  const next = parseLockfile(lock({ 'node_modules/next': ok('15.5.19', 'sha512-SWAPPED') }));
  const { findings } = diffLockfiles(prev, next, { repo: 'tally' });
  const f = findings.find(x => /integrity hash changed/.test(x.summary));
  assert(f, `expected an integrity finding, got ${JSON.stringify(findings)}`);
  assert(f.severity === 'high', `expected high, got ${f.severity}`);
  assert(f.evidence.some(e => /ORIGINAL/.test(e)) && f.evidence.some(e => /SWAPPED/.test(e)),
    'must cite both hashes as evidence');
});

test('does not flag an integrity change that accompanies a version change', () => {
  const prev = parseLockfile(lock({ 'node_modules/next': ok('15.5.19', 'sha512-A') }));
  const next = parseLockfile(lock({ 'node_modules/next': ok('15.5.20', 'sha512-B') }));
  const { findings } = diffLockfiles(prev, next, { repo: 'tally', packageJsonChanged: true });
  assert(!findings.some(x => /integrity hash changed/.test(x.summary)),
    'a new version legitimately has a new hash');
});

test('flags a resolved URL off the official registry', () => {
  const prev = parseLockfile(lock({ 'node_modules/x': ok('1.0.0') }));
  const next = parseLockfile(lock({
    'node_modules/x': { version: '1.0.0', integrity: 'sha512-GOOD', resolved: 'https://evil.example.com/x.tgz' },
  }));
  const { findings } = diffLockfiles(prev, next, { repo: 'tally' });
  const f = findings.find(x => /off the official registry/.test(x.summary));
  assert(f && f.severity === 'high', `expected a high registry finding, got ${JSON.stringify(findings)}`);
});

test('flags a package that newly gained an install script', () => {
  const prev = parseLockfile(lock({ 'node_modules/x': ok('1.0.0') }));
  const next = parseLockfile(lock({ 'node_modules/x': { ...ok('1.0.0'), hasInstallScript: true } }));
  const { findings } = diffLockfiles(prev, next, { repo: 'tally' });
  const f = findings.find(x => /gained an install script/.test(x.summary));
  assert(f && f.severity === 'high', `expected a high install-script finding, got ${JSON.stringify(findings)}`);
});

test('flags a NEW dependency that ships an install script', () => {
  const prev = parseLockfile(lock({}));
  const next = parseLockfile(lock({ 'node_modules/sketchy': { ...ok('1.0.0'), hasInstallScript: true } }));
  const { findings } = diffLockfiles(prev, next, { repo: 'tally' });
  assert(findings.some(x => /runs an install script/.test(x.summary)), 'new install-script dep must fire');
});

test('flags a major jump with no package.json change', () => {
  const prev = parseLockfile(lock({ 'node_modules/x': ok('1.9.0') }));
  const next = parseLockfile(lock({ 'node_modules/x': ok('2.0.0') }));
  const { findings } = diffLockfiles(prev, next, { repo: 'tally', packageJsonChanged: false });
  const f = findings.find(x => /jumped a major version/.test(x.summary));
  assert(f && f.severity === 'medium', `expected a medium major-jump finding, got ${JSON.stringify(findings)}`);
});

test('a major jump WITH a package.json change is not flagged', () => {
  const prev = parseLockfile(lock({ 'node_modules/x': ok('1.9.0') }));
  const next = parseLockfile(lock({ 'node_modules/x': ok('2.0.0') }));
  const { findings } = diffLockfiles(prev, next, { repo: 'tally', packageJsonChanged: true });
  assert(!findings.some(x => /jumped a major version/.test(x.summary)), 'an intentional upgrade is not a finding');
});

// --- first run must not drown the reader ---
test('first run records a baseline instead of mass findings', () => {
  const next = parseLockfile(lock(Object.fromEntries(
    Array.from({ length: 500 }, (_, i) => [`node_modules/p${i}`, { ...ok('1.0.0'), hasInstallScript: true }]),
  )));
  const { findings, added, baseline } = diffLockfiles(null, next, { repo: 'tally' });
  assert(baseline === true, 'expected a baseline run');
  assert(findings.length === 0, `expected 0 findings on baseline, got ${findings.length}`);
  assert(added.length === 500, `expected 500 recorded packages, got ${added.length}`);
});

test('a clean diff produces no findings', () => {
  const prev = parseLockfile(lock({ 'node_modules/x': ok('1.0.0') }));
  const next = parseLockfile(lock({ 'node_modules/x': ok('1.0.0') }));
  const { findings } = diffLockfiles(prev, next, { repo: 'tally' });
  assert(findings.length === 0, `expected silence, got ${JSON.stringify(findings)}`);
});

test('every finding carries repo, evidence, and remedy', () => {
  const prev = parseLockfile(lock({ 'node_modules/x': ok('1.0.0', 'sha512-A') }));
  const next = parseLockfile(lock({ 'node_modules/x': { ...ok('1.0.0', 'sha512-B'), hasInstallScript: true } }));
  const { findings } = diffLockfiles(prev, next, { repo: 'tally' });
  assert(findings.length >= 2, 'expected multiple findings');
  for (const f of findings) {
    assert(f.repo === 'tally', 'finding must name its repo');
    assert(Array.isArray(f.evidence) && f.evidence.length, `no evidence: ${f.summary}`);
    assert(f.remedy && f.remedy.length, `no remedy: ${f.summary}`);
    assert(f.scanner === 'lockfile-diff', 'finding must name its scanner');
  }
});

// --- repo-level wiring, git fully injected ---
test('scanRepo treats a missing prior lockfile as a baseline', () => {
  const execFn = (args) => {
    if (args[0] === 'rev-parse') return 'abc123\n';
    if (args[0] === 'show' && args[1].startsWith('HEAD:')) return lock({ 'node_modules/x': ok('1.0.0') });
    if (args[0] === 'show') throw new Error('does not exist');
    if (args[0] === 'diff') return '';
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
  const r = scanRepo({ repo: 'tally', path: '/x', sinceCommit: 'old', execFn });
  assert(r.baseline === true, 'expected baseline when the old lockfile is absent');
  assert(r.head === 'abc123', `expected head recorded, got ${r.head}`);
});

test('scanRepo detects an integrity swap across commits', () => {
  const execFn = (args) => {
    if (args[0] === 'rev-parse') return 'head1\n';
    if (args[0] === 'show' && args[1] === 'HEAD:package-lock.json') return lock({ 'node_modules/x': ok('1.0.0', 'sha512-NEW') });
    if (args[0] === 'show' && args[1] === 'old:package-lock.json') return lock({ 'node_modules/x': ok('1.0.0', 'sha512-OLD') });
    if (args[0] === 'diff') return '';
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
  const r = scanRepo({ repo: 'tally', path: '/x', sinceCommit: 'old', execFn });
  assert(r.findings.some(f => /integrity hash changed/.test(f.summary)), 'must detect the swap through git');
});

test('scanRepo on a non-git path does not throw', () => {
  const execFn = () => { throw new Error('not a git repository'); };
  const r = scanRepo({ repo: 'x', path: '/nope', sinceCommit: 'old', execFn });
  assert(Array.isArray(r.findings), 'must still return a result');
  assert(r.head === null, 'head should be null');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`);
  process.exit(1);
}
