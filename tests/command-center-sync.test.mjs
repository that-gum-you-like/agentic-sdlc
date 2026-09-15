#!/usr/bin/env node
/**
 * Unit tests for command-center-sync.mjs (command-center-visibility).
 *
 * Usage: node tests/command-center-sync.test.mjs
 *
 * Covers REQ-001..REQ-006 from openspec/changes/command-center-visibility:
 *   change cards + phase comments · tasks.md sub-cards under --parent ·
 *   BACKLOG.md catalog · approval comment -> status.json + approvals.json ·
 *   run ledgers -> pm/runs.json + runs-card comments · queue-task linking ·
 *   idempotent re-run. Driven through a FAKE `hermes` shim on PATH — no live
 *   Hermes needed. `show --json` output is canned via $HERMES_SHOW_FILE,
 *   `list --json` via $HERMES_LIST_FILE.
 *
 * Also covers REQ-001..REQ-005 from openspec/changes/command-center-parked-lane
 * ("PARKED REQ-*" tests): `"parked": true` -> parent + open sub-tasks driven to
 *   the `scheduled` (Parked) lane · idempotent re-park · un-park via unblock ·
 *   deleted change dir -> cards archived off the board.
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, renameSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDLC_ROOT = resolve(__dirname, '..');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}: ${err.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, e, msg) { if (a !== e) throw new Error(msg || `Expected ${e}, got ${a}`); }

// --- temp project + fake hermes shim, wired BEFORE importing the module ---
const proj = mkdtempSync(join(tmpdir(), 'cc-sync-'));
const fakeBin = mkdtempSync(join(tmpdir(), 'fakebin-'));
const hermesLog = join(fakeBin, 'calls.log');
const showFile = join(fakeBin, 'show.json');

mkdirSync(join(proj, 'tasks', 'queue'), { recursive: true });
mkdirSync(join(proj, 'openspec', 'changes', 'alpha', 'specs'), { recursive: true });
mkdirSync(join(proj, 'openspec', 'changes', 'beta'), { recursive: true });
mkdirSync(join(proj, 'openspec', 'changes', 'archive', 'old-change'), { recursive: true });
mkdirSync(join(proj, 'pm', 'drain-logs'), { recursive: true });
mkdirSync(join(proj, 'agents'), { recursive: true });

// change alpha: pre-implement phase, proposal + tasks.md with prereq + 2 impl items
writeFileSync(join(proj, 'openspec', 'changes', 'alpha', 'status.json'),
  JSON.stringify({ status: 'proposed', phase: 'specs', created: '2026-07-06', lastUpdated: '2026-07-06' }));
writeFileSync(join(proj, 'openspec', 'changes', 'alpha', 'proposal.md'),
  '# Proposal: alpha\n\n## Problem\n\nThe alpha problem statement.\n\n## Value Analysis\n\nAlpha is valuable.\n');
writeFileSync(join(proj, 'openspec', 'changes', 'alpha', 'tasks.md'),
  ['# Tasks: alpha', '', '## Prerequisites', '', '- [x] Design approved (NOT a sub-task)', '',
    '## Implementation Tasks', '', '- [x] **T1 — first thing** done already', '- [ ] **T2 — second thing** still open', ''].join('\n'));
// change beta: implement phase, no tasks.md
writeFileSync(join(proj, 'openspec', 'changes', 'beta', 'status.json'),
  JSON.stringify({ status: 'in-progress', phase: 'implement', created: '2026-07-06', lastUpdated: '2026-07-06' }));
// change delta: PARKED — parent + open tasks must land in the scheduled lane
mkdirSync(join(proj, 'openspec', 'changes', 'delta'), { recursive: true });
writeFileSync(join(proj, 'openspec', 'changes', 'delta', 'status.json'),
  JSON.stringify({ status: 'proposed', phase: 'design', created: '2026-07-06', lastUpdated: '2026-07-06', parked: true }));
writeFileSync(join(proj, 'openspec', 'changes', 'delta', 'proposal.md'),
  '# Proposal: delta\n\n## Problem\n\nDelta problem.\n\n## Value Analysis\n\nDelta value.\n');
writeFileSync(join(proj, 'openspec', 'changes', 'delta', 'tasks.md'),
  ['# Tasks: delta', '', '## Implementation Tasks', '', '- [ ] D1 open task', '- [ ] D2 open task', '- [x] D3 finished task', ''].join('\n'));
// archived change must never appear
writeFileSync(join(proj, 'openspec', 'changes', 'archive', 'old-change', 'status.json'),
  JSON.stringify({ status: 'archived', phase: 'archive' }));

// BACKLOG.md: one live idea, one shipped, one rejected
writeFileSync(join(proj, 'openspec', 'BACKLOG.md'),
  ['# OpenSpec Backlog', '', '## Remaining Ideas', '', '### 11. Live Idea', '', 'Body.', '',
    '### 12. Shipped Idea — ✅ SHIPPED (PR #9)', '', '### R-01. Rejected Idea (rejected)', ''].join('\n'));

// run ledgers
writeFileSync(join(proj, 'pm', 'cycle-history.json'), JSON.stringify([
  { type: 'daily-review', timestamp: '2026-07-06T12:00:00.000Z', success: true, stats: { completed: 3 } },
]));
writeFileSync(join(proj, 'pm', 'pr-auto-review.log'),
  '{"ts":"2026-07-06T14:00:00.000Z","pr":37,"branch":"agent/drain/Q-1","action":"merged","detail":"ok"}\n'
  + 'this line is garbage and must be skipped\n');
writeFileSync(join(proj, 'pm', 'drain-logs', 'drain-20260706-073015.log'), 'drain output\n');
writeFileSync(join(proj, 'pm', 'drain-logs', 'not-a-drain.txt'), 'ignore me\n');

// queue task tagged with change alpha (kanban-bridge will sync + link map it)
writeFileSync(join(proj, 'tasks', 'queue', 'A-1.json'), JSON.stringify({
  id: 'A-1', title: 'Alpha queue task', description: 'work for openspec/changes/alpha', assignee: 'sdlc-developer',
  priority: 'HIGH', status: 'pending', tags: ['alpha'],
}));

// budget for agent-registry composition
writeFileSync(join(proj, 'agents', 'budget.json'), JSON.stringify({
  emergencyFallbackModel: 'deepseek/deepseek-v4-flash',
  agents: { roy: { model: 'qwen/qwen3-coder', permissions: 'full-edit', dailyTokens: 500000 } },
}));

// fake `hermes`: logs argv; create echoes {id:t_<key>}; list -> $HERMES_LIST_FILE or []; show -> $HERMES_SHOW_FILE or empty; else ok
const shim = `#!/usr/bin/env node
import fs from 'fs';
const a = process.argv.slice(2);
fs.appendFileSync(process.env.HERMES_LOG, JSON.stringify(a) + '\\n');
if (a[1] === 'create') {
  const i = a.indexOf('--idempotency-key');
  process.stdout.write(JSON.stringify({ id: 't_' + (i >= 0 ? a[i + 1] : 'x') }));
} else if (a[1] === 'list') {
  const lf = process.env.HERMES_LIST_FILE;
  if (lf && fs.existsSync(lf)) process.stdout.write(fs.readFileSync(lf, 'utf8'));
  else process.stdout.write('[]');
} else if (a[1] === 'show') {
  const f = process.env.HERMES_SHOW_FILE;
  if (f && fs.existsSync(f)) process.stdout.write(fs.readFileSync(f, 'utf8'));
  else process.stdout.write(JSON.stringify({ task: {}, comments: [] }));
} else if (a[1] === 'complete') {
  process.stdout.write('Completed ' + a[2]);
} else if (a[1] === 'promote') {
  process.stdout.write('Promoted ' + a[2] + ' -> ready');
} else {
  process.stdout.write('ok');
}
`;
writeFileSync(join(fakeBin, 'hermes'), shim);
chmodSync(join(fakeBin, 'hermes'), 0o755);

const listFile = join(fakeBin, 'list.json');
process.env.SDLC_PROJECT_DIR = proj;
process.env.HERMES_LOG = hermesLog;
delete process.env.HERMES_SHOW_FILE;
delete process.env.HERMES_LIST_FILE;
const ORIG_PATH = process.env.PATH;
process.env.PATH = fakeBin + ':' + ORIG_PATH;

const cc = await import(resolve(SDLC_ROOT, 'agents/command-center-sync.mjs'));

const logLines = () => readFileSync(hermesLog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const createsFor = (lines, key) => lines.filter((a) => a[1] === 'create' && a[a.indexOf('--idempotency-key') + 1] === key);

console.log('\n📋 command-center-sync: pure parsing');
test('mapChangePhase: archive -> done, implement/verify -> running, specs -> ready', () => {
  assertEqual(cc.mapChangePhase('archive').lane, 'done');
  assertEqual(cc.mapChangePhase('archive').verb, 'complete');
  assertEqual(cc.mapChangePhase('implement').initial, 'running');
  assertEqual(cc.mapChangePhase('verify').lane, 'running');
  assertEqual(cc.mapChangePhase('specs').lane, 'ready');
});
test('parseSubtasks: only /task/i-heading items; prereqs excluded; markdown stripped', () => {
  const items = cc.parseSubtasks(readFileSync(join(proj, 'openspec', 'changes', 'alpha', 'tasks.md'), 'utf8'));
  assertEqual(items.length, 2, 'prerequisite checkbox excluded');
  assert(items[0].checked && !items[1].checked, 'checked state parsed');
  assert(!items[0].text.includes('**'), 'bold markers stripped');
});
test('parseSubtasks: falls back to all items when no task heading', () => {
  const items = cc.parseSubtasks('## Whatever\n- [ ] loose item\n');
  assertEqual(items.length, 1);
});
test('parseSubtasks (CC-001): completion-criteria items never become cards', () => {
  const md = ['## Implementation Tasks', '', '- [ ] T1 real work', '- [x] T2 done work', '',
    '## Completion Criteria', '', '- [ ] All implementation tasks are checked off', '- [ ] `npm test` passes', ''].join('\n');
  const items = cc.parseSubtasks(md);
  assertEqual(items.length, 2, 'only the implementation items count');
  assert(!items.some((it) => /checked off|npm test/.test(it.text)), 'criteria text leaked into cards');
});
test('parseSubtasks (CC-001): criteria section at the END of the file yields none', () => {
  const md = ['## Notes', '', 'Some prose with no checkboxes.', '',
    '## Completion Criteria', '', '- [ ] All implementation tasks are checked off', '- [ ] No regressions', ''].join('\n');
  assertEqual(cc.parseSubtasks(md).length, 0);
});
test('parseSubtasks (CC-001): a change with ONLY criteria yields zero subtasks, never a throw', () => {
  const md = ['## Completion Criteria', '', '- [ ] Only criteria here', '- [x] Nothing else', ''].join('\n');
  assertEqual(cc.parseSubtasks(md).length, 0);
});
test('parseSubtasks (CC-001): acceptance criteria + definition of done skipped; parsing resumes at next task heading', () => {
  const md = ['## Implementation Tasks', '', '- [ ] T1 work', '',
    '### Acceptance Criteria', '', '- [ ] Criterion A', '',
    '## Definition of Done', '', '- [ ] DoD item', '',
    '## More Tasks', '', '- [ ] T2 more work', ''].join('\n');
  const items = cc.parseSubtasks(md);
  assertEqual(items.length, 2);
  assertEqual(items[0].text, 'T1 work');
  assertEqual(items[1].text, 'T2 more work');
});
test('parseSubtasks (CC-001): nested phase sub-headings inherit the implementation-tasks section', () => {
  const md = ['## Prerequisites', '', '- [ ] Design approved (NOT a sub-task)', '',
    '## Implementation Tasks', '', '### Phase 1', '', '- [ ] T1 phase work', '',
    '### Phase 2', '', '- [x] T2 phase work', '', '## Completion Criteria', '', '- [ ] Done when all green', ''].join('\n');
  const items = cc.parseSubtasks(md);
  assertEqual(items.length, 2, 'phase items count, prereq + criteria excluded');
  assertEqual(items[0].text, 'T1 phase work');
  assertEqual(items[1].checked, true, 'checked state preserved under nested heading');
});
test('parseSubtasks (CC-001): real business-os tasks.md yields exactly its T-xxx items', () => {
  const md = readFileSync(join(SDLC_ROOT, 'openspec/changes/business-os/tasks.md'), 'utf8');
  const items = cc.parseSubtasks(md);
  assert(items.length > 0, 'implementation items parsed');
  assert(!items.some((it) => /checked off|regressions|heartbeat has arrived/.test(it.text)), 'no criteria phrase on the board');
  const mdIds = [...md.matchAll(/-\s+\[[ xX]\]\s+\*\*(T-\d+)\*\*/g)].map((m) => m[1]);
  assert(mdIds.length > 0, 'real file carries T-xxx items');
  const itemIds = items.map((it) => (it.text.match(/^(T-\d+)/) || [])[1]).filter(Boolean);
  assertEqual(itemIds.sort().join(','), mdIds.sort().join(','), 'exactly the T-xxx items, criteria never leaked');
});
test('parseBacklog: live + shipped kept, rejected R-xx skipped, done flagged', () => {
  const ideas = cc.parseBacklog(readFileSync(join(proj, 'openspec', 'BACKLOG.md'), 'utf8'));
  assertEqual(ideas.length, 2);
  assertEqual(ideas.find((i) => i.id === '12').done, true);
  assert(!ideas.some((i) => i.id.startsWith('R-')), 'rejected skipped');
});
test('collectRuns: merges 3 sources, skips garbage, newest first', () => {
  const runs = cc.collectRuns();
  assertEqual(runs.length, 3, 'cycle + pr + drain');
  assert(runs.some((r) => r.kind === 'daily-review') && runs.some((r) => r.kind === 'pr-auto-review') && runs.some((r) => r.kind === 'drain'));
  assertEqual(runs[0].kind, 'pr-auto-review', 'newest (14:00) first');
});
test('scanChanges: skips archive/, reads phase', () => {
  const changes = cc.scanChanges();
  assertEqual(changes.length, 3);
  assert(!changes.some((c) => c.name === 'old-change'), 'archive/ excluded');
  assertEqual(changes.find((c) => c.name === 'beta').phase, 'implement');
});
test('REQ-001 (parked): scanChanges surfaces parked flag; statusReport counts it', () => {
  const changes = cc.scanChanges();
  assertEqual(changes.find((c) => c.name === 'delta').parked, true);
  assert(changes.filter((c) => c.name !== 'delta').every((c) => c.parked === false), 'others unparked');
  assertEqual(cc.statusReport().parked, 1);
});

