#!/usr/bin/env node
/**
 * Heartbeat — one daily liveness message (liveness-heartbeat REQ-001).
 *
 * Reports timers running vs expected, drain ticks in the last 24h, PRs
 * merged, open deploy approvals, blocked tasks, open chore/note items,
 * today's spend, and health-check status. Abnormal items lead; nominal days
 * still send. Every collector is best-effort: a failing section is marked
 * "data unavailable" instead of aborting the send.
 *
 * Unit tests compose from fixtures with injected shell stubs — no network.
 *
 * Usage:
 *   node agents/heartbeat.mjs
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

import { loadConfig } from './load-config.mjs';
import { sendNotification } from './notify.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_CAP = 5;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readJsonIfExists(path) {
  return existsSync(path) ? readJson(path) : null;
}

function listTasks(config) {
  const dir = config.tasksDir || resolve(config.projectDir, 'tasks/queue');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.json') && !f.startsWith('.'))
    .map(f => {
      try { return readJson(resolve(dir, f)); } catch { return null; }
    })
    .filter(Boolean);
}

function todayIso(now) {
  return now.toISOString().slice(0, 10);
}

function runShell(argv, { shell } = {}) {
  const run = shell || (a => execFileSync(a[0], a.slice(1), { encoding: 'utf8', timeout: 30000 }));
  return run(argv);
}

// ---------------------------------------------------------------------------
// Collectors — each returns plain data or throws; main() degrades on throw.
// ---------------------------------------------------------------------------

export function collectTimers(config, { shell } = {}) {
  const schedule = readJson(resolve(config.projectDir, 'agents/cron-schedule.json'));
  const expected = (schedule.schedules || []).map(s => `sdlc-sched-${s.name}.timer`);
  const output = runShell(['systemctl', '--user', 'list-timers', '--all'], { shell });
  const missing = expected.filter(name => !output.includes(name));
  return { expected: expected.length, alive: expected.length - missing.length, missing };
}

export function collectDrainTicks(config, now = new Date()) {
  const dir = resolve(config.projectDir, 'pm/drain-logs');
  if (!existsSync(dir)) return 0;
  const cutoff = now.getTime() - DAY_MS;
  return readdirSync(dir).filter(f => f.endsWith('.log') && statSync(resolve(dir, f)).mtimeMs >= cutoff).length;
}

export function collectMergedPRs({ shell, now = new Date() } = {}) {
  const output = runShell(['gh', 'pr', 'list', '--state', 'merged', '--limit', '100', '--json', 'number,title,mergedAt'], { shell });
  const cutoff = now.getTime() - DAY_MS;
  return JSON.parse(output)
    .filter(p => new Date(p.mergedAt).getTime() >= cutoff)
    .map(p => ({ number: p.number, title: p.title }));
}

export function collectApprovals(config) {
  const dir = config.notification?.approvalsDir || resolve(config.projectDir, 'pm/approvals');
  if (!existsSync(dir)) return [];
  const closed = new Set(['approved', 'rejected', 'resolved', 'cancelled']);
  return readdirSync(dir)
    .filter(f => f.endsWith('.json') && !f.startsWith('.'))
    .map(f => {
      try { return readJson(resolve(dir, f)); } catch { return null; }
    })
    .filter(Boolean)
    .filter(a => !closed.has(a.status))
    .map(a => ({ id: a.id, title: a.title || '' }));
}

export function collectBlockedTasks(config) {
  return listTasks(config)
    .filter(t => t.status === 'pending' && Array.isArray(t.blockedBy) && t.blockedBy.length > 0)
    .map(t => t.id);
}

export function collectOpenKinds(config) {
  let chore = 0;
  let note = 0;
  for (const t of listTasks(config).filter(t => t.status === 'pending')) {
    if (t.kind === 'chore') chore++;
    else if (t.kind === 'note') note++;
  }
  return { chore, note };
}

export function collectSpend(config, now = new Date()) {
  const path = config.costLogPath || resolve(config.projectDir, 'agents/cost-log.json');
  const log = readJsonIfExists(path) || [];
  const day = todayIso(now);
  const today = log.filter(e => e.timestamp && e.timestamp.slice(0, 10) === day);
  return {
    tokens: today.reduce((sum, e) => sum + (e.totalTokens || 0), 0),
    entries: today.length,
  };
}

export function collectHealth({ shell } = {}) {
  const output = runShell(['node', resolve(__dirname, 'health-check.mjs')], { shell });
  const match = output.match(/^Health: (\w+)/m);
  if (!match) throw new Error('unparseable health-check output');
  const detail = output.split('\n').find(l => l.trim().startsWith('['))?.trim() || '';
  return { status: match[1], detail };
}

// ---------------------------------------------------------------------------
// Composition — pure; takes a report, returns ONE message string.
// ---------------------------------------------------------------------------

const SECTION_LABELS = {
  timers: 'Timers',
  drainTicks: 'Drain ticks (24h)',
  prsMerged: 'PRs merged (24h)',
  approvals: 'Open approvals',
  blockedTasks: 'Blocked tasks',
  kinds: 'Open chore/note',
  spend: 'Spend today',
  health: 'Health',
};

function cap(list, noun) {
  if (list.length <= LIST_CAP) return list;
  return [...list.slice(0, LIST_CAP), `+${list.length - LIST_CAP} more ${noun}`];
}

function lead(lines, abnormal) {
  return { lines, abnormal };
}

export function composeMessage(r) {
  const sections = [];
  for (const key of r.unavailable || []) {
    sections.push({ title: `${SECTION_LABELS[key] || key} (data unavailable)`, ...lead([], true) });
  }
  if (r.timers) {
    const missing = r.timers.missing || [];
    sections.push({
      title: `Timers: ${r.timers.alive}/${r.timers.expected} running`,
      ...lead(missing.length ? [`Missing: ${cap(missing.map(t => t.slice(0, -6))).join(', ')}`] : ['All scheduled timers alive'], missing.length > 0),
    });
  }
  if (r.drainTicks != null) {
    sections.push({
      title: `Drain ticks (24h): ${r.drainTicks}`,
      ...lead(r.drainTicks === 0 ? ['No drain tick in the last 24h'] : [], r.drainTicks === 0),
    });
  }
  if (r.prsMerged) {
    sections.push({
      title: `PRs merged (24h): ${r.prsMerged.length}`,
      ...lead(cap(r.prsMerged.map(p => `#${p.number} ${p.title}`), 'PRs'), false),
    });
  }
  if (r.approvals) {
    sections.push({
      title: `Open approvals: ${r.approvals.length}`,
      ...lead(cap(r.approvals.map(a => a.id), 'approvals'), r.approvals.length > 0),
    });
  }
  if (r.blockedTasks) {
    sections.push({
      title: `Blocked tasks: ${r.blockedTasks.length}`,
      ...lead(cap(r.blockedTasks, 'tasks'), r.blockedTasks.length > 0),
    });
  }
  if (r.kinds) {
    const open = r.kinds.chore + r.kinds.note;
    sections.push({
      title: `Open chore/note: ${open}`,
      ...lead([`${r.kinds.chore} chore, ${r.kinds.note} note`], open > 0),
    });
  }
  if (r.spend) {
    sections.push({
      title: `Spend today: ${r.spend.tokens} tokens (${r.spend.entries} entries)`,
      ...lead([], false),
    });
  }
  if (r.health) {
    sections.push({
      title: `Health: ${r.health.status}`,
      ...lead(r.health.detail ? [r.health.detail] : [], r.health.status !== 'ok'),
    });
  }
  const ordered = sections
    .map((s, i) => ({ ...s, i }))
    .sort((a, b) => (b.abnormal - a.abnormal) || (a.i - b.i));
  const body = ordered
    .map(s => `${s.abnormal ? '⚠️' : '✅'} ${s.title}${s.lines.length ? `\n  ${s.lines.join('\n  ')}` : ''}`)
    .join('\n\n');
  return `📡 Daily heartbeat — ${r.project} — ${r.date}\n\n${body}`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function __isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === __filename;
}

if (__isMainModule()) {
  const config = loadConfig();
  const now = new Date();
  const report = { project: config.name, date: todayIso(now), unavailable: [] };
  const collectors = [
    ['timers', () => collectTimers(config)],
    ['drainTicks', () => collectDrainTicks(config, now)],
    ['prsMerged', () => collectMergedPRs({ now })],
    ['approvals', () => collectApprovals(config)],
    ['blockedTasks', () => collectBlockedTasks(config)],
    ['kinds', () => collectOpenKinds(config)],
    ['spend', () => collectSpend(config, now)],
    ['health', () => collectHealth()],
  ];
  for (const [key, collect] of collectors) {
    try {
      report[key] = collect();
    } catch {
      report.unavailable.push(key);
    }
  }
  const message = composeMessage(report);
  const sent = sendNotification(message);
  if (!sent) {
    console.error(`❌ heartbeat delivery failed (provider: ${config.notification.provider})`);
    process.exit(1);
  }
  console.log('📡 heartbeat sent');
}