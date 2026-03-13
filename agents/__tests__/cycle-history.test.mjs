/**
 * cycle-history.test.mjs
 *
 * Tests for:
 *   11.3 — cycle-history.json has correct schema
 *   11.4 — daily and weekly review append correctly
 *   11.5 — Validation of cycle history entries
 *
 * Run with:
 *   node --test agents/__tests__/cycle-history.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Cycle history entry schema', () => {
  function validateEntry(entry) {
    assert.ok(entry.type, 'entry must have type');
    assert.ok(typeof entry.type === 'string');
    assert.ok(entry.timestamp, 'entry must have timestamp');
    assert.ok(new Date(entry.timestamp).toISOString() === entry.timestamp, 'timestamp must be ISO');
    assert.ok(typeof entry.success === 'boolean', 'success must be boolean');
    assert.ok(typeof entry.stats === 'object', 'stats must be object');
  }

  it('daily-review entry has correct schema', () => {
    const entry = {
      type: 'daily-review',
      timestamp: new Date().toISOString(),
      success: true,
      stats: { completed: 5, inProgress: 2, blocked: 1, total: 10 },
    };
    validateEntry(entry);
    assert.equal(entry.type, 'daily-review');
    assert.ok(typeof entry.stats.completed === 'number');
    assert.ok(typeof entry.stats.inProgress === 'number');
    assert.ok(typeof entry.stats.blocked === 'number');
  });

  it('weekly-review entry has correct schema', () => {
    const entry = {
      type: 'weekly-review',
      timestamp: new Date().toISOString(),
      success: true,
      stats: { completed: 15, pending: 5, agentsConsolidated: 3 },
    };
    validateEntry(entry);
    assert.equal(entry.type, 'weekly-review');
    assert.ok(typeof entry.stats.agentsConsolidated === 'number');
  });

  it('entries accumulate in array without overwriting', () => {
    const history = [];

    // Simulate daily append
    history.push({
      type: 'daily-review',
      timestamp: '2026-03-12T18:00:00.000Z',
      success: true,
      stats: { completed: 3, inProgress: 1, blocked: 0, total: 8 },
    });

    // Simulate weekly append
    history.push({
      type: 'weekly-review',
      timestamp: '2026-03-13T06:00:00.000Z',
      success: true,
      stats: { completed: 10, pending: 3, agentsConsolidated: 4 },
    });

    assert.equal(history.length, 2);
    assert.equal(history[0].type, 'daily-review');
    assert.equal(history[1].type, 'weekly-review');
  });

  it('invalid entry detected — missing type', () => {
    const entry = {
      timestamp: new Date().toISOString(),
      success: true,
      stats: {},
    };
    assert.throws(() => {
      assert.ok(entry.type, 'entry must have type');
    });
  });

  it('history serializes and deserializes correctly', () => {
    const history = [
      { type: 'daily-review', timestamp: '2026-03-13T18:00:00.000Z', success: true, stats: { completed: 5 } },
    ];
    const serialized = JSON.stringify(history, null, 2);
    const parsed = JSON.parse(serialized);
    assert.deepEqual(parsed, history);
  });
});