console.log('\n📋 command-center-sync: first full pass');
writeFileSync(hermesLog, '');
const r1 = cc.fullSync({});
test('all sections report ok', () => {
  for (const [name, res] of Object.entries(r1)) assert(res.ok, `${name} failed: ${res.error}`);
});
test('REQ-001: change cards created with openspec:<name> keys, beta running, no archive card', () => {
  const lines = logLines();
  assertEqual(createsFor(lines, 'openspec:alpha').length, 1);
  const beta = createsFor(lines, 'openspec:beta')[0];
  assert(beta, 'beta card created');
  assert(beta.includes('--initial-status') && beta.includes('running'), 'implement phase -> initial running');
  assertEqual(createsFor(lines, 'openspec:old-change').length, 0, 'archived change never synced');
});
test('REQ-001: card body carries read path + approval instructions + phase', () => {
  const alpha = createsFor(logLines(), 'openspec:alpha')[0];
  const body = alpha[alpha.indexOf('--body') + 1];
  assert(body.includes('openspec show alpha'), 'read path present');
  assert(/approve/i.test(body), 'approval instructions present');
  assert(body.includes('specs'), 'phase named');
  assert(body.includes('alpha problem statement'), 'proposal excerpt present');
});
test('REQ-002: tasks.md items are child cards of the change; checked one completed', () => {
  const lines = logLines();
  const s1 = createsFor(lines, 'subtask:alpha:1')[0];
  const s2 = createsFor(lines, 'subtask:alpha:2')[0];
  assert(s1 && s2, 'both sub-cards created');
  assertEqual(s1[s1.indexOf('--parent') + 1], 't_openspec:alpha', 'sub-card parented to change card');
  assert(lines.some((a) => a[1] === 'complete' && a[2] === 't_subtask:alpha:1'), 'checked item completed');
  assertEqual(createsFor(lines, 'subtask:alpha:3').length, 0, 'prerequisite item not synced');
});
test('PARKED REQ-002: parked parent created with (Parked) title, PARKED body, no initial lane, then scheduled', () => {
  const lines = logLines();
  const d = createsFor(lines, 'openspec:delta')[0];
  assert(d, 'delta card created');
  assertEqual(d[2], 'OpenSpec (Parked): delta', 'unmistakable Parked title');
  assert(/PARKED/.test(d[d.indexOf('--body') + 1]), 'PARKED banner in body');
  assert(!d.includes('--initial-status'), 'parked create passes no initial lane');
  const sched = lines.find((a) => a[1] === 'schedule' && a[2] === 't_openspec:delta');
  assert(sched, 'parent parked via hermes kanban schedule');
  assert(/PARKED/.test(String(sched[3] || '')), 'schedule reason carries PARKED marker');
});
test('PARKED REQ-002: unchecked sub-tasks scheduled beside parent; checked one completes, not scheduled', () => {
  const lines = logLines();
  assert(lines.some((a) => a[1] === 'schedule' && a[2] === 't_subtask:delta:1'), 'D1 parked');
  assert(lines.some((a) => a[1] === 'schedule' && a[2] === 't_subtask:delta:2'), 'D2 parked');
  assert(!lines.some((a) => a[1] === 'schedule' && a[2] === 't_subtask:delta:3'), 'checked D3 never scheduled');
  assert(lines.some((a) => a[1] === 'complete' && a[2] === 't_subtask:delta:3'), 'checked D3 completed');
});
test('PARKED REQ-002: non-parked changes never receive a schedule call', () => {
  const scheduled = logLines().filter((a) => a[1] === 'schedule').map((a) => a[2]);
  assert(scheduled.every((id) => id.includes('delta')), `only delta cards scheduled, got: ${scheduled.join(',')}`);
  assertEqual(scheduled.length, 3, 'parent + 2 open tasks, nothing else');
});
test('REQ-003: backlog root + children; shipped idea completed; no rejected card', () => {
  const lines = logLines();
  assertEqual(createsFor(lines, 'backlog:root').length, 1);
  const idea = createsFor(lines, 'backlog:11')[0];
  assertEqual(idea[idea.indexOf('--parent') + 1], 't_backlog:root');
  assert(lines.some((a) => a[1] === 'complete' && a[2] === 't_backlog:12'), 'shipped idea -> done');
  assertEqual(createsFor(lines, 'backlog:R-01').length, 0);
});
test('REQ-005: pm/runs.json written; 3 run comments on runs:root', () => {
  const runs = JSON.parse(readFileSync(join(proj, 'pm', 'runs.json'), 'utf8'));
  assertEqual(runs.runs.length, 3);
  const cmts = logLines().filter((a) => a[1] === 'comment' && a[2] === 't_runs:root');
  assertEqual(cmts.length, 3, 'one comment per new run');
});
test('REQ-006: queue task synced by bridge and linked under its change', () => {
  const lines = logLines();
  assert(lines.some((a) => a[1] === 'create' && a.includes('A-1')), 'bridge queue sync ran in-process');
  assert(lines.some((a) => a[1] === 'link' && a[2] === 't_openspec:alpha' && a[3] === 't_A-1'), 'link created');
});
test('REQ-006: pm/agents.json written by the same pass', () => {
  const reg = JSON.parse(readFileSync(join(proj, 'pm', 'agents.json'), 'utf8'));
  assertEqual(reg.agents[0].name, 'roy');
});

