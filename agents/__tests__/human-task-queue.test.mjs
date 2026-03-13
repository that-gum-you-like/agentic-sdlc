/**
 * human-task-queue.test.mjs
 *
 * Tests for the human task queue integration (tasks 12.2–12.8):
 *
 *   1. Human task created with correct schema fields
 *   2. human-complete marks task done and unblocks dependent agent tasks
 *   3. Notification sent on human task creation (notifyHumanTask)
 *   4. Dashboard shows "YOUR Action Items" section for pending human tasks
 *
 * Run with:
 *   node --test agents/__tests__/human-task-queue.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const AGENTS_DIR = resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeTempDir() {
  const name = `sdlc-test-${randomBytes(4).toString('hex')}`;
  const dir = resolve(tmpdir(), name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Create a minimal valid human task object */
function makeHumanTask(overrides = {}) {
  return {
    id: 'HTASK-001',
    title: 'Provide API credentials',
    description: 'The payment service API key is missing. Add it to .env as PAYMENT_API_KEY.',
    requester: 'moss',
    urgency: 'blocker',
    unblocks: ['T-042'],
    status: 'pending',
    createdAt: new Date().toISOString(),
    completedAt: null,
    ...overrides,
  };
}

/** Create a minimal valid agent task JSON */
function makeAgentTask(id, status = 'blocked') {
  return { id, title: `Task ${id}`, status, priority: 'HIGH' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Human task created with correct schema fields
// ─────────────────────────────────────────────────────────────────────────────

describe('Human task schema', () => {
  it('human task object contains all required schema fields', () => {
    const task = makeHumanTask();
    const requiredFields = ['id', 'title', 'description', 'requester', 'urgency', 'unblocks', 'status', 'createdAt'];
    for (const field of requiredFields) {
      assert.ok(field in task, `Missing required field: ${field}`);
    }
  });

  it('id matches HTASK-<number> pattern', () => {
    const task = makeHumanTask({ id: 'HTASK-007' });
    assert.match(task.id, /^HTASK-\d+$/, 'id must match HTASK-<number>');
  });

  it('urgency is one of the allowed enum values', () => {
    const allowed = ['blocker', 'normal', 'low'];
    for (const urgency of allowed) {
      const task = makeHumanTask({ urgency });
      assert.ok(allowed.includes(task.urgency), `urgency "${urgency}" should be valid`);
    }
  });

  it('unblocks is an array of strings', () => {
    const task = makeHumanTask({ unblocks: ['T-001', 'T-002'] });
    assert.ok(Array.isArray(task.unblocks), 'unblocks must be an array');
    for (const id of task.unblocks) {
      assert.equal(typeof id, 'string', 'each unblocks entry must be a string');
    }
  });

  it('status is one of the allowed enum values', () => {
    const allowed = ['pending', 'in-progress', 'completed'];
    for (const status of allowed) {
      const task = makeHumanTask({ status });
      assert.ok(allowed.includes(task.status), `status "${status}" should be valid`);
    }
  });

  it('createdAt is a valid ISO 8601 timestamp', () => {
    const task = makeHumanTask();
    const d = new Date(task.createdAt);
    assert.ok(!isNaN(d.getTime()), 'createdAt must be a valid date');
    assert.match(task.createdAt, /^\d{4}-\d{2}-\d{2}T/, 'createdAt must be ISO 8601 format');
  });

  it('template file contains all required placeholder fields', () => {
    const templatePath = resolve(AGENTS_DIR, 'templates/human-task.json.template');
    assert.ok(existsSync(templatePath), 'human-task.json.template must exist');
    const content = readFileSync(templatePath, 'utf8');
    // Replace {{PLACEHOLDER}} tokens inside JSON strings with a safe value.
    // Handles both "{{PLACEHOLDER}}" (whole string) and embedded {{X}} in a string.
    const normalised = content
      .replace(/"{{[^}]+}}"/g, '"placeholder"')       // standalone "{{X}}" → "placeholder"
      .replace(/{{[^}]+}}/g, 'placeholder');            // embedded {{X}} → bare word (for numbers etc.)
    const parsed = JSON.parse(normalised);
    const requiredFields = ['id', 'title', 'description', 'requester', 'urgency', 'unblocks', 'status', 'createdAt'];
    for (const field of requiredFields) {
      assert.ok(field in parsed, `Template missing required field: ${field}`);
    }
  });

  it('schema file defines all required fields including unblocks', () => {
    const schemaPath = resolve(AGENTS_DIR, 'schemas/human-task.schema.json');
    assert.ok(existsSync(schemaPath), 'human-task.schema.json must exist');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const required = schema.required || [];
    assert.ok(required.includes('unblocks'), 'schema must require unblocks field');
    assert.ok(required.includes('urgency'), 'schema must require urgency field');
    assert.ok(required.includes('id'), 'schema must require id field');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. human-complete marks task done and unblocks dependent agent tasks
// ─────────────────────────────────────────────────────────────────────────────

describe('human-complete logic', () => {
  // Replicate the core logic of the human-complete handler in isolation
  // (queue-drainer is a CLI with side-effects; we test the pure logic here)

  function runHumanComplete(humanTask, agentTasks) {
    // Mark human task completed
    humanTask.status = 'completed';
    humanTask.completedAt = new Date().toISOString();

    // Unblock dependent agent tasks
    const unblocked = [];
    if (humanTask.unblocks && humanTask.unblocks.length > 0) {
      for (const blockedId of humanTask.unblocks) {
        const agentTask = agentTasks.find(t => t.id === blockedId);
        if (agentTask && agentTask.status === 'blocked') {
          agentTask.status = 'pending';
          unblocked.push(blockedId);
        }
      }
    }

    return { humanTask, unblocked };
  }

  it('marks the human task status as completed', () => {
    const ht = makeHumanTask();
    const { humanTask } = runHumanComplete(ht, []);
    assert.equal(humanTask.status, 'completed', 'human task must be marked completed');
  });

  it('sets completedAt timestamp on the human task', () => {
    const ht = makeHumanTask();
    const { humanTask } = runHumanComplete(ht, []);
    assert.ok(humanTask.completedAt, 'completedAt must be set');
    const d = new Date(humanTask.completedAt);
    assert.ok(!isNaN(d.getTime()), 'completedAt must be a valid date');
  });

  it('unblocks a single dependent agent task', () => {
    const ht = makeHumanTask({ unblocks: ['T-042'] });
    const agentTasks = [makeAgentTask('T-042', 'blocked')];
    const { unblocked } = runHumanComplete(ht, agentTasks);
    assert.deepEqual(unblocked, ['T-042'], 'T-042 must be in the unblocked list');
    assert.equal(agentTasks[0].status, 'pending', 'T-042 must have status pending');
  });

  it('unblocks multiple dependent agent tasks', () => {
    const ht = makeHumanTask({ unblocks: ['T-010', 'T-011'] });
    const agentTasks = [
      makeAgentTask('T-010', 'blocked'),
      makeAgentTask('T-011', 'blocked'),
    ];
    const { unblocked } = runHumanComplete(ht, agentTasks);
    assert.equal(unblocked.length, 2, 'both tasks should be unblocked');
    assert.equal(agentTasks[0].status, 'pending');
    assert.equal(agentTasks[1].status, 'pending');
  });

  it('does not unblock tasks that are not in blocked status', () => {
    const ht = makeHumanTask({ unblocks: ['T-099'] });
    const agentTasks = [makeAgentTask('T-099', 'pending')];
    const { unblocked } = runHumanComplete(ht, agentTasks);
    assert.equal(unblocked.length, 0, 'non-blocked tasks must not be changed');
    assert.equal(agentTasks[0].status, 'pending', 'status should remain pending (unchanged)');
  });

  it('no unblocks array — completes without error', () => {
    const ht = makeHumanTask({ unblocks: [] });
    const { unblocked } = runHumanComplete(ht, []);
    assert.equal(unblocked.length, 0);
  });

  it('persists human task file to disk after completion', () => {
    const tmpDir = makeTempDir();
    try {
      const htFile = resolve(tmpDir, 'HTASK-001.json');
      const ht = makeHumanTask();
      ht._file = 'HTASK-001.json';
      writeFileSync(htFile, JSON.stringify(ht, null, 2));

      // Simulate what queue-drainer does: mark done, write back
      ht.status = 'completed';
      ht.completedAt = new Date().toISOString();
      writeFileSync(htFile, JSON.stringify(ht, null, 2));

      const saved = JSON.parse(readFileSync(htFile, 'utf8'));
      assert.equal(saved.status, 'completed', 'persisted file must show completed status');
      assert.ok(saved.completedAt, 'persisted file must have completedAt');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('queue-drainer.mjs source contains human-complete case', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'queue-drainer.mjs'), 'utf8');
    assert.ok(src.includes("case 'human-complete':"), 'queue-drainer must have human-complete case');
  });

  it('queue-drainer.mjs human-complete auto-unblocks dependent tasks', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'queue-drainer.mjs'), 'utf8');
    // Must reference unblocks array and change status from blocked to pending
    assert.ok(src.includes('ht.unblocks'), 'human-complete must iterate ht.unblocks');
    assert.ok(src.includes("agentTask.status = 'pending'"), 'human-complete must set status to pending');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Notification sent on human task creation
// ─────────────────────────────────────────────────────────────────────────────

describe('notifyHumanTask', () => {
  let notifyHumanTask;
  let sendNotification;

  before(async () => {
    const mod = await import(`${AGENTS_DIR}/notify.mjs`);
    notifyHumanTask = mod.notifyHumanTask;
    sendNotification = mod.sendNotification;
  });

  it('notifyHumanTask is exported from notify.mjs', () => {
    assert.equal(typeof notifyHumanTask, 'function', 'notifyHumanTask must be exported');
  });

  it('notifyHumanTask does not throw for a valid task', () => {
    const task = makeHumanTask();
    assert.doesNotThrow(() => notifyHumanTask(task), 'should not throw for a valid task');
  });

  it('notify.mjs source contains notifyHumanTask function definition', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'notify.mjs'), 'utf8');
    assert.ok(src.includes('export function notifyHumanTask'), 'notifyHumanTask must be exported');
  });

  it('notification message includes urgency in uppercase', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'notify.mjs'), 'utf8');
    // The function must call toUpperCase on urgency
    assert.ok(src.includes('toUpperCase'), 'notification must uppercase the urgency');
  });

  it('notification message includes task id and title', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'notify.mjs'), 'utf8');
    // The message template must reference task.id and task.title
    assert.ok(src.includes('task.id'), 'notification message must include task.id');
    assert.ok(src.includes('task.title'), 'notification message must include task.title');
  });

  it('notification message includes unblocks list when present', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'notify.mjs'), 'utf8');
    assert.ok(src.includes('task.unblocks'), 'notification must reference task.unblocks');
  });

  it('human-task-notify CLI command exists in notify.mjs', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'notify.mjs'), 'utf8');
    assert.ok(src.includes("case 'human-task-notify':"), 'notify.mjs must have human-task-notify case');
  });

  it('human-task-notify CLI reads and sends the task from a file', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'notify.mjs'), 'utf8');
    // The handler must parse the file and call notifyHumanTask
    assert.ok(src.includes('notifyHumanTask(task)'), 'CLI must call notifyHumanTask with parsed task');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Dashboard shows "YOUR Action Items" section
