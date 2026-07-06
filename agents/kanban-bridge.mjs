#!/usr/bin/env node
/**
 * kanban-bridge.mjs — sync the SDLC file-based backlog into the Hermes kanban
 * board that `hermes dashboard` reads, so the command center shows real work.
 *
 * Idempotent (keyed on SDLC task id via --idempotency-key), zero-dep, tested.
 * Realizes the "one ledger, many interfaces" design in docs/hermes-backlog-bridge.md.
 *
 *   node agents/kanban-bridge.mjs sync [--reconcile]   # push tasks -> board
 *   node agents/kanban-bridge.mjs status               # dry-run diff, no writes
 *
 * Exports (for tests): mapStatus, mapPriority, runKanban, readTasks, sync, statusReport
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_DIR = process.env.SDLC_PROJECT_DIR || resolve(dirname(__filename), '..');
const QUEUE_DIR = join(PROJECT_DIR, 'tasks', 'queue');
const COMPLETED_DIR = join(PROJECT_DIR, 'tasks', 'completed');
const PM_DIR = join(PROJECT_DIR, 'pm');
const LINKS_PATH = join(PM_DIR, 'kanban-links.json');

// SDLC status -> kanban lane. `verb` is the CLI verb used to move an existing
// card into that lane; `initial` is the --initial-status value valid at create.
export function mapStatus(sdlcStatus) {
  switch (String(sdlcStatus || '').toLowerCase()) {
    case 'completed':
    case 'done':        return { lane: 'done', verb: 'complete', initial: null };
    case 'blocked':     return { lane: 'blocked', verb: 'block', initial: 'blocked' };
    case 'in_progress':
    case 'running':     return { lane: 'running', verb: null, initial: 'running' };
    default:            return { lane: 'todo', verb: null, initial: null }; // pending/ready
  }
}

// SDLC priority label -> kanban int tiebreaker (higher = more urgent).
export function mapPriority(p) {
  switch (String(p || '').toUpperCase()) {
    case 'CRITICAL': return 300;
    case 'HIGH':     return 100;
    case 'MEDIUM':
    case 'MED':      return 50;
    case 'LOW':      return 10;
    default:         return 0;
  }
}

/** Shell out to `hermes kanban`. Fails clean if the binary is missing. */
export function runKanban(args, { json = false } = {}) {
  const r = spawnSync('hermes', ['kanban', ...args], { encoding: 'utf8' });
  if (r.error && r.error.code === 'ENOENT') {
    throw new Error("hermes binary not found on PATH — cannot reach the kanban board");
  }
  if (r.status !== 0) {
    throw new Error(`hermes kanban ${args[0]} failed: ${(r.stderr || r.stdout || '').trim().slice(0, 300)}`);
  }
  const out = (r.stdout || '').trim();
  if (!json) return out;
  try { return JSON.parse(out); }
  catch { throw new Error(`hermes kanban ${args[0]} did not return JSON: ${out.slice(0, 200)}`); }
}

function kanbanId(created) {
  return created && (created.id || (created.task && created.task.id)) || null;
}

/** Read all SDLC tasks from queue/ (and completed/ if present). */
export function readTasks() {
  const tasks = [];
  for (const dir of [QUEUE_DIR, COMPLETED_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const t = JSON.parse(fs.readFileSync(join(dir, f), 'utf8'));
        if (t && t.id) tasks.push({ ...t, _dir: dir, _file: f });
      } catch { /* skip malformed task file */ }
    }
  }
  return tasks;
}

function loadLinks() {
  try { return JSON.parse(fs.readFileSync(LINKS_PATH, 'utf8')); } catch { return {}; }
}
function saveLinks(links) {
  fs.mkdirSync(PM_DIR, { recursive: true });
  fs.writeFileSync(LINKS_PATH, JSON.stringify(links, null, 2) + '\n');
}