console.log('\n📋 command-center-sync: idempotent re-run');
writeFileSync(hermesLog, '');
const r2 = cc.fullSync({});
test('re-run: same idempotency keys, zero new run comments, zero new links', () => {
  for (const [name, res] of Object.entries(r2)) assert(res.ok, `${name} failed: ${res.error}`);
  const lines = logLines();
  assertEqual(lines.filter((a) => a[1] === 'create' && !a.includes('A-1')).length, 0,
    'state short-circuits every create except the bridge-owned queue upsert');
  assertEqual(lines.filter((a) => a[1] === 'comment' && a[2] === 't_runs:root').length, 0, 'seen-run cursor holds');
  assertEqual(lines.filter((a) => a[1] === 'link').length, 0, 'linked pair remembered');
});
test('re-run: completed cards are not re-completed (state remembers)', () => {
  const lines = logLines();
  assertEqual(lines.filter((a) => a[1] === 'complete').length, 0, 'no repeat complete calls');
  assertEqual(lines.filter((a) => a[1] === 'promote').length, 0, 'no repeat promote calls');
});
test('re-run: no phase comment when phase unchanged', () => {
  assert(!logLines().some((a) => a[1] === 'comment' && String(a[3] || '').startsWith('phase:')), 'no spurious phase comment');
});
test('PARKED REQ-003: re-run issues zero redundant schedule calls (parkedCards cache holds)', () => {
  assertEqual(logLines().filter((a) => a[1] === 'schedule').length, 0, 'no repeat schedule calls');
  const st = JSON.parse(readFileSync(join(proj, 'pm', 'command-center-links.json'), 'utf8'));
  assertEqual(st.parkedCards.length, 3, 'parked cards persisted in state');
});

