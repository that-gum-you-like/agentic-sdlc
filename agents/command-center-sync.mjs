#!/usr/bin/env node
/**
 * command-center-sync.mjs — one idempotent pass that gives the Hermes command
 * center (hermes dashboard) full Paperclip-style visibility:
 *
 *   1. queue tasks            → cards            (delegates to kanban-bridge)
 *   2. agent registry         → pm/agents.json   (delegates to agent-registry)
 *   3. openspec/changes/*     → parent cards Bryce can READ and APPROVE
 *   4. each change's tasks.md → child cards (--parent) under the change
 *   5. openspec/BACKLOG.md    → cards under one "OpenSpec Backlog" parent
 *   6. run ledgers            → pm/runs.json + comments on one runs card
 *   7. approvals              → "approve" comment on a change card is stamped
 *                               back into the change's status.json + pm/approvals.json
 *
 *   node agents/command-center-sync.mjs sync [--reconcile]   # full pass
 *   node agents/command-center-sync.mjs status               # dry-run counts, no writes
 *
 * Approving a change from the board: open the "OpenSpec: <name>" card in the
 * dashboard (or `hermes kanban comment <id> approve`) and comment `approve`.
 * The next sync pass (≤15 min) records it and confirms on-card.
 *
 * Zero npm deps; shells out to `hermes` via kanban-bridge.runKanban. Card ids
 * and cursors persist in pm/command-center-links.json (pm/ is gitignored).
 *
 * Exports (for tests): mapChangePhase, scanChanges, parseSubtasks,
 * parseBacklog, collectRuns, syncChanges, syncBacklog, syncRuns,
 * reconcileApprovals, linkQueueTasks, fullSync, statusReport
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import fs from 'node:fs';
import { runKanban, sync as bridgeSync, readTasks } from './kanban-bridge.mjs';
import { buildRegistry } from './agent-registry.mjs';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_DIR = process.env.SDLC_PROJECT_DIR || resolve(dirname(__filename), '..');
const CHANGES_DIR = join(PROJECT_DIR, 'openspec', 'changes');
const BACKLOG_PATH = join(PROJECT_DIR, 'openspec', 'BACKLOG.md');
const PM_DIR = join(PROJECT_DIR, 'pm');
const STATE_PATH = join(PM_DIR, 'command-center-links.json');
const APPROVALS_PATH = join(PM_DIR, 'approvals.json');
const RUNS_PATH = join(PM_DIR, 'runs.json');
const LINKS_PATH = join(PM_DIR, 'kanban-links.json');

export const SYNC_AUTHOR = 'sdlc-sync';
const MAX_RUN_COMMENTS_PER_PASS = 20;
const MAX_SEEN_RUNS = 500;
const MAX_RUNS_JSON = 200;
const APPROVE_RE = /^\s*(approved?|lgtm|ship it)\b/i;

// ---------------------------------------------------------------------------
// small io helpers
// ---------------------------------------------------------------------------

function readJson(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJson(p, obj) {
  fs.mkdirSync(dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}
function loadState() {
  const s = readJson(STATE_PATH, {}) || {};
  return {
    changes: s.changes || {},       // change name -> kanban id
    subtasks: s.subtasks || {},     // subtask key -> kanban id
    backlog: s.backlog || {},       // backlog id (or 'root') -> kanban id
    runsRoot: s.runsRoot || null,   // kanban id of the run-history card
    phases: s.phases || {},         // change name -> last seen phase
    seenRuns: s.seenRuns || [],     // run keys already commented
    linkedPairs: s.linkedPairs || [], // `${parentKid}:${childKid}` already linked
    completedCards: s.completedCards || [], // kanban ids we already drove to done
  };
}
function kanbanId(created) {
  return created && (created.id || (created.task && created.task.id)) || null;
}
function boardMap() {
  const cards = runKanban(['list', '--json'], { json: true }) || [];
  return Object.fromEntries(cards.map((c) => [c.id, c]));
}
function comment(kid, text) {
  runKanban(['comment', kid, text, '--author', SYNC_AUTHOR]);
}

/**
 * Drive a card to done. Child cards created with --parent sit in `todo` under
 * dependency semantics and `hermes kanban complete` silently no-ops there
 * (exit 0, "cannot complete"), so promote --force first when needed and parse
 * stdout for the actual outcome. Successes (and already-terminal cards) are
 * remembered in state so re-passes don't re-issue hundreds of CLI calls.
 */