/** Upsert one task, then reconcile its lane only if it differs. */
function syncTask(task, links, boardById) {
  const args = ['create', task.title || task.id, '--idempotency-key', task.id, '--json'];
  if (task.description) args.push('--body', String(task.description).slice(0, 4000));
  if (task.assignee) args.push('--assignee', String(task.assignee));
  const prio = mapPriority(task.priority);
  if (prio) args.push('--priority', String(prio));
  const target = mapStatus(task.status);
  if (target.initial) args.push('--initial-status', target.initial);

  const created = runKanban(args, { json: true });
  const kid = kanbanId(created);
  if (!kid) throw new Error(`no kanban id returned for ${task.id}`);
  links[task.id] = kid;

  const currentLane = boardById[kid] && boardById[kid].status;
  let moved = false;
  if (currentLane !== target.lane && target.verb) {
    if (target.verb === 'complete') runKanban(['complete', kid]);
    else if (target.verb === 'block') runKanban(['block', kid, 'blocked in SDLC ledger']);
    moved = true;
  }
  return { id: task.id, kid, lane: target.lane, created: !currentLane, moved };
}

/** Best-effort reverse: reflect kanban done/blocked back into task JSON status only. */
function reverseReconcile(links, boardById) {
  const changed = [];
  const byKid = Object.fromEntries(Object.entries(links).map(([sid, kid]) => [kid, sid]));
  for (const [kid, card] of Object.entries(boardById)) {
    const sid = byKid[kid];
    if (!sid) continue;
    const lane = card.status;
    let newStatus = null;
    if (lane === 'done') newStatus = 'completed';
    else if (lane === 'blocked') newStatus = 'blocked';
    if (!newStatus) continue;
    for (const dir of [QUEUE_DIR, COMPLETED_DIR]) {
      const p = join(dir, `${sid}.json`);
      if (!fs.existsSync(p)) continue;
      const t = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (t.status === newStatus) break;
      t.status = newStatus;
      if (newStatus === 'completed' && !t.completed_at) t.completed_at = new Date(card.completed_at ? card.completed_at * 1000 : Date.now()).toISOString();
      fs.writeFileSync(p, JSON.stringify(t, null, 2) + '\n');
      changed.push({ id: sid, status: newStatus });
      break;
    }
  }
  return changed;
}

function boardMap() {
  const cards = runKanban(['list', '--json'], { json: true }) || [];
  return Object.fromEntries(cards.map((c) => [c.id, c]));
}

export function sync({ reconcile = false } = {}) {
  const tasks = readTasks();
  const links = loadLinks();
  const boardById = boardMap();
  const results = tasks.map((t) => syncTask(t, links, boardById));
  saveLinks(links);
  let reversed = [];
  if (reconcile) reversed = reverseReconcile(links, boardMap());
  return { total: tasks.length, created: results.filter((r) => r.created).length, moved: results.filter((r) => r.moved).length, reversed };
}

export function statusReport() {
  const tasks = readTasks();
  const links = loadLinks();
  const boardById = boardMap();
  const laneCounts = {};
  let toCreate = 0, toUpdate = 0;
  for (const t of tasks) {
    const target = mapStatus(t.status);
    laneCounts[target.lane] = (laneCounts[target.lane] || 0) + 1;
    const kid = links[t.id];
    if (!kid || !boardById[kid]) toCreate++;
    else if (boardById[kid].status !== target.lane) toUpdate++;
  }
  return { total: tasks.length, toCreate, toUpdate, inSync: tasks.length - toCreate - toUpdate, laneCounts };
}

const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;
if (__isMainModule) {
  const cmd = process.argv[2] || 'status';
  try {
    if (cmd === 'sync') {
      const r = sync({ reconcile: process.argv.includes('--reconcile') });
      console.log(`✅ synced ${r.total} tasks → kanban (${r.created} created, ${r.moved} moved${r.reversed.length ? `, ${r.reversed.length} reconciled back` : ''})`);
    } else if (cmd === 'status') {
      const r = statusReport();
      console.log(`📋 ${r.total} SDLC tasks · to-create ${r.toCreate} · to-update ${r.toUpdate} · in-sync ${r.inSync}`);
      console.log('   lanes: ' + Object.entries(r.laneCounts).map(([k, v]) => `${k}=${v}`).join(' '));
    } else {
      console.error(`Usage: kanban-bridge.mjs <sync [--reconcile] | status>`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