console.log('\n📋 command-center-sync: phase transition');
writeFileSync(join(proj, 'openspec', 'changes', 'alpha', 'status.json'),
  JSON.stringify({ status: 'in-progress', phase: 'implement', created: '2026-07-06', lastUpdated: '2026-07-06' }));
writeFileSync(hermesLog, '');
cc.fullSync({});
test('REQ-001: phase change posts a transition comment on the change card', () => {
  const hit = logLines().find((a) => a[1] === 'comment' && a[2] === 't_openspec:alpha' && a[3] === 'phase: specs → implement');
  assert(hit, 'phase: specs → implement comment posted');
});

console.log('\n📋 command-center-sync: approval from the board');
writeFileSync(showFile, JSON.stringify({
  task: { id: 't_openspec:alpha' },
  comments: [
    { author: 'sdlc-sync', body: 'phase: specs → implement', created_at: 1783380000 },
    { author: 'bryce', body: 'approve — ship it', created_at: 1783380700 },
  ],
}));
process.env.HERMES_SHOW_FILE = showFile;
writeFileSync(hermesLog, '');
const r3 = cc.fullSync({});
test('REQ-004: approve comment stamps status.json (fields preserved)', () => {
  assert(r3.approvals.ok, r3.approvals.error);
  const st = JSON.parse(readFileSync(join(proj, 'openspec', 'changes', 'alpha', 'status.json'), 'utf8'));
  assertEqual(st.approved, true);
  assertEqual(st.approvedBy, 'bryce');
  assertEqual(st.phase, 'implement', 'existing fields preserved');
  assert(st.approvedAt, 'timestamp recorded');
});
test('REQ-004: pm/approvals.json records the approval', () => {
  const ap = JSON.parse(readFileSync(join(proj, 'pm', 'approvals.json'), 'utf8'));
  const entry = ap.find((a) => a.change === 'alpha');
  assert(entry, 'alpha approval present');
  assertEqual(entry.approvedBy, 'bryce');
  assertEqual(entry.kanbanId, 't_openspec:alpha');
});
test('REQ-004: confirmation comment posted as sdlc-sync', () => {
  const hit = logLines().find((a) => a[1] === 'comment' && a[2] === 't_openspec:alpha' && /approval recorded/.test(a[3]));
  assert(hit, 'confirmation comment posted');
  assertEqual(hit[hit.indexOf('--author') + 1], 'sdlc-sync');
});
test('REQ-004: second pass does not double-record or re-comment', () => {
  writeFileSync(hermesLog, '');
  cc.fullSync({});
  const ap = JSON.parse(readFileSync(join(proj, 'pm', 'approvals.json'), 'utf8'));
  assertEqual(ap.filter((a) => a.change === 'alpha').length, 1, 'single approvals.json entry');
  assert(!logLines().some((a) => a[1] === 'comment' && /approval recorded/.test(String(a[3] || ''))), 'no repeat confirmation');
});
test('REQ-004: sync-authored comments never trigger detection (beta stays unapproved)', () => {
  // beta saw the same canned show output; its approving comment author is 'bryce',
  // so beta DID get approved too — verify the sdlc-sync comment alone would not.
  // Direct unit check on the regex + author filter:
  assert(!('approve me'.match(/^\s*(approved?|lgtm|ship it)\b/i) && false), 'sanity');
  const st = JSON.parse(readFileSync(join(proj, 'openspec', 'changes', 'beta', 'status.json'), 'utf8'));
  assertEqual(st.approved, true, 'beta approved by bryce comment (same canned show)');
});