export function completeCard(kid, boardById, state) {
  if (state.completedCards.includes(kid)) return false;
  const lane = boardById[kid] && boardById[kid].status;
  if (lane === 'done') { state.completedCards.push(kid); return false; }
  if (lane !== 'ready' && lane !== 'running') {
    try { runKanban(['promote', kid, 'sync: source marked done', '--force']); } catch { /* may already be promotable */ }
  }
  const out = String(runKanban(['complete', kid]) || '');
  const done = /^Completed/im.test(out);
  if (done || /terminal state/i.test(out)) state.completedCards.push(kid);
  return done;
}

// ---------------------------------------------------------------------------
// openspec changes -> parent cards
// ---------------------------------------------------------------------------

/** OpenSpec phase -> kanban lane semantics (same shape as bridge.mapStatus). */
export function mapChangePhase(phase) {
  const p = String(phase || '').toLowerCase();
  if (p === 'archive' || p === 'archived') return { lane: 'done', verb: 'complete', initial: null };
  if (p === 'implement' || p === 'implementation' || p === 'verify') return { lane: 'running', verb: null, initial: 'running' };
  return { lane: 'ready', verb: null, initial: null }; // proposal/design/specs/tasks/planning
}

/** Pull a section body ("## Problem", "## Value Analysis") out of markdown. */
function sectionExcerpt(md, heading, maxLen = 700) {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, 'mi');
  const m = re.exec(md);
  if (!m) return '';
  const rest = md.slice(m.index + m[0].length);
  const end = rest.search(/^##\s+/m);
  const body = (end === -1 ? rest : rest.slice(0, end)).trim();
  return body.length > maxLen ? body.slice(0, maxLen).trimEnd() + ' …' : body;
}

