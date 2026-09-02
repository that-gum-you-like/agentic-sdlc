/**
 * Readiness gate on the OpenSpec → queue seeder.
 * Spec: openspec/changes/business-os/specs/work-item-readiness.md REQ-001, REQ-002
 *
 * The property under test: authored is not authorized. A change may be fully
 * specced with tasks written and still be unauthorized for the dev loop.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readinessOf, isReadyForDev, isSeedable, READINESS_STATES }
  from '../agents/seed-queue-from-openspec.mjs';

test('absent readiness resolves to draft, never to ready', () => {
  assert.equal(readinessOf({}), 'draft');
  assert.equal(readinessOf({ readiness: undefined }), 'draft');
  assert.equal(readinessOf({ readiness: null }), 'draft');
  assert.equal(readinessOf({ readiness: '' }), 'draft');
  assert.equal(readinessOf({ readiness: '   ' }), 'draft');
});

test('all five states are recognized, case- and whitespace-insensitively', () => {
  for (const s of READINESS_STATES) {
    assert.equal(readinessOf({ readiness: s }), s);
    assert.equal(readinessOf({ readiness: s.toUpperCase() }), s);
    assert.equal(readinessOf({ readiness: `  ${s}  ` }), s);
  }
});

test('an unrecognized readiness is invalid, not silently permissive', () => {
  for (const bad of ['nonsense', 'ready', 'readyfordev', 'approved', 'yes', '1']) {
    assert.equal(readinessOf({ readiness: bad }), 'invalid');
    assert.equal(isReadyForDev({ readiness: bad }), false);
  }
});

test('only ready-for-dev authorizes the dev loop', () => {
  assert.equal(isReadyForDev({ readiness: 'ready-for-dev' }), true);
  for (const s of ['draft', 'in-dev', 'ready-for-review', 'done']) {
    assert.equal(isReadyForDev({ readiness: s }), false, `${s} must not authorize`);
  }
  assert.equal(isReadyForDev({}), false);
});

test('readiness is orthogonal to phase — specced with tasks is still not authorized', () => {
  // The exact shape that would have flooded the queue on 2026-09-02.
  const specced = { status: 'ready-to-implement', phase: 'tasks' };
  assert.equal(isSeedable(specced), true, 'phase gate alone would let this through');
  assert.equal(isReadyForDev(specced), false, 'readiness gate must still block it');
});

test('a done change is not re-authorized by its phase', () => {
  assert.equal(isReadyForDev({ status: 'in-progress', phase: 'implement', readiness: 'done' }), false);
});
