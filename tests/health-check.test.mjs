/**
 * health-check.mjs — egress check wiring (egress-preflight REQ-005).
 *
 * The egress probe is injected in every case, so these tests never touch the
 * network: they assert the severity mapping and its effect on the overall
 * rollup, which is the part that can actually regress.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { runHealthCheck, evaluateCycleCadence } from '../agents/health-check.mjs';

/** Build an egress probe that returns a fixed finding set. */
const probeReturning = (findings) => async () => ({ ok: !findings.some(f => f.severity === 'critical'), findings, checkedAt: new Date().toISOString() });

const egressCheck = (result) => result.checks.find(c => c.name === 'egress');

const BLACKHOLE = {
  id: 'ipv6-blackhole',
  severity: 'critical',
  summary: 'api.telegram.org resolves AAAA but this host has no IPv6 default route',
  detail: 'ENETUNREACH',
  remedy: 'Run `sudo bash scripts/network-preflight.sh` to fix IPv4 precedence and switch DNS to reliable resolvers.',
};

const RESOLVER_WARN = {
  id: 'dns-resolver-local',
  severity: 'warn',
  summary: 'Active DNS resolver(s) include a private (RFC1918) address: 192.168.0.1',
  detail: 'All active resolvers: 192.168.0.1',
  remedy: 'run scripts/network-preflight.sh',
};

test('a clean egress probe yields an ok egress check', async () => {
  const result = await runHealthCheck({ egress: probeReturning([]) });
  const egress = egressCheck(result);
  assert.ok(egress, 'egress check is present in the rollup');
  assert.equal(egress.status, 'ok');
});

test('a critical finding maps to down, names the finding id, and carries the remedy', async () => {
  const result = await runHealthCheck({ egress: probeReturning([BLACKHOLE]) });
  const egress = egressCheck(result);
  assert.equal(egress.status, 'down');
  assert.match(egress.detail, /ipv6-blackhole/);
  assert.match(egress.detail, /network-preflight\.sh/);
  // 'down' is the worst rank, so it must win the overall rollup regardless of
  // what the other checks reported on this host.
  assert.equal(result.status, 'down');
});

test('a warn finding maps to degraded, not down', async () => {
  const result = await runHealthCheck({ egress: probeReturning([RESOLVER_WARN]) });
  const egress = egressCheck(result);
  assert.equal(egress.status, 'degraded');
  assert.match(egress.detail, /dns-resolver-local/);
  assert.notEqual(result.status, 'down');
});

test('critical outranks warn when both are present', async () => {
  const result = await runHealthCheck({ egress: probeReturning([RESOLVER_WARN, BLACKHOLE]) });
  assert.equal(egressCheck(result).status, 'down');
});

test('duplicate finding ids across hosts are collapsed in the detail line', async () => {
  const result = await runHealthCheck({
    egress: probeReturning([BLACKHOLE, { ...BLACKHOLE, summary: 'openrouter.ai …' }]),
  });
  const ids = egressCheck(result).detail.split('—')[0];
  assert.equal(ids.match(/ipv6-blackhole/g).length, 1, `expected one id, got: ${ids}`);
});

test('a probe that throws degrades rather than taking down the health run', async () => {
  const result = await runHealthCheck({
    egress: async () => { throw new Error('resolver exploded'); },
  });
  const egress = egressCheck(result);
  // Crucially 'degraded', not 'down': a diagnostic that failed to run must stay
  // distinguishable from a network that is genuinely unreachable.
  assert.equal(egress.status, 'degraded');
  assert.match(egress.detail, /resolver exploded/);
  assert.ok(result.checks.length > 1, 'the other checks still ran');
});

test('a probe returning a malformed payload does not throw', async () => {
  for (const payload of [null, undefined, {}, { findings: 'nope' }]) {
    const result = await runHealthCheck({ egress: async () => payload });
    assert.equal(egressCheck(result).status, 'ok', `payload ${JSON.stringify(payload)}`);
  }
});

// ---------------------------------------------------------------------------
// evaluateCycleCadence — pure function tests
// ---------------------------------------------------------------------------

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Build a cycle history entry. */
function entry(type, daysAgo) {
  return { type, timestamp: new Date(NOW.getTime() - daysAgo * ONE_DAY_MS).toISOString(), success: true };
}

/** Shorthand to look up one type's result from evaluateCycleCadence. */
const byType = (results, type) => results.find(r => r.type === type);

// Pin "now" so the tests are deterministic.
const NOW = new Date('2026-11-03T12:00:00Z');

test('evaluateCycleCadence: weekly entry 9 days old is overdue weekly', () => {
  const history = [entry('daily', 1), entry('weekly', 9)];
  const results = evaluateCycleCadence(history, NOW);
  const w = byType(results, 'weekly');
  assert.equal(w.status, 'degraded');
  assert.match(w.detail, /overdue.*9 days since last weekly/);
});

test('evaluateCycleCadence: all fresh entries are ok', () => {
  const history = [
    entry('daily', 0),
    entry('weekly', 5),
    entry('monthly', 20),
  ];
  const results = evaluateCycleCadence(history, NOW);
  for (const r of results) {
    assert.equal(r.status, 'ok', `${r.type} should be ok, got ${r.status}`);
  }
});

test('evaluateCycleCadence: zero monthly entries, oldest entry < 32d is not flagged', () => {
  const history = [entry('daily', 1), entry('weekly', 1)];
  // oldest entry is 1 day old, monthly limit is 32 — not flagged
  const results = evaluateCycleCadence(history, NOW);
  assert.equal(byType(results, 'monthly').status, 'ok');
  assert.match(byType(results, 'monthly').detail, /never-run/);
});

test('evaluateCycleCadence: zero monthly entries, oldest entry > 32d is degraded', () => {
  const history = [entry('daily', 40)];
  // oldest entry is 40 days old, monthly limit is 32 — flagged
  const results = evaluateCycleCadence(history, NOW);
  assert.equal(byType(results, 'monthly').status, 'degraded');
  assert.match(byType(results, 'monthly').detail, /never-run.*40 days old/);
});

test('evaluateCycleCadence: empty history yields all ok', () => {
  const results = evaluateCycleCadence([], NOW);
  assert.equal(results.length, 3);
  for (const r of results) {
    assert.equal(r.status, 'ok');
    assert.match(r.detail, /never-run/);
  }
});

test('evaluateCycleCadence: accepts string now param', () => {
  const history = [entry('daily', 3)];
  const results = evaluateCycleCadence(history, '2026-11-03T12:00:00Z');
  // daily limit is 2, so 3 days is overdue
  assert.equal(byType(results, 'daily').status, 'degraded');
});

test('evaluateCycleCadence: custom limits override defaults', () => {
  const history = [entry('daily', 3)];
  // Override daily to 5 — 3 days is fine
  const results = evaluateCycleCadence(history, NOW, { daily: 5 });
  assert.equal(byType(results, 'daily').status, 'ok');
});

test('evaluateCycleCadence: only one type with entries does not break others', () => {
  const history = [entry('daily', 0), entry('daily', 1)];
  const results = evaluateCycleCadence(history, NOW);
  assert.equal(byType(results, 'daily').status, 'ok');
  assert.match(byType(results, 'weekly').detail, /never-run/);
  assert.match(byType(results, 'monthly').detail, /never-run/);
});