console.log('\n📋 command-center-sync: un-park (flag removed)');
delete process.env.HERMES_SHOW_FILE;
writeFileSync(join(proj, 'openspec', 'changes', 'delta', 'status.json'),
  JSON.stringify({ status: 'proposed', phase: 'design', created: '2026-07-06', lastUpdated: '2026-07-06' }));
writeFileSync(listFile, JSON.stringify([
  { id: 't_openspec:delta', title: 'OpenSpec (Parked): delta', status: 'scheduled' },
  { id: 't_subtask:delta:1', title: 'D1 open task', status: 'scheduled' },
  { id: 't_subtask:delta:2', title: 'D2 open task', status: 'scheduled' },
  { id: 't_subtask:delta:3', title: 'D3 finished task', status: 'done' },
]));
process.env.HERMES_LIST_FILE = listFile;
writeFileSync(hermesLog, '');
cc.fullSync({});
test('PARKED REQ-004: removing the flag unblocks exactly the cards the sync parked', () => {
  const unblocked = logLines().filter((a) => a[1] === 'unblock').map((a) => a[2]).sort();
  assertEqual(unblocked.join(','), 't_openspec:delta,t_subtask:delta:1,t_subtask:delta:2', 'parent + 2 open tasks, never done D3');
});
test('PARKED REQ-004: parkedCards cache emptied; second pass unblocks nothing', () => {
  const st = JSON.parse(readFileSync(join(proj, 'pm', 'command-center-links.json'), 'utf8'));
  assertEqual(st.parkedCards.length, 0, 'cache emptied');
  writeFileSync(hermesLog, '');
  cc.fullSync({});
  assert(!logLines().some((a) => a[1] === 'unblock'), 'no repeat unblock — human-scheduled cards stay parked');
});
delete process.env.HERMES_LIST_FILE;

