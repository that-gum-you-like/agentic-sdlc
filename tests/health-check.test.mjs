/**
 * health-check.mjs — egress check wiring (egress-preflight REQ-005).
 *
 * The egress probe is injected in every case, so these tests never touch the
 * network: they assert the severity mapping and its effect on the overall
 * rollup, which is the part that can actually regress.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { runHealthCheck, evaluateCycleCadence, checkCycles } from '../agents/health-check.mjs';

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

// ---------------------------------------------------------------------------
// checkCycles — process erosion (CV-REQ-012)
// ---------------------------------------------------------------------------

const cyclesCheck = (result) => result.checks.find(c => c.name === 'cycles');

/** Make a throwaway project dir; cleanup is registered by the caller. */
function tempProject() {
  return mkdtempSync(join(tmpdir(), 'health-cycles-'));
}

test('a stale weekly entry surfaces as process erosion in the rollup', async () => {
  const history = [entry('daily', 0), entry('weekly', 9), entry('monthly', 10)];
  const result = await runHealthCheck({
    egress: probeReturning([]),
    cycleHistory: history,
    now: NOW,
  });

  const cycles = cyclesCheck(result);
  assert.ok(cycles, 'cycles check is present in the rollup');
  assert.equal(cycles.status, 'degraded');
  assert.match(cycles.detail, /process-erosion: weekly overdue/);
  // 'degraded' must propagate to the overall rollup, not get swallowed.
  assert.notEqual(result.status, 'ok');
});

test('fresh history for every cycle type is ok', async () => {
  const history = [entry('daily', 1), entry('weekly', 3), entry('monthly', 10)];
  const result = await runHealthCheck({
    egress: probeReturning([]),
    cycleHistory: history,
    now: NOW,
  });

  const cycles = cyclesCheck(result);
  assert.equal(cycles.status, 'ok');
  assert.equal(cycles.name, 'cycles');
});