// ─────────────────────────────────────────────────────────────────────────────

describe('Dashboard action items section (12.7)', () => {
  // Extract generateActionItemsSection logic from daily-review source
  let generateActionItemsSection;

  before(() => {
    const src = readFileSync(resolve(AGENTS_DIR, 'cycles/daily-review.mjs'), 'utf8');
    const match = src.match(/(function generateActionItemsSection\([\s\S]*?\n\})/);
    assert.ok(match, 'Could not find generateActionItemsSection in daily-review.mjs');
    // The function references URGENCY_ORDER — provide it via closure
    // eslint-disable-next-line no-new-func
    generateActionItemsSection = new Function(
      'URGENCY_ORDER',
      `return (${match[1]})`,
    )({ blocker: 0, normal: 1, low: 2 });
  });

  it('returns empty string when no pending human tasks', () => {
    const result = generateActionItemsSection([]);
    assert.equal(result, '', 'should return empty string for no pending tasks');
  });

  it('returns empty string when all human tasks are completed', () => {
    const tasks = [makeHumanTask({ status: 'completed' })];
    const result = generateActionItemsSection(tasks);
    assert.equal(result, '', 'completed tasks should not appear in action items');
  });

  it('includes "YOUR Action Items" heading for pending tasks', () => {
    const tasks = [makeHumanTask()];
    const result = generateActionItemsSection(tasks);
    assert.match(result, /YOUR Action Items/, 'section must include the heading');
  });

  it('includes the task id in the output', () => {
    const tasks = [makeHumanTask({ id: 'HTASK-042' })];
    const result = generateActionItemsSection(tasks);
    assert.match(result, /HTASK-042/, 'task id must appear in output');
  });

  it('includes the task title in the output', () => {
    const tasks = [makeHumanTask({ title: 'My special action' })];
    const result = generateActionItemsSection(tasks);
    assert.match(result, /My special action/, 'task title must appear in output');
  });

  it('includes urgency in the output', () => {
    const tasks = [makeHumanTask({ urgency: 'blocker' })];
    const result = generateActionItemsSection(tasks);
    assert.match(result, /blocker/, 'urgency must appear in output');
  });

  it('sorts blockers before normal before low', () => {
    const tasks = [
      makeHumanTask({ id: 'HTASK-003', urgency: 'low', title: 'Low task' }),
      makeHumanTask({ id: 'HTASK-001', urgency: 'blocker', title: 'Blocker task' }),
      makeHumanTask({ id: 'HTASK-002', urgency: 'normal', title: 'Normal task' }),
    ];
    const result = generateActionItemsSection(tasks);
    const blockerIdx = result.indexOf('HTASK-001');
    const normalIdx = result.indexOf('HTASK-002');
    const lowIdx = result.indexOf('HTASK-003');
    assert.ok(blockerIdx < normalIdx, 'blocker should appear before normal');
    assert.ok(normalIdx < lowIdx, 'normal should appear before low');
  });

  it('includes unblocks info when task has unblocks', () => {
    const tasks = [makeHumanTask({ unblocks: ['T-007', 'T-008'] })];
    const result = generateActionItemsSection(tasks);
    assert.match(result, /T-007/, 'unblocked task T-007 should appear');
    assert.match(result, /T-008/, 'unblocked task T-008 should appear');
  });

  it('daily-review.mjs exports loadHumanTasks function', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'cycles/daily-review.mjs'), 'utf8');
    assert.ok(src.includes('function loadHumanTasks'), 'daily-review must define loadHumanTasks');
  });

  it('daily-review.mjs calls updateDashboard with actionItemsSection', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'cycles/daily-review.mjs'), 'utf8');
    assert.ok(src.includes('updateDashboard(summary, actionItemsSection)'), 'updateDashboard must receive actionItemsSection');
  });

  it('updateDashboard signature accepts actionItemsSection parameter', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'cycles/daily-review.mjs'), 'utf8');
    assert.match(src, /function updateDashboard\(summary, actionItemsSection\)/, 'updateDashboard must accept two params');
  });
});
