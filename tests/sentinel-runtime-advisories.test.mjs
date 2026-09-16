#!/usr/bin/env node
/**
 * Tests for sentinel/runtime-advisories.mjs — the languages, not the libraries.
 * openspec: supply-chain-security-program (SCS-REQ-043)
 *
 * Run: node tests/sentinel-runtime-advisories.test.mjs
 */

import {
  parseRuntimeVersion, cycleOf, detectRuntime, assessRuntime, scanRuntimes,
} from '../agents/sentinel/runtime-advisories.mjs';

let passed = 0, failed = 0;
const failures = [];
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function runAll() {
  for (const { name, fn } of queue) {
    process.stdout.write(`  ${name} ... `);
    try { await fn(); console.log('OK'); passed++; }
    catch (err) { console.log('FAIL'); failures.push({ name, err: err.message }); failed++; }
  }
}

const NOW = new Date('2026-09-15T00:00:00Z');
// Real shape from endoflife.date, including the cycle this host is actually on.
const NODE_CYCLES = [
  { cycle: '26', latest: '26.8.2', eol: '2029-04-30' },
  { cycle: '25', latest: '25.9.0', eol: '2026-06-01' },
  { cycle: '24', latest: '24.21.0', eol: '2028-04-30' },
];

console.log('sentinel runtime-advisories tests');

test('parses version strings from either runtime', () => {
  assert(parseRuntimeVersion('v25.6.1') === '25.6.1', 'node style');
  assert(parseRuntimeVersion('Python 3.12.3') === '3.12.3', 'python style');
  assert(parseRuntimeVersion('garbage') === null, 'unparseable → null');
});

test('cycle keys differ per product', () => {
  assert(cycleOf('25.6.1', 'nodejs') === '25', 'node cycles are major only');
  assert(cycleOf('3.12.3', 'python') === '3.12', 'python cycles are major.minor');
});

// --- the finding that prompted this scanner ---
test('an end-of-life runtime is HIGH', () => {
  const { findings } = assessRuntime(NODE_CYCLES, '25.6.1', {
    product: 'nodejs', label: 'Node.js', now: NOW,
  });
  const eol = findings.find(f => /past end-of-life/.test(f.summary));
  assert(eol, `expected an EOL finding, got ${JSON.stringify(findings.map(f => f.summary))}`);
  assert(eol.severity === 'high', `expected high, got ${eol.severity}`);
  assert(/never be patched/.test(eol.detail),
    'must explain that EOL is about FUTURE vulnerabilities going unpatched');
});

test('a supported runtime on the latest patch is silent', () => {
  const { findings } = assessRuntime(NODE_CYCLES, '26.8.2', {
    product: 'nodejs', label: 'Node.js', now: NOW,
  });
  assert(findings.length === 0, `expected silence, got ${JSON.stringify(findings.map(f => f.summary))}`);
});

test('a supported runtime behind on patches is MEDIUM', () => {
  const { findings } = assessRuntime(NODE_CYCLES, '26.1.0', {
    product: 'nodejs', label: 'Node.js', now: NOW,
  });
  assert(findings.length === 1 && findings[0].severity === 'medium',
    `expected one medium finding, got ${JSON.stringify(findings)}`);
  assert(/26\.8\.2/.test(findings[0].remedy), 'remedy must name the target version');
});

test('being behind inside an EOL cycle is escalated to HIGH', () => {
  const { findings } = assessRuntime(NODE_CYCLES, '25.6.1', {
    product: 'nodejs', label: 'Node.js', now: NOW,
  });
  const behind = findings.find(f => /behind the latest patch/.test(f.summary));
  assert(behind.severity === 'high', 'patch lag inside an EOL cycle must be high');
});

test('a future EOL date is not treated as expired', () => {
  const early = new Date('2026-01-01T00:00:00Z');
  const { findings } = assessRuntime(NODE_CYCLES, '25.9.0', {
    product: 'nodejs', label: 'Node.js', now: early,
  });
  assert(!findings.some(f => /end-of-life/.test(f.summary)), 'must not fire before the EOL date');
});

test('eol:true is honoured without a date', () => {
  const { findings } = assessRuntime([{ cycle: '9', latest: '9.0.0', eol: true }], '9.0.0', {
    product: 'nodejs', label: 'Node.js', now: NOW,
  });
  assert(findings.some(f => /end-of-life/.test(f.summary)), 'boolean eol must fire');
});

test('an unrecognised cycle is reported, not ignored', () => {
  const { findings } = assessRuntime(NODE_CYCLES, '99.0.0', {
    product: 'nodejs', label: 'Node.js', now: NOW,
  });
  assert(findings.length === 1 && /not a recognised release cycle/.test(findings[0].summary),
    'an unknown runtime must surface rather than pass silently');
});

test('an undetectable runtime is reported', async () => {
  const { findings } = await scanRuntimes({
    runtimes: [{ product: 'nodejs', label: 'Node.js', probe: ['nope', []] }],
    execFn: () => { throw new Error('ENOENT'); },
    fetchFn: async () => ({ ok: true, json: async () => NODE_CYCLES }),
    now: NOW,
  });
  assert(findings.some(f => /could not be detected/.test(f.summary)), 'must report an undetectable runtime');
});

test('an unreachable EOL feed is a finding, never silence', async () => {
  const { findings, evidence } = await scanRuntimes({
    runtimes: [{ product: 'nodejs', label: 'Node.js', probe: ['node', ['--version']] }],
    execFn: () => 'v25.6.1',
    fetchFn: async () => { throw new Error('ENETUNREACH'); },
    now: NOW,
  });
  assert(findings.some(f => /could not check Node\.js support status/.test(f.summary)),
    'feed failure must be reported');
  assert(findings.some(f => /NOT checked/.test(f.detail)), 'must say the runtime went unchecked');
  assert(evidence.nodejs.ok === false, 'evidence must record the failure');
});

test('end to end: detects the EOL runtime on this host shape', async () => {
  const { findings, evidence } = await scanRuntimes({
    runtimes: [{ product: 'nodejs', label: 'Node.js', probe: ['node', ['--version']] }],
    execFn: () => 'v25.6.1',
    fetchFn: async () => ({ ok: true, json: async () => NODE_CYCLES }),
    now: NOW,
  });
  assert(evidence.nodejs.detected === '25.6.1', 'must record the detected version');
  assert(evidence.nodejs.eol === '2026-06-01', 'must record the EOL date');
  assert(findings.some(f => f.severity === 'high' && /end-of-life/.test(f.summary)), 'must fire high');
});

await runAll();
console.log(`\n${passed} passed, ${failed} failed`);
if (passed + failed !== queue.length) { console.log('  ✗ harness miscount'); process.exit(1); }
if (failed > 0) {
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`);
  process.exit(1);
}