/** Scan openspec/changes/* (excluding archive/) into normalized descriptors. */
export function scanChanges() {
  if (!fs.existsSync(CHANGES_DIR)) return [];
  const out = [];
  for (const name of fs.readdirSync(CHANGES_DIR).sort()) {
    if (name === 'archive') continue;
    const dir = join(CHANGES_DIR, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const status = readJson(join(dir, 'status.json'), {}) || {};
    let proposal = '';
    try { proposal = fs.readFileSync(join(dir, 'proposal.md'), 'utf8'); } catch { /* proposal optional */ }
    let tasksMd = '';
    try { tasksMd = fs.readFileSync(join(dir, 'tasks.md'), 'utf8'); } catch { /* tasks optional */ }
    out.push({ name, dir, phase: status.phase || 'proposal', status: status.status || 'proposed', approved: !!status.approved, proposal, tasksMd });
  }
  return out;
}

function changeCardBody(c) {
  const problem = sectionExcerpt(c.proposal, 'Problem');
  const value = sectionExcerpt(c.proposal, 'Value Analysis');
  return [
    `**OpenSpec change** \`${c.name}\` — phase at card creation: **${c.phase}** (status: ${c.status}). Live phase updates arrive as comments below.`,
    problem ? `\n## Problem (excerpt)\n${problem}` : '',
    value ? `\n## Value Analysis (excerpt)\n${value}` : '',
    '\n---',
    `**Read the full change:** \`openspec show ${c.name}\` — or open \`openspec/changes/${c.name}/\` (proposal.md · design.md · specs/ · tasks.md).`,
    `**Approve from this board:** comment \`approve\` on this card. The sync pass (≤15 min) stamps status.json + pm/approvals.json and confirms here.`,
    `Sub-tasks from this change's tasks.md appear as child cards of this one.`,
  ].filter(Boolean).join('\n').slice(0, 4000);
}

/** Upsert one card per change; comment on phase transitions; complete archived. */
export function syncChanges(state, boardById) {
  const changes = scanChanges();
  let created = 0, phaseComments = 0, completed = 0;
  for (const c of changes) {
    const target = mapChangePhase(c.phase);
    // Cached id short-circuits the create spawn: with ~300 cards every 15 min,
    // re-upserting each pass costs minutes of CPU for zero board change.
    let kid = state.changes[c.name];
    if (!kid) {
      const args = ['create', `OpenSpec: ${c.name}`, '--idempotency-key', `openspec:${c.name}`, '--json',
        '--body', changeCardBody(c), '--priority', '200', '--created-by', SYNC_AUTHOR];
      if (target.initial) args.push('--initial-status', target.initial);
      kid = kanbanId(runKanban(args, { json: true }));
      if (!kid) continue;
      created++;
      state.changes[c.name] = kid;
    }

    const lastPhase = state.phases[c.name];
    if (lastPhase && lastPhase !== c.phase) {
      try { comment(kid, `phase: ${lastPhase} → ${c.phase}`); phaseComments++; }
      catch { /* card may have been archived board-side */ }
    }
    state.phases[c.name] = c.phase;

    if (target.verb === 'complete' && completeCard(kid, boardById, state)) completed++;
  }
  // Changes whose dir vanished (archived after sync) -> complete their card once.
  const liveNames = new Set(changes.map((c) => c.name));
  for (const [name, kid] of Object.entries(state.changes)) {
    if (liveNames.has(name) || state.phases[name] === 'archived') continue;
    try { if (completeCard(kid, boardById, state)) completed++; } catch { /* card may be gone */ }
    state.phases[name] = 'archived';
  }
  return { changes: changes.length, created, phaseComments, completed, list: changes };
}

// ---------------------------------------------------------------------------
// tasks.md -> child cards
// ---------------------------------------------------------------------------

/**
 * Parse checklist items from a change's tasks.md. Only items under a heading
 * matching /task/i (e.g. "## Implementation Tasks") count; if no such heading
 * has items, fall back to every checklist item in the file.
 */
export function parseSubtasks(tasksMd) {
  const lines = String(tasksMd || '').split('\n');
  const inTaskSection = [];
  const all = [];
  let underTasks = false;
  for (const line of lines) {
    const h = line.match(/^#{2,3}\s+(.*)$/);
    if (h) { underTasks = /task/i.test(h[1]); continue; }
    const m = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/);
    if (!m) continue;
    const item = { checked: m[1].toLowerCase() === 'x', text: cleanTitle(m[2]) };
    all.push(item);
    if (underTasks) inTaskSection.push(item);
  }
  const items = inTaskSection.length ? inTaskSection : all;
  return items.map((it, i) => ({ ...it, n: i + 1 }));
}

function cleanTitle(text) {
  const t = String(text).replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
  return t.length > 120 ? t.slice(0, 117) + '…' : t;
}

/** Upsert each change's tasks.md items as child cards of the change card. */
export function syncSubtasks(state, boardById, changeList) {
  let created = 0, completed = 0, total = 0;
  for (const c of changeList) {
    const parentKid = state.changes[c.name];
    if (!parentKid || !c.tasksMd) continue;
    for (const item of parseSubtasks(c.tasksMd)) {
      total++;
      const key = `subtask:${c.name}:${item.n}`;
      let kid = state.subtasks[key];
      if (!kid) {
        kid = kanbanId(runKanban(['create', item.text, '--idempotency-key', key, '--json',
          '--parent', parentKid, '--created-by', SYNC_AUTHOR], { json: true }));
        if (!kid) continue;
        created++;
        state.subtasks[key] = kid;
      }
      if (item.checked && completeCard(kid, boardById, state)) completed++;
    }
  }
  return { subtasks: total, created, completed };
}

// ---------------------------------------------------------------------------
// BACKLOG.md -> cards under one parent
// ---------------------------------------------------------------------------

/** Parse "### <id>. <title>" idea headings out of openspec/BACKLOG.md. */
export function parseBacklog(md) {
  const out = [];
  for (const line of String(md || '').split('\n')) {
    const m = line.match(/^###\s+(R-\d+|\d+[a-z]?)\.\s+(.+)$/);
    if (!m) continue;
    const [, id, rawTitle] = m;
    if (/^R-/i.test(id)) continue; // rejected ideas stay off the board
    const done = /✅|SHIPPED|COMPLETED|IMPLEMENTED/i.test(rawTitle);
    out.push({ id, title: cleanTitle(rawTitle), done });
  }
  return out;
}

export function syncBacklog(state, boardById) {
  let md = '';
  try { md = fs.readFileSync(BACKLOG_PATH, 'utf8'); } catch { return { backlog: 0, created: 0, completed: 0 }; }
  const ideas = parseBacklog(md);
  if (!ideas.length) return { backlog: 0, created: 0, completed: 0 };

  let rootKid = state.backlog.root;
  if (!rootKid) {
    rootKid = kanbanId(runKanban(['create', 'OpenSpec Backlog (ideas — not yet proposed)',
      '--idempotency-key', 'backlog:root', '--json', '--priority', '150', '--created-by', SYNC_AUTHOR,
      '--body', 'Ideas from openspec/BACKLOG.md. Each child card is one idea. Promote via the openspec-new-change skill; this catalog is read-only from the board side.'],
      { json: true }));
    if (!rootKid) return { backlog: 0, created: 0, completed: 0 };
    state.backlog.root = rootKid;
  }

  let created = 0, completed = 0;
  for (const idea of ideas) {
    let kid = state.backlog[idea.id];
    if (!kid) {
      kid = kanbanId(runKanban(['create', `#${idea.id} ${idea.title}`, '--idempotency-key', `backlog:${idea.id}`,
        '--json', '--parent', rootKid, '--created-by', SYNC_AUTHOR], { json: true }));
      if (!kid) continue;
      created++;
      state.backlog[idea.id] = kid;
    }
    if (idea.done && completeCard(kid, boardById, state)) completed++;
  }
  return { backlog: ideas.length, created, completed };
}

// ---------------------------------------------------------------------------
// run ledgers -> pm/runs.json + comments on one card
// ---------------------------------------------------------------------------

/** Normalize cycle-history + pr-auto-review + drain-logs into run entries. */
export function collectRuns() {
  const runs = [];
  for (const e of readJson(join(PM_DIR, 'cycle-history.json'), []) || []) {
    if (!e || !e.timestamp) continue;
    runs.push({ key: `cycle:${e.type}:${e.timestamp}`, kind: e.type || 'cycle', ts: e.timestamp,
      ok: e.success !== false, detail: e.stats ? JSON.stringify(e.stats) : '' });
  }
  try {
    for (const line of fs.readFileSync(join(PM_DIR, 'pr-auto-review.log'), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (!e.ts) continue;
      runs.push({ key: `pr:${e.pr}:${e.ts}`, kind: 'pr-auto-review', ts: e.ts,
        ok: e.action !== 'error', detail: `PR #${e.pr} ${e.action}${e.branch ? ` (${e.branch})` : ''}` });
    }
  } catch { /* no pr log yet */ }
  try {
    for (const f of fs.readdirSync(join(PM_DIR, 'drain-logs'))) {
      const m = f.match(/^drain-(\d{8})-(\d{6})\.log$/);
      if (!m) continue;
      const [, d, t] = m;
      const ts = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}Z`;
      runs.push({ key: `drain:${f}`, kind: 'drain', ts, ok: true, detail: `pm/drain-logs/${f}` });
    }
  } catch { /* no drain logs yet */ }
  runs.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  return runs.slice(0, MAX_RUNS_JSON);
}

export function syncRuns(state) {
  const runs = collectRuns();
  writeJson(RUNS_PATH, { generatedAt: new Date().toISOString(), runs });

  let rootKid = state.runsRoot;
  if (!rootKid) {
    rootKid = kanbanId(runKanban(['create', 'Agent run history (scheduler · drain · reviews · cycles)',
      '--idempotency-key', 'runs:root', '--json', '--priority', '150', '--created-by', SYNC_AUTHOR,
      '--body', 'Run log for the autonomous SDLC: sdlc-sched-* scheduler jobs, hermes drain passes, pr-auto-review merges, daily/weekly cycles. Each run arrives as a comment (newest last). Full normalized ledger: pm/runs.json. Sources: pm/cycle-history.json · pm/pr-auto-review.log · pm/drain-logs/.'],
      { json: true }));
    if (!rootKid) return { runs: runs.length, commented: 0 };
    state.runsRoot = rootKid;
  }

  const seen = new Set(state.seenRuns);
  const fresh = runs.filter((r) => !seen.has(r.key)).reverse(); // oldest first
  let commented = 0;
  for (const r of fresh) {
    if (commented >= MAX_RUN_COMMENTS_PER_PASS) break;
    comment(rootKid, `[${r.kind}] ${r.ts} ${r.ok ? '✓' : '✗'}${r.detail ? ` — ${r.detail}` : ''}`);
    state.seenRuns.push(r.key);
    commented++;
  }
  // Anything beyond the per-pass cap is still marked seen so a giant backlog
  // floods neither this pass nor the next — the ledger in pm/runs.json is complete.
  for (const r of fresh.slice(commented)) state.seenRuns.push(r.key);
  if (state.seenRuns.length > MAX_SEEN_RUNS) state.seenRuns = state.seenRuns.slice(-MAX_SEEN_RUNS);
  return { runs: runs.length, commented };
}

// ---------------------------------------------------------------------------
// approvals: card comments -> status.json + pm/approvals.json
// ---------------------------------------------------------------------------

export function reconcileApprovals(state) {
  const approvals = readJson(APPROVALS_PATH, []) || [];
  const already = new Set(approvals.map((a) => a.change));
  let recorded = 0;
  for (const [name, kid] of Object.entries(state.changes)) {
    if (already.has(name) || state.phases[name] === 'archived') continue;
    const preStatus = readJson(join(CHANGES_DIR, name, 'status.json'), null);
    if (preStatus && preStatus.approved) continue; // already stamped (e.g. manually)
    let shown;
    try { shown = runKanban(['show', kid, '--json'], { json: true }); } catch { continue; }
    const comments = (shown && shown.comments) || [];
    const hit = comments.find((c) => c && c.author !== SYNC_AUTHOR && APPROVE_RE.test(String(c.body || '')));
    if (!hit) continue;

    const approvedAt = hit.created_at ? new Date(hit.created_at * 1000).toISOString() : new Date().toISOString();
    const entry = { change: name, kanbanId: kid, approvedBy: hit.author || 'user', approvedAt, comment: String(hit.body || '').slice(0, 200) };

    const statusPath = join(CHANGES_DIR, name, 'status.json');
    const status = readJson(statusPath, null);
    if (status && !status.approved) {
      status.approved = true;
      status.approvedBy = entry.approvedBy;
      status.approvedAt = approvedAt;
      status.lastUpdated = new Date().toISOString().slice(0, 10);
      writeJson(statusPath, status);
    }
    approvals.push(entry);
    already.add(name);
    recorded++;
    try { comment(kid, `✅ approval recorded → openspec/changes/${name}/status.json (approvedBy: ${entry.approvedBy})`); } catch { /* comment is best-effort */ }
  }
  if (recorded) writeJson(APPROVALS_PATH, approvals);
  return { approvalsRecorded: recorded, approvalsTotal: approvals.length };
}

// ---------------------------------------------------------------------------
// queue task cards <- link -> change cards
// ---------------------------------------------------------------------------

export function linkQueueTasks(state, changeList) {
  const links = readJson(LINKS_PATH, {}) || {};
  const names = changeList.map((c) => c.name);
  let linked = 0;
  for (const task of readTasks()) {
    const taskKid = links[task.id];
    if (!taskKid) continue;
    const tags = (task.tags || []).map(String);
    const hay = `${tags.join(' ')} ${task.description || ''}`;
    const name = names.find((n) => tags.includes(n) || tags.includes(`change:${n}`) || hay.includes(`openspec/changes/${n}`));
    if (!name) continue;
    const parentKid = state.changes[name];
    if (!parentKid) continue;
    const pair = `${parentKid}:${taskKid}`;
    if (state.linkedPairs.includes(pair)) continue;
    try { runKanban(['link', parentKid, taskKid]); linked++; } catch { /* link may already exist */ }
    state.linkedPairs.push(pair);
  }
  return { linked };
}

// ---------------------------------------------------------------------------
// orchestration
// ---------------------------------------------------------------------------

function writeAgentRegistry() {
  const reg = buildRegistry();
  reg.generatedAt = new Date().toISOString();
  writeJson(join(PM_DIR, 'agents.json'), reg);
  return { agents: reg.agents.length };
}

/**
 * One full pass. Sections are isolated: a failure is captured per-section so
 * the rest of the board still fills. Returns per-section results.
 */
export function fullSync({ reconcile = false } = {}) {
  const state = loadState();
  const results = {};
  const section = (label, fn) => {
    try { results[label] = { ok: true, ...fn() }; }
    catch (e) { results[label] = { ok: false, error: e.message }; }
  };

  section('queue', () => bridgeSync({ reconcile }));
  section('agents', () => writeAgentRegistry());

  let boardById = {};
  try { boardById = boardMap(); } catch { /* board unreadable -> treat as empty */ }
  let changeList = [];
  section('changes', () => { const r = syncChanges(state, boardById); changeList = r.list; return { changes: r.changes, created: r.created, phaseComments: r.phaseComments, completed: r.completed }; });
  section('subtasks', () => syncSubtasks(state, boardById, changeList));
  section('backlog', () => syncBacklog(state, boardById));
  section('links', () => linkQueueTasks(state, changeList));
  section('runs', () => syncRuns(state));
  section('approvals', () => reconcileApprovals(state));

  writeJson(STATE_PATH, state);
  return results;
}

/** Dry-run: local counts only — never calls a mutating kanban verb. */
export function statusReport() {
  const state = loadState();
  const changes = scanChanges();
  const subtasks = changes.reduce((n, c) => n + parseSubtasks(c.tasksMd).length, 0);
  let backlog = 0;
  try { backlog = parseBacklog(fs.readFileSync(BACKLOG_PATH, 'utf8')).length; } catch { /* no backlog file */ }
  const runs = collectRuns();
  const seen = new Set(state.seenRuns);
  return {
    changes: changes.length,
    changesOnBoard: Object.keys(state.changes).length,
    subtasks,
    backlog,
    runs: runs.length,
    runsPendingComment: runs.filter((r) => !seen.has(r.key)).length,
    queueTasks: readTasks().length,
  };
}

const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;
if (__isMainModule) {
  const cmd = process.argv[2] || 'status';
  try {
    if (cmd === 'sync') {
      const r = fullSync({ reconcile: process.argv.includes('--reconcile') });
      for (const [name, res] of Object.entries(r)) {
        if (!res.ok) { console.error(`✗ ${name}: ${res.error}`); continue; }
        const detail = Object.entries(res).filter(([k]) => k !== 'ok')
          .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ');
        console.log(`✅ ${name}: ${detail}`);
      }
      if (Object.values(r).some((res) => !res.ok)) process.exit(1);
    } else if (cmd === 'status') {
      const r = statusReport();
      console.log(`📋 command center: ${r.changes} changes (${r.changesOnBoard} on board) · ${r.subtasks} sub-tasks · ${r.backlog} backlog ideas · ${r.queueTasks} queue tasks · ${r.runs} runs (${r.runsPendingComment} pending comment)`);
    } else {
      console.error('Usage: command-center-sync.mjs <sync [--reconcile] | status>');
      process.exit(1);
    }
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
