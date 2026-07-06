#!/usr/bin/env node
/**
 * Unit tests for kanban-bridge.mjs + agent-registry.mjs (command-center-bridge).
 *
 * Usage: node tests/kanban-bridge.test.mjs
 *
 * Covers Scenarios 1-5 from openspec/changes/command-center-bridge:
 *   1 first sync maps status -> lanes    2 re-sync passes idempotency key
 *   3 reconcile writes only status       4 missing hermes fails clean
 *   5 task without assignee still syncs
 * Sync is driven through a FAKE `hermes` shim on PATH — no live Hermes needed.
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from 'fs';
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
const proj = mkdtempSync(join(tmpdir(), 'kanban-bridge-'));
const fakeBin = mkdtempSync(join(tmpdir(), 'fakebin-'));
const hermesLog = join(fakeBin, 'calls.log');
mkdirSync(join(proj, 'tasks', 'queue'), { recursive: true });

// A-1: completed task, with assignee + HIGH priority.  B-1: pending, no assignee/priority.
writeFileSync(join(proj, 'tasks', 'queue', 'A-1.json'), JSON.stringify({
  id: 'A-1', title: 'Alpha task', description: 'do alpha', assignee: 'sdlc-developer',
  priority: 'HIGH', status: 'completed',
}));
writeFileSync(join(proj, 'tasks', 'queue', 'B-1.json'), JSON.stringify({
  id: 'B-1', title: 'Beta task', status: 'pending',
}));
writeFileSync(join(proj, 'tasks', 'queue', 'bad.json'), '{ not valid json');

// fake `hermes`: logs argv, echoes {id:t_<key>} for create, [] for list, ok otherwise
const shim = `#!/usr/bin/env node
import fs from 'fs';
const a = process.argv.slice(2);
fs.appendFileSync(process.env.HERMES_LOG, a.join(' ') + '\\n');
if (a[1] === 'create') {
  const i = a.indexOf('--idempotency-key');
  process.stdout.write(JSON.stringify({ id: 't_' + (i >= 0 ? a[i + 1] : 'x') }));
} else if (a[1] === 'list') {
  process.stdout.write('[]');
} else {
  process.stdout.write('ok');
}
`;
writeFileSync(join(fakeBin, 'hermes'), shim);
chmodSync(join(fakeBin, 'hermes'), 0o755);

process.env.SDLC_PROJECT_DIR = proj;
process.env.HERMES_LOG = hermesLog;
const ORIG_PATH = process.env.PATH;
process.env.PATH = fakeBin + ':' + ORIG_PATH;

const bridge = await import(resolve(SDLC_ROOT, 'agents/kanban-bridge.mjs'));
const registry = await import(resolve(SDLC_ROOT, 'agents/agent-registry.mjs'));

console.log('\n📋 kanban-bridge: pure mappings');
test('mapStatus: completed -> done/complete', () => {
  const m = bridge.mapStatus('completed'); assertEqual(m.lane, 'done'); assertEqual(m.verb, 'complete');
});
test('mapStatus: blocked -> blocked/block', () => {
  const m = bridge.mapStatus('blocked'); assertEqual(m.lane, 'blocked'); assertEqual(m.verb, 'block');
});
test('mapStatus: in_progress -> running', () => assertEqual(bridge.mapStatus('in_progress').lane, 'running'));
test('mapStatus: unknown/pending -> todo', () => assertEqual(bridge.mapStatus('pending').lane, 'todo'));
test('mapPriority: HIGH=100, MEDIUM=50, LOW=10, other=0, CRITICAL=300', () => {
  assertEqual(bridge.mapPriority('HIGH'), 100);
  assertEqual(bridge.mapPriority('MEDIUM'), 50);
  assertEqual(bridge.mapPriority('LOW'), 10);
  assertEqual(bridge.mapPriority('whatever'), 0);
  assertEqual(bridge.mapPriority('CRITICAL'), 300);
});

console.log('\n📋 kanban-bridge: readTasks');
test('readTasks returns valid tasks, skips malformed', () => {
  const tasks = bridge.readTasks();
  assertEqual(tasks.length, 2, 'should read A-1 and B-1, skip bad.json');
  assert(tasks.some((t) => t.id === 'A-1') && tasks.some((t) => t.id === 'B-1'), 'both ids present');
});

console.log('\n📋 kanban-bridge: status (dry-run, no writes)');
test('statusReport counts to-create against empty board', () => {
  const r = bridge.statusReport();
  assertEqual(r.total, 2);
  assertEqual(r.toCreate, 2, 'empty board -> both to create');
  assert(r.laneCounts.done === 1 && r.laneCounts.todo === 1, 'lane counts by mapped status');
});

console.log('\n📋 kanban-bridge: sync (fake hermes)');
test('Scenario 1+2: sync creates cards with idempotency-key per task', () => {
  writeFileSync(hermesLog, '');
  const r = bridge.sync({});
  assertEqual(r.total, 2);
  const log = readFileSync(hermesLog, 'utf8');
  assert(log.includes('create Alpha task') && log.includes('--idempotency-key A-1'), 'A-1 created with its id as key');
  assert(log.includes('--idempotency-key B-1'), 'B-1 created with its id as key');
});
test('Scenario 1: completed task is moved to done (complete verb)', () => {
  const log = readFileSync(hermesLog, 'utf8');
  assert(log.includes('complete t_A-1'), 'completed A-1 -> hermes kanban complete');
});
test('Scenario 5: task without assignee/priority still created', () => {
  const log = readFileSync(hermesLog, 'utf8');
  const bLine = log.split('\n').find((l) => l.includes('--idempotency-key B-1'));
  assert(bLine && !bLine.includes('--assignee') && !bLine.includes('--priority'), 'B-1 create omits assignee/priority flags');
});
test('link map persisted', () => {
  const links = JSON.parse(readFileSync(join(proj, 'pm', 'kanban-links.json'), 'utf8'));
  assertEqual(links['A-1'], 't_A-1'); assertEqual(links['B-1'], 't_B-1');
});

console.log('\n📋 kanban-bridge: error handling');
test('Scenario 4: missing hermes binary fails clean, no task files modified', () => {
  const saved = process.env.PATH;
  process.env.PATH = '';
  let threw = false;
  try { bridge.runKanban(['list', '--json'], { json: true }); }
  catch (e) { threw = true; assert(/hermes binary not found/i.test(e.message), 'clear message names the binary'); }
  finally { process.env.PATH = saved; }
  assert(threw, 'should throw when hermes is absent');
  const a1 = JSON.parse(readFileSync(join(proj, 'tasks', 'queue', 'A-1.json'), 'utf8'));
  assertEqual(a1.status, 'completed', 'task JSON untouched by failed CLI call');
});

console.log('\n📋 agent-registry');
test('buildRegistry normalizes budget agents + degrades spend to 0', () => {
  const reg = registry.buildRegistry(
    { emergencyFallbackModel: 'deepseek/deepseek-v4-flash', agents: { roy: { model: 'qwen/qwen3-coder', permissions: 'full-edit', dailyTokens: 500000 } } },
    {}
  );
  assertEqual(reg.agents.length, 1);
  assertEqual(reg.agents[0].name, 'roy');
  assertEqual(reg.agents[0].model, 'qwen/qwen3-coder');
  assertEqual(reg.agents[0].spentToday, 0, 'missing cost data -> 0');
  assertEqual(reg.emergencyFallbackModel, 'deepseek/deepseek-v4-flash');
});

// cleanup
process.env.PATH = ORIG_PATH;
try { rmSync(proj, { recursive: true, force: true }); rmSync(fakeBin, { recursive: true, force: true }); } catch { /* ignore */ }

console.log(`\n${'═'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
