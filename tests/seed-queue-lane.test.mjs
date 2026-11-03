/**
 * Lane gate on the OpenSpec → queue seeder.
 * Spec: openspec/changes/curriculum-v2-conformance/specs/autonomous-path-gates.md CV-REQ-039
 *
 * Interactive-lane tasks modify the machinery executing the drain (or need Bryce);
 * queuing them would let the drain claim work it must never do.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDrainLane, parseTasksMd } from '../agents/seed-queue-from-openspec.mjs';

test('hermes and absent lanes seed; interactive and unknown lanes are withheld', () => {
  assert.equal(isDrainLane({}), true, 'legacy tasks.md without lanes still seeds');
  assert.equal(isDrainLane({ lane: 'hermes' }), true);
  assert.equal(isDrainLane({ lane: 'interactive' }), false);
  assert.equal(isDrainLane({ lane: 'hermse' }), false, 'a typo fails closed');
});

test('parseTasksMd reads the Lane line of each task', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lane-'));
  const f = join(dir, 'tasks.md');
  writeFileSync(f, [
    '- [ ] **T-101**: Wire the weekly cycle',
    '  - Files: `agents/cycles/weekly-review.mjs`',
    '  - Lane: hermes',
    '- [ ] **T-102**: Change the drain prompt',
    '  - Lane: Interactive',
    '- [ ] **T-103**: Legacy task with no lane',
    '- [x] **T-104**: Done task',
    '  - Lane: interactive',
  ].join('\n'));
  const tasks = parseTasksMd('x', f);
  assert.deepEqual(tasks.map(t => [t.title.slice(0, 10), t.lane]), [
    ['Wire the w', 'hermes'], ['Change the', 'interactive'], ['Legacy tas', undefined],
  ]);
  assert.deepEqual(tasks.map(isDrainLane), [true, false, true]);
});

test('parseTasksMd reads blocked-by dependencies and remembers checked-off ids', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deps-'));
  const f = join(dir, 'tasks.md');
  writeFileSync(f, [
    '- [x] **CV-001**: Done prerequisite',
    '- [ ] **CV-101**: First',
    '  - Parallel: yes',
    '- [ ] **CV-102**: Second',
    '  - Parallel: blocked-by CV-101, CV-001',
    '- [ ] **T-103**: Legacy T id',
    '  - Parallel: blocked-by T-102',
  ].join('\n'));
  const tasks = parseTasksMd('x', f);
  assert.deepEqual(tasks.map(t => t.blockedByRaw), [undefined, ['CV-101', 'CV-001'], ['-102']]);
  assert.ok(tasks.doneIds.has('CV-001'), 'a dependency on a checked-off task is satisfied');
});
