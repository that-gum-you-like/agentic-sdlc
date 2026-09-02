/**
 * queue-drainer-kind-filter.test.mjs
 *
 * Tests for T-502 (personal-task-lane REQ-002): the drain claims a task only
 * when its `kind` is `code` or absent; `chore`/`note` items are never claimed,
 * never assigned, and never counted toward drain capacity.
 *
 * Run with:
 *   node --test agents/__tests__/queue-drainer-kind-filter.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const AGENTS_DIR = resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers extracted from queue-drainer source (avoids importing the CLI module
// which has top-level side-effects that require a real project on disk).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the `getKind` function from queue-drainer source.
 */
function buildGetKind() {
  const src = readFileSync(resolve(AGENTS_DIR, 'queue-drainer.mjs'), 'utf8');
  const match = src.match(/(function getKind\([\s\S]*?\n\})/);
  assert.ok(match, 'Could not extract getKind from queue-drainer.mjs');
  // eslint-disable-next-line no-new-func
  return new Function(`return (${match[1]})`)();
}

/**
 * Build the `findIndependentTasks` function from queue-drainer source together
 * with the `getKind` and `sortByPriority` helpers and `PRIORITY_ORDER` it
 * depends on.
 */
function buildFindIndependentTasks() {
  const src = readFileSync(resolve(AGENTS_DIR, 'queue-drainer.mjs'), 'utf8');

  const priorityOrderMatch = src.match(/(const PRIORITY_ORDER = \{[\s\S]*?\};)/);
  assert.ok(priorityOrderMatch, 'Could not extract PRIORITY_ORDER from queue-drainer.mjs');

  const sortByPriorityMatch = src.match(/(function sortByPriority\([\s\S]*?\n\})/);
  assert.ok(sortByPriorityMatch, 'Could not extract sortByPriority from queue-drainer.mjs');

  const getKindMatch = src.match(/(function getKind\([\s\S]*?\n\})/);
  assert.ok(getKindMatch, 'Could not extract getKind from queue-drainer.mjs');

  const findIndependentMatch = src.match(/(function findIndependentTasks\([\s\S]*?\n\})/);
  assert.ok(findIndependentMatch, 'Could not extract findIndependentTasks from queue-drainer.mjs');

  const factory = new Function(`
    ${priorityOrderMatch[1]}
    ${sortByPriorityMatch[1]}
    ${getKindMatch[1]}
    ${findIndependentMatch[1]}
    return findIndependentTasks;
  `);

  return factory();
}

/**
 * Make a minimal pending task with an optional kind.
 */
function makeTask(id, kind, blockedBy = []) {
  const task = { id, title: id, description: '', priority: 'MEDIUM', status: 'pending', blockedBy };
  if (kind !== undefined) task.kind = kind;
  return task;
}

/**
 * Simulate a full drain "run": find the independent (ready) code tasks, which
 * is exactly the set the drainer would claim.
 */
function runDrain(tasks) {
  return buildFindIndependentTasks()(tasks);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('queue-drainer kind filter (T-502 / personal-task-lane REQ-002)', () => {

  describe('getKind', () => {
    const getKind = buildGetKind();

    it('absent kind reads as "code"', () => {
      assert.equal(getKind({ id: 'T-1' }), 'code');
      assert.equal(getKind({ id: 'T-1', kind: undefined }), 'code');
    });

    it('explicit kinds pass through', () => {
      assert.equal(getKind({ kind: 'code' }), 'code');
      assert.equal(getKind({ kind: 'chore' }), 'chore');
      assert.equal(getKind({ kind: 'note' }), 'note');
    });
  });

  describe('mixed queue', () => {
    it('claims only code and absent-kind tasks', () => {
      const tasks = [
        makeTask('T-code', 'code'),
        makeTask('T-absent'),                       // absent → code
        makeTask('T-chore', 'chore'),
        makeTask('T-note', 'note'),
      ];

      const drainable = runDrain(tasks);

      const ids = drainable.map(t => t.id).sort();
      assert.deepEqual(ids, ['T-absent', 'T-code']);
    });

    it('excludes chore/note even when they are higher priority', () => {
      const tasks = [
        makeTask('T-chore-high', 'chore', []),
        makeTask('T-note-high', 'note', []),
        makeTask('T-code-low', 'code', []),
      ];
      tasks[0].priority = 'HIGH';
      tasks[1].priority = 'HIGH';
      tasks[2].priority = 'LOW';

      const drainable = runDrain(tasks);
      assert.deepEqual(drainable.map(t => t.id), ['T-code-low']);
    });

    it('respects blockedBy among the drainable code tasks', () => {
      const tasks = [
        makeTask('T-a', 'code'),
        makeTask('T-b', 'code', ['T-a']),
        makeTask('T-c', 'chore'),
      ];

      // T-a completes → T-b unblocks; T-c is chore and never appears.
      tasks[0].status = 'completed';
      const drainable = runDrain(tasks).map(t => t.id).sort();
      assert.deepEqual(drainable, ['T-b']);
    });
  });

  describe('chore/note-only queue', () => {
    it('produces a clean "nothing to drain" — empty result, no error', () => {
      const tasks = [
        makeTask('T-chore-1', 'chore'),
        makeTask('T-chore-2', 'chore'),
        makeTask('T-note-1', 'note'),
      ];

      // Must not throw (no error) and must be empty (clean, no idle-spin).
      const drainable = runDrain(tasks);
      assert.deepEqual(drainable, []);
    });

    it('empty queue stays empty', () => {
      assert.deepEqual(runDrain([]), []);
    });
  });

  describe('status reporting', () => {
    it('reports code and non-code counts separately', () => {
      const src = readFileSync(resolve(AGENTS_DIR, 'queue-drainer.mjs'), 'utf8');
      assert.match(src, /Pending by kind:/, 'status must report a code/non-code split line');
      assert.match(src, /codePending/, 'status must compute the code count');
      assert.match(src, /nonCodePending/, 'status must compute the non-code count');
    });
  });
});