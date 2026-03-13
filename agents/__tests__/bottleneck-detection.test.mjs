/**
 * bottleneck-detection.test.mjs
 *
 * Tests for task 15.3: bottleneck detected when majority of blocked
 * tasks await human; not detected when blocks are technical.
 *
 * Run with:
 *   node --test agents/__tests__/bottleneck-detection.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Bottleneck detection logic extracted from daily-review.mjs.
 * Returns { isBottleneck, staleCount, humanBlockedRatio }
 */
function detectBottleneck(humanTasks, blockedTasks) {
  const pendingHumanTasks = humanTasks.filter(ht => ht.status === 'pending');
  const staleHumanTasks = pendingHumanTasks.filter(ht => {
    if (!ht.createdAt) return false;
    const ageMs = Date.now() - new Date(ht.createdAt).getTime();
    return ageMs > 24 * 60 * 60 * 1000;
  });

  if (staleHumanTasks.length === 0) {
    return { isBottleneck: false, staleCount: 0, humanBlockedRatio: 0 };
  }

  const humanBlockedCount = pendingHumanTasks.reduce(
    (sum, ht) => sum + (ht.unblocks?.length || 0), 0
  );
  const totalBlocked = blockedTasks.length + humanBlockedCount;
  const ratio = totalBlocked > 0 ? humanBlockedCount / totalBlocked : 0;

  return {
    isBottleneck: ratio > 0.5,
    staleCount: staleHumanTasks.length,
    humanBlockedRatio: ratio,
  };
}

describe('Bottleneck detection', () => {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  it('detects bottleneck when majority of blocks are human tasks', () => {
    const humanTasks = [
      { id: 'HTASK-001', status: 'pending', createdAt: twoDaysAgo, unblocks: ['T-001', 'T-002', 'T-003'] },
    ];
    const blockedTasks = [{ id: 'T-004', status: 'pending' }]; // 1 technical block

    const result = detectBottleneck(humanTasks, blockedTasks);
    assert.equal(result.isBottleneck, true);
    assert.equal(result.staleCount, 1);
    assert.ok(result.humanBlockedRatio > 0.5);
  });

  it('does not detect bottleneck when blocks are mostly technical', () => {
    const humanTasks = [
      { id: 'HTASK-001', status: 'pending', createdAt: twoDaysAgo, unblocks: ['T-001'] },
    ];
    const blockedTasks = [
      { id: 'T-002' }, { id: 'T-003' }, { id: 'T-004' }, { id: 'T-005' },
    ]; // 4 technical blocks vs 1 human block

    const result = detectBottleneck(humanTasks, blockedTasks);
    assert.equal(result.isBottleneck, false);
    assert.ok(result.humanBlockedRatio <= 0.5);
  });

  it('does not detect bottleneck when no stale human tasks', () => {
    const humanTasks = [
      { id: 'HTASK-001', status: 'pending', createdAt: oneHourAgo, unblocks: ['T-001', 'T-002'] },
    ];
    const blockedTasks = [];

    const result = detectBottleneck(humanTasks, blockedTasks);
    assert.equal(result.isBottleneck, false);
    assert.equal(result.staleCount, 0);
  });

  it('does not detect bottleneck when human tasks are completed', () => {
    const humanTasks = [
      { id: 'HTASK-001', status: 'completed', createdAt: twoDaysAgo, unblocks: ['T-001'] },
    ];
    const blockedTasks = [{ id: 'T-002' }];

    const result = detectBottleneck(humanTasks, blockedTasks);
    assert.equal(result.isBottleneck, false);
  });

  it('handles empty inputs gracefully', () => {
    const result = detectBottleneck([], []);
    assert.equal(result.isBottleneck, false);
    assert.equal(result.staleCount, 0);
    assert.equal(result.humanBlockedRatio, 0);
  });

  it('multiple stale human tasks compound the bottleneck', () => {
    const humanTasks = [
      { id: 'HTASK-001', status: 'pending', createdAt: twoDaysAgo, unblocks: ['T-001', 'T-002'] },
      { id: 'HTASK-002', status: 'pending', createdAt: twoDaysAgo, unblocks: ['T-003'] },
    ];
    const blockedTasks = []; // 0 technical blocks, 3 human blocks

    const result = detectBottleneck(humanTasks, blockedTasks);
    assert.equal(result.isBottleneck, true);
    assert.equal(result.staleCount, 2);
    assert.equal(result.humanBlockedRatio, 1);
  });
});