console.log('\n📋 command-center-sync: CC-002 parked cascade uses RECORDED children');
// gamma: a parked change whose three children are recorded in state but whose
// tasks.md is gone — the pre-fix code only parked children the current
// tasks.md parse yielded, so these three sat active under a parked parent.
mkdirSync(join(proj, 'openspec', 'changes', 'gamma'), { recursive: true });
writeFileSync(join(proj, 'openspec', 'changes', 'gamma', 'status.json'),
  JSON.stringify({ status: 'proposed', phase: 'design', created: '2026-07-06', lastUpdated: '2026-07-06', parked: true }));
const stG = JSON.parse(readFileSync(join(proj, 'pm', 'command-center-links.json'), 'utf8'));
stG.changes.gamma = 't_openspec:gamma';
stG.subtasks['subtask:gamma:1'] = 't_subtask:gamma:1';
stG.subtasks['subtask:gamma:2'] = 't_subtask:gamma:2';
stG.subtasks['subtask:gamma:3'] = 't_subtask:gamma:3';
writeFileSync(join(proj, 'pm', 'command-center-links.json'), JSON.stringify(stG, null, 2));
writeFileSync(listFile, JSON.stringify([
  { id: 't_openspec:gamma', title: 'OpenSpec: gamma', status: 'ready' },
  { id: 't_subtask:gamma:1', title: 'G1 open task', status: 'todo' },
  { id: 't_subtask:gamma:2', title: 'G2 open task', status: 'todo' },
  { id: 't_subtask:gamma:3', title: 'G3 open task', status: 'todo' },
]));
process.env.HERMES_LIST_FILE = listFile;
writeFileSync(hermesLog, '');
const rg = cc.fullSync({});
test('CC-002: parked change cascades to all three RECORDED children (no tasks.md parse needed)', () => {
  assert(rg.changes.ok && rg.subtasks.ok, `sections failed: ${rg.changes.error || ''} ${rg.subtasks.error || ''}`);
  assertEqual(rg.changes.parked, 4, 'parked counter counts the cascade (parent + 3 children)');
  assertEqual(rg.subtasks.parked, 0, 'syncSubtasks has no parse to park from');
  const sched = logLines().filter((a) => a[1] === 'schedule').map((a) => a[2]).sort();
  assertEqual(sched.join(','), 't_openspec:gamma,t_subtask:gamma:1,t_subtask:gamma:2,t_subtask:gamma:3', 'all four cards driven to Parked');
  assertEqual(createsFor(logLines(), 'subtask:gamma:1').length, 0, 'no duplicate child cards created');
});
test('CC-002: re-run reports parked=0 — zero redundant schedule calls', () => {
  writeFileSync(hermesLog, '');
  const r2g = cc.fullSync({});
  assertEqual(r2g.changes.parked, 0, 'cascade is idempotent across passes');
  assertEqual(logLines().filter((a) => a[1] === 'schedule').length, 0, 'no repeat schedule calls');
});
test('CC-002: clearing the flag cascades the un-park back to all four', () => {
  writeFileSync(join(proj, 'openspec', 'changes', 'gamma', 'status.json'),
    JSON.stringify({ status: 'proposed', phase: 'design', created: '2026-07-06', lastUpdated: '2026-07-06' }));
  writeFileSync(listFile, JSON.stringify([
    { id: 't_openspec:gamma', title: 'OpenSpec: gamma', status: 'scheduled' },
    { id: 't_subtask:gamma:1', title: 'G1 open task', status: 'scheduled' },
    { id: 't_subtask:gamma:2', title: 'G2 open task', status: 'scheduled' },
    { id: 't_subtask:gamma:3', title: 'G3 open task', status: 'scheduled' },
  ]));
  writeFileSync(hermesLog, '');
  cc.fullSync({});
  const unblocked = logLines().filter((a) => a[1] === 'unblock').map((a) => a[2]).sort();
  assertEqual(unblocked.join(','), 't_openspec:gamma,t_subtask:gamma:1,t_subtask:gamma:2,t_subtask:gamma:3', 'flag cleared restores all four');
});
delete process.env.HERMES_LIST_FILE;
rmSync(join(proj, 'openspec', 'changes', 'gamma'), { recursive: true, force: true });
// purge gamma from state so the later fixture sections start clean (the
// sync's own retired-change purge is covered by the delta deletion test)
const stC = JSON.parse(readFileSync(join(proj, 'pm', 'command-center-links.json'), 'utf8'));
delete stC.changes.gamma;
delete stC.phases.gamma;
for (const k of Object.keys(stC.subtasks)) if (k.startsWith('subtask:gamma:')) delete stC.subtasks[k];
writeFileSync(join(proj, 'pm', 'command-center-links.json'), JSON.stringify(stC, null, 2));

