/**
 * heartbeat.test.mjs — T-402 (liveness-heartbeat REQ-001).
 *
 * Acceptance covered:
 *   - a nominal fixture still produces a message
 *   - abnormal items appear first in the message body, before nominal counts
 *   - the message is a single message, not one per section
 *   - the unit test composes from fixtures without network access
 *
 * Run with:
 *   node --test agents/__tests__/heartbeat.test.mjs
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, utimesSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  composeMessage,
  collectTimers,
  collectDrainTicks,
  collectMergedPRs,
  collectApprovals,
  collectBlockedTasks,
  collectOpenKinds,
  collectSpend,
  collectHealth,
} from '../heartbeat.mjs';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function nominalReport(overrides = {}) {
  return {
    project: 'agentic-sdlc',
    date: '2026-09-02',
    timers: { expected: 12, alive: 12, missing: [] },
    drainTicks: 6,
    prsMerged: [{ number: 55, title: 'fix(daily-review): real headings' }],
    approvals: [],
    blockedTasks: [],
    kinds: { chore: 0, note: 0 },
    spend: { tokens: 12340, entries: 3 },
    health: { status: 'ok', detail: '' },
    unavailable: [],
    ...overrides,
  };
}

const tmpProjects = [];

function makeProject(files) {
  const dir = mkdtempSync(join(tmpdir(), 'heartbeat-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(resolve(p, '..'), { recursive: true });
    writeFileSync(p, content);
  }
  tmpProjects.push(dir);
  return dir;
}

function configFor(dir) {
  return {
    projectDir: dir,
    tasksDir: join(dir, 'tasks/queue'),
    costLogPath: join(dir, 'agents/cost-log.json'),
    notification: { approvalsDir: join(dir, 'pm/approvals') },
  };
}

after(() => {
  for (const d of tmpProjects) rmSync(d, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// composeMessage — REQ-001 acceptance
// ─────────────────────────────────────────────────────────────────────────────

describe('composeMessage (REQ-001)', () => {

  it('a nominal fixture still produces a message with every section', () => {
    const msg = composeMessage(nominalReport());
    assert.ok(msg.length > 0, 'message must not be empty');
    assert.match(msg, /📡 Daily heartbeat — agentic-sdlc — 2026-09-02/);
    for (const label of ['Timers:', 'Drain ticks (24h):', 'PRs merged (24h):',
      'Open approvals:', 'Blocked tasks:', 'Open chore/note:', 'Spend today:', 'Health:']) {
      assert.ok(msg.includes(label), `message must include ${label}`);
    }
    assert.ok(!msg.includes('⚠️'), 'all-nominal message must carry no abnormal marker');
  });

  it('abnormal items lead the message, before nominal counts', () => {
    const abnormalReport = nominalReport({
      timers: { expected: 12, alive: 11, missing: ['sdlc-sched-backlog-review.timer', 'sdlc-sched-dependency-audit.timer'] },
      blockedTasks: ['OS-business-os-3'],
      approvals: [{ id: 'appr-1', title: 'deploy the drain timer' }],
      health: { status: 'degraded', detail: '[degraded] queue: depth 55 exceeds 50' },
    });
    const msg = composeMessage(abnormalReport);

    const leadIdx = msg.indexOf('⚠️ Timers: 11/12 running');
    assert.ok(leadIdx >= 0, 'missing-timer section must be marked abnormal');
    assert.ok(msg.includes('Missing: sdlc-sched-backlog-review, sdlc-sched-dependency-audit'));
    assert.ok(msg.includes('Blocked tasks: 1'));
    assert.ok(msg.includes('Open approvals: 1'));
    assert.ok(msg.includes('Health: degraded'));

    for (const nominal of ['✅ Drain ticks (24h): 6', '✅ PRs merged (24h): 1', '✅ Spend today: 12340 tokens']) {
      assert.ok(msg.indexOf(nominal) > leadIdx, `"${nominal}" must appear after the abnormal lead`);
    }
  });

  it('produces a single message, not one per section', () => {
    const msg = composeMessage(nominalReport());
    assert.equal(typeof msg, 'string');
    assert.equal((msg.match(/📡 Daily heartbeat/g) || []).length, 1, 'exactly one message header');
    // The CLI composes once and sends once: a single sendNotification call.
    const src = readFileSync(resolve(MODULE_DIR, '../heartbeat.mjs'), 'utf8');
    assert.equal((src.match(/sendNotification\(/g) || []).length, 1);
  });

  it('marks an unavailable data source as abnormal instead of aborting', () => {
    const msg = composeMessage(nominalReport({ unavailable: ['timers'], timers: null }));
    assert.match(msg, /⚠️ Timers \(data unavailable\)/);
    assert.ok(msg.includes('✅ Drain ticks (24h): 6'), 'remaining sections still compose');
  });

  it('caps long abnormal lists with an overflow count', () => {
    const msg = composeMessage(nominalReport({ blockedTasks: ['T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6', 'T-7'] }));
    assert.match(msg, /Blocked tasks: 7/);
    assert.match(msg, /\+2 more tasks/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Collectors — fixture-driven with stubbed shells; no network access
// ─────────────────────────────────────────────────────────────────────────────

describe('collectors (fixture-driven, no network)', () => {

  it('collectTimers reads cron-schedule.json and reconciles with systemctl output', () => {
    const dir = makeProject({
      'agents/cron-schedule.json': JSON.stringify({
        schedules: [{ name: 'daily-review' }, { name: 'backlog-review' }],
      }),
    });
    const shell = () => 'NEXT  LEFT  LAST  PASSED  UNIT  ACTIVATES\n... sdlc-sched-daily-review.timer ...';
    const timers = collectTimers(configFor(dir), { shell });
    assert.equal(timers.expected, 2);
    assert.equal(timers.alive, 1);
    assert.deepEqual(timers.missing, ['sdlc-sched-backlog-review.timer']);
  });

  it('collectMergedPRs keeps only PRs merged within the last 24h', () => {
    const now = new Date('2026-09-02T12:00:00Z');
    const ghOut = JSON.stringify([
      { number: 55, title: 'fresh merge', mergedAt: '2026-09-02T10:00:00Z' },
      { number: 54, title: 'stale merge', mergedAt: '2026-08-30T12:00:00Z' },
    ]);
    const shell = () => ghOut;
    const prs = collectMergedPRs({ shell, now });
    assert.deepEqual(prs, [{ number: 55, title: 'fresh merge' }]);
  });

  it('collectDrainTicks counts log files touched within the last 24h only', () => {
    const now = new Date();
    const dir = makeProject({ 'pm/drain-logs/drain-fresh.log': 'x' });
    const stale = join(dir, 'pm/drain-logs/drain-stale.log');
    writeFileSync(stale, 'x');
    utimesSync(stale, new Date(now.getTime() - 48 * 3600 * 1000), new Date(now.getTime() - 48 * 3600 * 1000));
    assert.equal(collectDrainTicks(configFor(dir), now), 1);
  });

  it('collectDrainTicks returns 0 when the log dir is absent', () => {
    const dir = makeProject({});
    assert.equal(collectDrainTicks(configFor(dir), new Date()), 0);
  });

  it('collectApprovals keeps only open approvals', () => {
    const dir = makeProject({
      'pm/approvals/a-1.json': JSON.stringify({ id: 'a-1', title: 'deploy', status: 'pending' }),
      'pm/approvals/b-1.json': JSON.stringify({ id: 'b-1', title: 'old', status: 'approved' }),
      'pm/approvals/c-1.json': JSON.stringify({ id: 'c-1', title: 'gone', status: 'cancelled' }),
    });
    assert.deepEqual(collectApprovals(configFor(dir)).map(a => a.id), ['a-1']);
  });

  it('collectBlockedTasks and collectOpenKinds partition the queue by status and kind', () => {
    const task = (id, extra) => JSON.stringify({ id, title: id, status: 'pending', ...extra });
    const dir = makeProject({
      'tasks/queue/blocked.json': task('T-blocked', { blockedBy: ['T-gate'] }),
      'tasks/queue/chore.json': task('T-chore', { kind: 'chore' }),
      'tasks/queue/note.json': task('T-note', { kind: 'note' }),
      'tasks/queue/ready.json': task('T-ready'),                              // absent kind → code
      'tasks/queue/done.json': JSON.stringify({ id: 'T-done', title: 'done', status: 'completed', kind: 'note' }),
    });
    const config = configFor(dir);
    assert.deepEqual(collectBlockedTasks(config), ['T-blocked']);
    assert.deepEqual(collectOpenKinds(config), { chore: 1, note: 1 });
  });

  it('collectSpend sums only today\'s ledger entries', () => {
    const today = new Date().toISOString().slice(0, 10);
    const dir = makeProject({
      'agents/cost-log.json': JSON.stringify([
        { agent: 'sdlc-developer', totalTokens: 1000, timestamp: `${today}T10:00:00.000Z` },
        { agent: 'sdlc-reviewer', totalTokens: 2000, timestamp: `${today}T11:00:00.000Z` },
        { agent: 'sdlc-developer', totalTokens: 500, timestamp: '2026-08-30T10:00:00.000Z' },
      ]),
    });
    assert.deepEqual(collectSpend(configFor(dir), new Date()), { tokens: 3000, entries: 2 });
  });

  it('collectHealth parses the overall status line from health-check output', () => {
    const okShell = () => 'Health: ok (2026-09-02T10:00:00Z)\n  [ok] queue: depth 12\n  [ok] disk: 41% free';
    assert.deepEqual(collectHealth({ shell: okShell }), { status: 'ok', detail: '[ok] queue: depth 12' });

    const badShell = () => 'Health: degraded (2026-09-02T10:00:00Z)\n  [degraded] queue: depth 55 exceeds 50';
    assert.deepEqual(collectHealth({ shell: badShell }), { status: 'degraded', detail: '[degraded] queue: depth 55 exceeds 50' });

    assert.throws(() => collectHealth({ shell: () => 'garbage output' }), /unparseable/);
  });
});