/**
 * seed-queue-from-openspec.mjs — the openspec → queue path.
 *
 * WHY: this script had never seeded a single task. Two independent bugs, each
 * of which silently produced "Tasks would create: 0" — indistinguishable from
 * "there is nothing to do":
 *
 *   1. The status gate demanded `status === 'active' && phase === 'tasks'`.
 *      Nothing in the framework has ever used those values, including the
 *      status.json.template it ships ("proposed"/"proposal").
 *   2. The task parser only matched `## Task N: Title` headings, while
 *      MISSION_PLAYBOOK, tasks.md.template, and every real tasks.md use the
 *      `- [ ] **T1**: Title` bullet form.
 *
 * Together they meant an agent could author a perfectly correct OpenSpec change
 * and get an empty queue, leaving hand-written queue JSON as the only path —
 * which is exactly the thing agents are supposed to do for themselves.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSeedable } from '../agents/seed-queue-from-openspec.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO, 'agents', 'seed-queue-from-openspec.mjs');

// --- the status gate ---------------------------------------------------------

test('the vocabulary real changes actually use is seedable', () => {
  // Every one of these appears in openspec/changes/*/status.json today, and
  // every one was rejected by the old gate.
  for (const s of [
    { status: 'in-progress', phase: 'implement' },
    { status: 'proposed', phase: 'implement' },
    { status: 'active', phase: 'tasks' },
  ]) {
    assert.equal(isSeedable(s), true, JSON.stringify(s));
  }
});

test('finished work is not re-seeded', () => {
  for (const s of [
    { status: 'implemented', phase: 'verify', readiness: 'ready-for-dev' },
    { status: 'complete', phase: 'done' },
    { status: 'archived', phase: 'archive' },
    { status: 'cancelled', phase: 'implement' },
    { status: 'in-progress', phase: 'verify' },
  ]) {
    assert.equal(isSeedable(s), false, JSON.stringify(s));
  }
});

test('work that has no tasks yet is not seeded', () => {
  for (const s of [
    { status: 'proposed', phase: 'proposal' },
    { status: 'proposed', phase: 'design' },
    { status: 'proposed', phase: 'planning' },
  ]) {
    assert.equal(isSeedable(s), false, JSON.stringify(s));
  }
});

test('unrecognised vocabulary defaults to seedable, not silently dropped', () => {
  // Failing loud is recoverable; silently seeding nothing is what hid this for
  // as long as it did.
  assert.equal(isSeedable({ status: 'wip', phase: 'building' }), true);
  assert.equal(isSeedable({}), true);
});

// --- the task parser ---------------------------------------------------------

// Default fixture status is authorized. Readiness defaults to `draft` in the
// seeder (openspec: business-os / work-item-readiness REQ-001) so that merely
// authoring a change never authorizes an agent to build it; these fixtures test
// the parser and phase gate, so they opt in explicitly. The unauthorized path
// has its own coverage in tests/seed-queue-readiness.test.mjs and below.
function seedFixture(tasksMd, status = { status: 'in-progress', phase: 'implement', readiness: 'ready-for-dev' }) {
  const dir = mkdtempSync(join(tmpdir(), 'seed-fixture-'));
  try {
    mkdirSync(join(dir, 'agents'), { recursive: true });
    mkdirSync(join(dir, 'tasks', 'queue'), { recursive: true });
    const change = join(dir, 'openspec', 'changes', 'demo');
    mkdirSync(change, { recursive: true });
    writeFileSync(join(dir, 'agents', 'project.json'), JSON.stringify({
      projectName: 'fixture', agents: ['backend'], tasksDir: 'tasks/queue',
    }));
    writeFileSync(join(change, 'status.json'), JSON.stringify(status));
    writeFileSync(join(change, 'tasks.md'), tasksMd);
    writeFileSync(join(change, 'proposal.md'), '# Proposal: demo\n');
    const out = execFileSync('node', [SCRIPT, '--project-dir', dir, '--dry-run'], { encoding: 'utf8' });
    const m = out.match(/Tasks would create:\s*(\d+)/);
    return { count: m ? Number(m[1]) : -1, out };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the bullet form MISSION_PLAYBOOK documents is parsed', () => {
  const { count, out } = seedFixture(`# Tasks — demo

## Implementation
- [ ] **T1**: first task
  - Complexity: S · Spec: REQ-001
- [ ] **T2**: second task
  - Complexity: M · Spec: REQ-002
`);
  assert.equal(count, 2, out);
});

test('the heading form still works', () => {
  const { count, out } = seedFixture(`# Tasks — demo

## Task 1: heading style
- [ ] subtask
`);
  assert.equal(count, 1, out);
});

test('both forms in one file are picked up', () => {
  const { count, out } = seedFixture(`# Tasks — demo

- [ ] **T1**: bullet
  - Complexity: S

## Task 2: heading
- [ ] subtask
`);
  assert.equal(count, 2, out);
});

test('completed bullets are not re-queued', () => {
  const { count, out } = seedFixture(`# Tasks — demo

- [x] **T1**: already shipped
- [ ] **T2**: still pending
`);
  assert.equal(count, 1, out);
});

test('a change in a terminal phase seeds nothing', () => {
  const { count } = seedFixture(`- [ ] **T1**: pending\n`, { status: 'implemented', phase: 'verify', readiness: 'ready-for-dev' });
  assert.equal(count, 0);
});


test('a change with no readiness seeds nothing, however complete its tasks', () => {
  // Regression for 2026-09-02: nine changes sat in a seedable phase with no
  // readiness field. Enabling the drain would have queued ~43 out-of-scope
  // tasks from level-6-autonomous-activation alone.
  const { count, out } = seedFixture(
    `- [ ] **T-001**: pending\n- [ ] **T-002**: also pending\n`,
    { status: 'in-progress', phase: 'implement' },
  );
  assert.equal(count, 0, out);
  assert.match(out, /not-ready/);
});

test('hyphenated task ids are parsed', () => {
  // The bullet regex used [\w.] which excludes '-', so every tasks.md in this
  // repo (T-001, T-101) reported "no tasks found" for the life of the file.
  const { count, out } = seedFixture(`- [ ] **T-001**: hyphenated\n- [ ] **T-102**: also hyphenated\n`);
  assert.equal(count, 2, out);
});