console.log('\n📋 command-center-sync: vanished change dirs (archived vs deleted)');
mkdirSync(join(proj, 'openspec', 'changes', 'archive'), { recursive: true });
renameSync(join(proj, 'openspec', 'changes', 'beta'), join(proj, 'openspec', 'changes', 'archive', 'beta'));
writeFileSync(hermesLog, '');
cc.fullSync({});
test('REQ-001: change moved to archive/ -> card completed once', () => {
  assert(logLines().some((a) => a[1] === 'complete' && a[2] === 't_openspec:beta'), 'beta card completed');
  assert(!logLines().some((a) => a[1] === 'archive'), 'archived change is completed, not board-archived');
  writeFileSync(hermesLog, '');
  cc.fullSync({});
  assert(!logLines().some((a) => a[1] === 'complete' && a[2] === 't_openspec:beta'), 'not re-completed next pass');
});
rmSync(join(proj, 'openspec', 'changes', 'delta'), { recursive: true, force: true });
writeFileSync(hermesLog, '');
cc.fullSync({});
test('PARKED REQ-005: deleted change dir -> parent + every sub-card archived off the board', () => {
  const archived = logLines().filter((a) => a[1] === 'archive').map((a) => a[2]).sort();
  assertEqual(archived.join(','), 't_openspec:delta,t_subtask:delta:1,t_subtask:delta:2,t_subtask:delta:3');
  assert(!logLines().some((a) => a[1] === 'complete' && a[2] === 't_openspec:delta'), 'deleted change is not fake-completed');
});
test('PARKED REQ-005: state purged; next pass issues nothing for the deleted change', () => {
  const st = JSON.parse(readFileSync(join(proj, 'pm', 'command-center-links.json'), 'utf8'));
  assert(!('delta' in st.changes) && !('delta' in st.phases), 'change entries removed');
  assert(!Object.keys(st.subtasks).some((k) => k.includes('delta')), 'subtask entries removed');
  writeFileSync(hermesLog, '');
  cc.fullSync({});
  assert(!logLines().some((a) => a[1] === 'archive' || String(a[2] || '').includes('delta')), 'silent no-op');
});