test('a missing history file degrades with no cycle history and never throws', () => {
  const dir = tempProject();
  try {
    const cycles = checkCycles({ projectDir: dir }, undefined, NOW);
    assert.equal(cycles.name, 'cycles');
    assert.equal(cycles.status, 'degraded');
    assert.equal(cycles.detail, 'no cycle history');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkCycles reads pm/cycle-history.json when no history is injected', () => {
  const dir = tempProject();
  try {
    mkdirSync(join(dir, 'pm'), { recursive: true });
    writeFileSync(
      join(dir, 'pm', 'cycle-history.json'),
      JSON.stringify([entry('daily', 0), entry('weekly', 0), entry('monthly', 0)]),
    );
    const cycles = checkCycles({ projectDir: dir }, undefined, NOW);
    assert.equal(cycles.status, 'ok');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unparseable history file degrades instead of throwing', () => {
  const dir = tempProject();
  try {
    mkdirSync(join(dir, 'pm'), { recursive: true });
    writeFileSync(join(dir, 'pm', 'cycle-history.json'), '{not json');
    const cycles = checkCycles({ projectDir: dir }, undefined, NOW);
    assert.equal(cycles.status, 'degraded');
    assert.match(cycles.detail, /no cycle history/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a never-run type is named as never-run, not as overdue', () => {
  // Only daily entries, 40 days old: monthly has no entries and the oldest
  // entry is past its 32-day limit, so it is flagged as never-run.
  const cycles = checkCycles({ projectDir: '/nonexistent' }, [entry('daily', 40)], NOW);
  assert.equal(cycles.status, 'degraded');
  assert.match(cycles.detail, /monthly never-run/);
  assert.doesNotMatch(cycles.detail, /monthly overdue/);
});

test('malformed history entries are ignored rather than crashing the check', () => {
  for (const history of [[], [null, 'nope', { type: 'weekly' }], {}, 'nope', 42]) {
    const cycles = checkCycles({ projectDir: '/nonexistent' }, history, NOW);
    assert.equal(cycles.name, 'cycles', `history ${JSON.stringify(history)}`);
    assert.equal(cycles.status, 'ok', `history ${JSON.stringify(history)}`);
  }
});

// --- bug 2026-11-09: the cycles record '<kind>-review', the checker matched '<kind>' ---

test('evaluateCycleCadence: entries as the cycles actually write them (daily-review, weekly-review, monthly-review) count', () => {
  const history = [entry('daily-review', 0), entry('weekly-review', 5), entry('monthly-review', 20), entry('daily-review', 90)];
  for (const r of evaluateCycleCadence(history, NOW)) assert.equal(r.status, 'ok', `${r.type}: ${r.detail}`);
});

test('checkCycles: live-shaped history with no monthly run reports ONLY monthly as never-run', () => {
  const history = [entry('daily-review', 0), entry('weekly-review', 1), entry('daily-review', 120)];
  const res = checkCycles({}, history, NOW);
  assert.equal(res.status, 'degraded');
  assert.equal(res.detail, 'process-erosion: monthly never-run');
});

import { checkHermesContainers, checkHermesSandboxConfig, checkCheckoutHygiene } from '../agents/health-check.mjs';

test('new exposed container alerts once', () => {
  const sent = [];
  const seen = new Set();
  const notify = (key, trigger, msg) => { if (seen.has(key)) return false; seen.add(key); sent.push({ key, trigger, msg }); return true; };
  const mk = (ids) => ({ home: '/home/t', checkouts: [], run: () => ids.map(id => ({ Id: id.padEnd(64, '0'), Name: `/hermes-${id}`, Mounts: [{ Source: '/home/t', Destination: '/workspace', RW: true }] })) });
  const a = checkHermesContainers({ mounts: mk(['aaa']), notify });
  checkHermesContainers({ mounts: mk(['aaa']), notify });
  assert.equal(a.status, 'down');
  assert.equal(sent.length, 1);
  checkHermesContainers({ mounts: mk(['aaa', 'bbb']), notify });
  assert.equal(sent.length, 2);
  const clean = checkHermesContainers({ mounts: { run: () => [] }, notify });
  assert.equal(clean.status, 'ok');
  assert.equal(sent.length, 2);
});

test('hermes sandbox config check is down on exposure, ok when config missing', () => {
  assert.equal(checkHermesSandboxConfig({ configPath: '/nonexistent/c.yaml' }).status, 'ok');
});

// RS-302 / RS-REQ-041
test('new foreign path alerts once; unchanged set is silent; a new path re-alerts', () => {
  const sent = []; const seen = new Set();
  const notify = (key, trigger, msg) => { if (seen.has(key)) return false; seen.add(key); sent.push({ key, trigger, msg }); return true; };
  const mk = (...paths) => () => ({ foreign: paths.map(p => ({ path: p, owner: 'root', command: `sudo chown -R u:u ${p}` })), unreadable: [], stateDir: null });
  const a = checkCheckoutHygiene({ repo: '/r', stateDir: '/s', run: mk('agents/secrets.mjs'), notify });
  checkCheckoutHygiene({ repo: '/r', stateDir: '/s', run: mk('agents/secrets.mjs'), notify });
  assert.equal(a.status, 'down');
  assert.match(a.detail, /agents\/secrets\.mjs/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].trigger, 'blocker');
  checkCheckoutHygiene({ repo: '/r', stateDir: '/s', run: mk('agents/secrets.mjs', 'tasks/completed'), notify });
  assert.equal(sent.length, 2);
});

test('clean checkout is ok and silent; foreign state dir counts; doctor crash is degraded', () => {
  const sent = [];
  const notify = (...a) => { sent.push(a); return true; };
  const clean = checkCheckoutHygiene({ repo: '/r', stateDir: '/s', run: () => ({ foreign: [], unreadable: [], stateDir: { path: '/s', ok: true } }), notify });
  assert.equal(clean.status, 'ok');
  assert.equal(sent.length, 0);
  const st = checkCheckoutHygiene({ repo: '/r', stateDir: '/s', run: () => ({ foreign: [], unreadable: [], stateDir: { path: '/s', ok: false, command: 'sudo chown -R u:u /s' } }), notify });
  assert.equal(st.status, 'down');
  assert.equal(sent.length, 1);
  assert.equal(checkCheckoutHygiene({ run: () => { throw new Error('boom'); }, notify }).status, 'degraded');
});

import { checkQueue } from '../agents/health-check.mjs';

test('checkQueue counts only open tasks, not completed/done/archived ones kept in place (RS-101)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hc-queue-'));
  try {
    for (let i = 0; i < 60; i++) writeFileSync(join(dir, `C-${i}.json`), JSON.stringify({ id: `C-${i}`, status: 'completed' }));
    writeFileSync(join(dir, 'D-1.json'), JSON.stringify({ id: 'D-1', status: 'done' }));
    writeFileSync(join(dir, 'A-1.json'), JSON.stringify({ id: 'A-1', status: 'pending', archived_at: '2026-11-12' }));
    writeFileSync(join(dir, 'P-1.json'), JSON.stringify({ id: 'P-1', status: 'pending' }));
    writeFileSync(join(dir, 'B-1.json'), JSON.stringify({ id: 'B-1', status: 'blocked' }));
    writeFileSync(join(dir, 'bad.json'), '{not json');
    const r = checkQueue({ tasksDir: dir });
    assert.equal(r.status, 'ok');
    assert.match(r.detail, /queue depth 3\b/); // pending + blocked + unparseable
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('checkQueue still degrades when open tasks exceed the threshold', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hc-queue-'));
  try {
    for (let i = 0; i < 55; i++) writeFileSync(join(dir, `P-${i}.json`), JSON.stringify({ id: `P-${i}`, status: 'pending' }));
    assert.equal(checkQueue({ tasksDir: dir }).status, 'degraded');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