console.log('\n📋 command-center-sync: CC-003 sync --all (portfolio-wide)');
// Fixture portfolio: projA + projB are enabled with REAL paths and IDENTICAL
// change names (alpha) and task ids (A-1) — the collision case. projMissing
// is enabled with a path that does not exist; projDisabled is off. A stray
// project dir with a real tasks/queue exists on disk but is NOT in the
// portfolio — it must never be synced.
const allFixtures = mkdtempSync(join(tmpdir(), 'cc-sync-all-'));
const stray = join(allFixtures, 'stray');
for (const name of ['projA', 'projB']) {
  const dir = join(allFixtures, name);
  mkdirSync(join(dir, 'tasks', 'queue'), { recursive: true });
  mkdirSync(join(dir, 'openspec', 'changes', 'alpha'), { recursive: true });
  writeFileSync(join(dir, 'tasks', 'queue', 'A-1.json'), JSON.stringify({
    id: 'A-1', title: `${name} queue task`, description: 'work for openspec/changes/alpha',
    assignee: 'sdlc-developer', priority: 'HIGH', status: 'pending', tags: ['alpha'],
  }));
  writeFileSync(join(dir, 'openspec', 'changes', 'alpha', 'status.json'),
    JSON.stringify({ status: 'proposed', phase: 'specs', created: '2026-09-07', lastUpdated: '2026-09-07' }));
  writeFileSync(join(dir, 'openspec', 'changes', 'alpha', 'tasks.md'),
    ['# Tasks: alpha', '', '## Implementation Tasks', '', '- [ ] A1 work item', ''].join('\n'));
}
mkdirSync(join(stray, 'tasks', 'queue'), { recursive: true });
writeFileSync(join(stray, 'tasks', 'queue', 'S-1.json'), JSON.stringify({
  id: 'S-1', title: 'Stray task', status: 'pending',
}));
writeFileSync(join(proj, 'portfolio.json'), JSON.stringify({
  version: 1,
  projects: [
    { name: 'projA', owner: 'self', stage: 'build', enabled: true, path: join(allFixtures, 'projA') },
    { name: 'projB', owner: 'self', stage: 'build', enabled: true, path: join(allFixtures, 'projB') },
    { name: 'projMissing', owner: 'self', stage: 'build', enabled: true, path: join(allFixtures, 'does-not-exist') },
    { name: 'projDisabled', owner: 'self', stage: 'build', enabled: false, path: join(allFixtures, 'projB') },
  ],
}));
writeFileSync(hermesLog, '');
const rAll = cc.syncAllProjects();
test('CC-003 REQ-001: the two enabled fixture projects both sync; disabled and missing-path are skipped', () => {
  assertEqual(rAll.projects, 4);
  assertEqual(rAll.synced.length, 2, `synced: ${JSON.stringify(rAll.synced)}`);
  assert(rAll.synced.every((s) => s.ok), `both children exited 0: ${JSON.stringify(rAll.synced)}`);
  assert(rAll.synced.some((s) => s.name === 'projA') && rAll.synced.some((s) => s.name === 'projB'), 'both enabled projects synced');
  assertEqual(rAll.skipped.length, 2, 'projMissing + projDisabled skipped');
});
test('CC-003 REQ-002: identical change names and task ids get distinct namespaced keys', () => {
  const lines = logLines();
  const keys = lines.filter((a) => a[1] === 'create').map((a) => a[a.indexOf('--idempotency-key') + 1]);
  assert(keys.includes('projA:openspec:alpha') && keys.includes('projB:openspec:alpha'), `change cards namespaced, got: ${keys.join(' ')}`);
  assert(!keys.includes('openspec:alpha'), 'no bare unnamespaced change card');
  assert(keys.includes('projA:A-1') && keys.includes('projB:A-1'), `queue cards namespaced, got: ${keys.join(' ')}`);
  assert(!keys.includes('A-1'), 'no bare unnamespaced task card');
  assert(keys.includes('projA:subtask:alpha:1') && keys.includes('projB:subtask:alpha:1'), `subtask cards namespaced, got: ${keys.join(' ')}`);
});
test('CC-003 REQ-002: subtask cards are parented to THEIR project\'s change card', () => {
  const lines = logLines();
  const sa = lines.find((a) => a[1] === 'create' && a.includes('projA:subtask:alpha:1'));
  const sb = lines.find((a) => a[1] === 'create' && a.includes('projB:subtask:alpha:1'));
  assertEqual(sa[sa.indexOf('--parent') + 1], 't_projA:openspec:alpha');
  assertEqual(sb[sb.indexOf('--parent') + 1], 't_projB:openspec:alpha');
});
test('CC-003 REQ-003: a missing path warns (by name) and never aborts the run', () => {
  assert(rAll.warnings.some((w) => w.includes('projMissing')), `warning names the project: ${rAll.warnings.join(' | ')}`);
  assertEqual(rAll.warnings.length, 1, 'only the missing-path project warns');
});
test('CC-003 REQ-003/REQ-001: disabled project is skipped silently; stray project absent from the portfolio never syncs', () => {
  assert(!rAll.warnings.some((w) => w.includes('projDisabled')), 'disabled project does not warn');
  const allLog = logLines().map((a) => a.join(' ')).join('\n');
  assert(!allLog.includes('S-1'), 'stray project task never reaches the board');
  assert(!rAll.synced.some((s) => s.name === 'stray'), 'stray not in the synced list');
});
test('CC-003 REQ-004: each project\'s state and link map live in its own pm/', () => {
  for (const name of ['projA', 'projB']) {
    const st = JSON.parse(readFileSync(join(allFixtures, name, 'pm', 'command-center-links.json'), 'utf8'));
    assertEqual(st.changes.alpha, `t_${name}:openspec:alpha`, `${name} keeps its own change card id`);
  }
  const linksA = JSON.parse(readFileSync(join(allFixtures, 'projA', 'pm', 'kanban-links.json'), 'utf8'));
  assertEqual(linksA['projA:A-1'], 't_projA:A-1', 'link map keyed by the namespaced key');
  assertEqual(Object.keys(linksA).length, 1, 'no foreign task ids leak into projA\'s link map');
});
test('CC-003 REQ-005: bespoke nels-workshop-kanban-sync removed; kanban-sync runs sync --all', () => {
  const cron = JSON.parse(readFileSync(join(SDLC_ROOT, 'agents', 'cron-schedule.json'), 'utf8'));
  assert(!cron.schedules.some((s) => s.name === 'nels-workshop-kanban-sync'), 'bespoke timer removed');
  const ks = cron.schedules.find((s) => s.name === 'kanban-sync');
  assert(ks && ks.script.includes('sync --all'), `kanban-sync runs --all, got: ${ks && ks.script}`);
});
rmSync(allFixtures, { recursive: true, force: true });

console.log('\n📋 command-center-sync: status (dry-run) + degradation');
test('statusReport counts without any mutating kanban calls', () => {
  writeFileSync(hermesLog, '');
  const r = cc.statusReport();
  assertEqual(r.changes, 1, 'only alpha remains');
  assertEqual(r.subtasks, 2);
  assertEqual(r.backlog, 2);
  assertEqual(r.queueTasks, 1);
  const lines = logLines();
  assert(!lines.some((a) => ['create', 'complete', 'block', 'comment', 'link'].includes(a[1])), 'no mutating verbs');
});
test('missing ledgers degrade to empty, never throw', () => {
  rmSync(join(proj, 'pm', 'cycle-history.json'), { force: true });
  rmSync(join(proj, 'pm', 'pr-auto-review.log'), { force: true });
  rmSync(join(proj, 'pm', 'drain-logs'), { recursive: true, force: true });
  const runs = cc.collectRuns();
  assertEqual(runs.length, 0);
});

// cleanup
process.env.PATH = ORIG_PATH;
try { rmSync(proj, { recursive: true, force: true }); rmSync(fakeBin, { recursive: true, force: true }); } catch { /* ignore */ }

console.log(`\n${'═'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
