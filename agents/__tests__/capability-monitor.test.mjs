/**
 * capability-monitor.test.mjs
 *
 * Tests for agents/capability-monitor.mjs (task 4.5):
 *   - Drift detected after driftThreshold consecutive skips
 *   - No drift when skipReason provided on conditional capability
 *   - No drift below threshold
 *   - Scope creep flagged when notExpected capability is used
 *   - Usage rates computed correctly
 *   - Discrepancy detection (agent claims used but no system log entry)
 *
 * Run with:
 *   node --test agents/__tests__/capability-monitor.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the pure functions directly — no file I/O needed for unit tests
const {
  detectDrift,
  detectDiscrepancies,
  computeUsageRates,
} = await import(resolve(__dirname, '../capability-monitor.mjs'));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a completed task JSON with an optional capabilityChecklist.
 */
function makeTask(id, agent, checklist = null, completedAt = null) {
  return {
    id,
    title: `Task ${id}`,
    status: 'completed',
    claimedBy: agent,
    assignee: agent,
    completed_at: completedAt || new Date().toISOString(),
    capabilityChecklist: checklist,
  };
}

/**
 * Build a capabilityChecklist object.
 * @param {string} taskId
 * @param {string} agent
 * @param {Object} caps - e.g. { memoryRecall: { used: true }, defeatTests: { used: false, skipReason: 'n/a' } }
 */
function makeChecklist(taskId, agent, caps) {
  return {
    taskId,
    agent,
    timestamp: new Date().toISOString(),
    capabilities: caps,
  };
}

/**
 * Build a system log entry.
 */
function makeSysEntry(capability, agent, taskId) {
  return {
    timestamp: new Date().toISOString(),
    capability,
    agent,
    taskId,
    script: 'test.mjs',
    command: 'test',
  };
}

const DEFAULT_MON_CONFIG = { enabled: true, driftThreshold: 3, windowSize: 10 };

// ---------------------------------------------------------------------------
// 1. Drift detected after driftThreshold consecutive skips (no skipReason)
// ---------------------------------------------------------------------------

describe('detectDrift — drift detection', () => {
  it('flags drift after 3 consecutive tasks with no system log entry and no skipReason', () => {
    const capConfig = {
      roy: {
        required: ['memoryRecord'],
        conditional: {},
        notExpected: [],
      },
    };

    // 3 tasks, all missing memoryRecord from system log, no skipReason in self-report
    const tasks = [
      makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', { memoryRecord: { used: false } })),
      makeTask('T-002', 'roy', makeChecklist('T-002', 'roy', { memoryRecord: { used: false } })),
      makeTask('T-003', 'roy', makeChecklist('T-003', 'roy', { memoryRecord: { used: false } })),
    ];

    const systemLog = []; // empty — no system log entries

    const alerts = detectDrift(capConfig, systemLog, tasks, DEFAULT_MON_CONFIG);
    const driftAlerts = alerts.filter(a => a.type === 'drift');

    assert.equal(driftAlerts.length, 1, 'should produce exactly one drift alert');
    assert.equal(driftAlerts[0].agent, 'roy');
    assert.equal(driftAlerts[0].capability, 'memoryRecord');
    assert.equal(driftAlerts[0].consecutiveSkips, 3);
  });

  it('flags drift using system log absence even when self-report claims used=true', () => {
    const capConfig = {
      roy: { required: ['memoryRecall'], conditional: {}, notExpected: [] },
    };

    const tasks = [
      makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', { memoryRecall: { used: true } })),
      makeTask('T-002', 'roy', makeChecklist('T-002', 'roy', { memoryRecall: { used: true } })),
      makeTask('T-003', 'roy', makeChecklist('T-003', 'roy', { memoryRecall: { used: true } })),
    ];

    // System log is empty — agent claims used but system has no proof
    const systemLog = [];

    const alerts = detectDrift(capConfig, systemLog, tasks, DEFAULT_MON_CONFIG);
    const driftAlerts = alerts.filter(a => a.type === 'drift');

    // Drift is based on system log — self-report of used=true doesn't override missing log entry
    assert.equal(driftAlerts.length, 1, 'drift should still be flagged when system log is empty');
  });
});

// ---------------------------------------------------------------------------
// 2. No drift when skipReason provided (conditional capability)
// ---------------------------------------------------------------------------

describe('detectDrift — no drift with skipReason', () => {
  it('does not flag drift when skipReason is provided for skipped required capability', () => {
    const capConfig = {
      roy: {
        required: ['semanticSearch'],
        conditional: {},
        notExpected: [],
      },
    };

    const tasks = [
      makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', { semanticSearch: { used: false, skipReason: 'embeddings not installed' } })),
      makeTask('T-002', 'roy', makeChecklist('T-002', 'roy', { semanticSearch: { used: false, skipReason: 'embeddings not installed' } })),
      makeTask('T-003', 'roy', makeChecklist('T-003', 'roy', { semanticSearch: { used: false, skipReason: 'embeddings not installed' } })),
    ];

    const systemLog = [];

    const alerts = detectDrift(capConfig, systemLog, tasks, DEFAULT_MON_CONFIG);
    const driftAlerts = alerts.filter(a => a.type === 'drift');

    assert.equal(driftAlerts.length, 0, 'no drift alert should fire when skipReason is provided');
  });

  it('does not flag drift when conditional capability has skipReason matching condition', () => {
    const capConfig = {
      roy: {
        required: [],
        conditional: { browserE2E: 'when frontend files changed' },
        notExpected: [],
      },
    };

    const tasks = [
      makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', { browserE2E: { used: false, skipReason: 'backend-only change' } })),
      makeTask('T-002', 'roy', makeChecklist('T-002', 'roy', { browserE2E: { used: false, skipReason: 'backend-only change' } })),
      makeTask('T-003', 'roy', makeChecklist('T-003', 'roy', { browserE2E: { used: false, skipReason: 'backend-only change' } })),
    ];

    const systemLog = [];

    const alerts = detectDrift(capConfig, systemLog, tasks, DEFAULT_MON_CONFIG);
    assert.equal(alerts.length, 0, 'no alerts for conditional capability with skipReason');
  });
});

// ---------------------------------------------------------------------------
// 3. No drift below threshold
// ---------------------------------------------------------------------------

describe('detectDrift — no drift below threshold', () => {
  it('does not flag drift for 2 consecutive skips when threshold is 3', () => {
    const capConfig = {
      roy: { required: ['defeatTests'], conditional: {}, notExpected: [] },
    };

    // Only 2 tasks, both skipping defeatTests
    const tasks = [
      makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', { defeatTests: { used: false } })),
      makeTask('T-002', 'roy', makeChecklist('T-002', 'roy', { defeatTests: { used: false } })),
    ];

    const systemLog = [];

    const alerts = detectDrift(capConfig, systemLog, tasks, DEFAULT_MON_CONFIG);
    const driftAlerts = alerts.filter(a => a.type === 'drift');

    assert.equal(driftAlerts.length, 0, 'no drift below threshold of 3');
  });

  it('does not flag drift when capability was used in between skips (non-consecutive)', () => {
    const capConfig = {
      roy: { required: ['defeatTests'], conditional: {}, notExpected: [] },
    };

    // Task order (newest first in detectDrift): T-003 (skip), T-002 (used), T-001 (skip)
    // Consecutive run from most recent: T-003 skip → stops at T-002 used
    const tasks = [
      makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', { defeatTests: { used: false } }), '2026-01-01T00:00:00Z'),
      makeTask('T-002', 'roy', makeChecklist('T-002', 'roy', { defeatTests: { used: true } }), '2026-01-02T00:00:00Z'),
      makeTask('T-003', 'roy', makeChecklist('T-003', 'roy', { defeatTests: { used: false } }), '2026-01-03T00:00:00Z'),
    ];

    // System log: T-002 used defeatTests
    const systemLog = [makeSysEntry('defeatTests', 'roy', 'T-002')];

    const alerts = detectDrift(capConfig, systemLog, tasks, DEFAULT_MON_CONFIG);
    const driftAlerts = alerts.filter(a => a.type === 'drift');

    assert.equal(driftAlerts.length, 0, 'no drift when skips are not consecutive (used in between)');
  });
});

// ---------------------------------------------------------------------------
// 4. Scope creep detected for notExpected capability
// ---------------------------------------------------------------------------

describe('detectDrift — scope creep detection (4.3)', () => {
  it('flags scope creep when notExpected capability is used', () => {
    const capConfig = {
      richmond: {
        required: ['memoryRecall', 'checklistReview'],
        conditional: {},
        notExpected: ['browserE2E', 'openclawBrowser', 'costTracking'],
      },
    };

    const tasks = [
      makeTask('T-010', 'richmond', makeChecklist('T-010', 'richmond', {
        memoryRecall: { used: true },
        checklistReview: { used: true },
        costTracking: { used: true }, // notExpected!
      })),
    ];

    const systemLog = [
      makeSysEntry('memoryRecall', 'richmond', 'T-010'),
      makeSysEntry('checklistReview', 'richmond', 'T-010'),
    ];

    const alerts = detectDrift(capConfig, systemLog, tasks, DEFAULT_MON_CONFIG);
    const scopeAlerts = alerts.filter(a => a.type === 'scopeCreep');

    assert.equal(scopeAlerts.length, 1, 'one scope creep alert expected');
    assert.equal(scopeAlerts[0].agent, 'richmond');
    assert.equal(scopeAlerts[0].capability, 'costTracking');
    assert.equal(scopeAlerts[0].taskId, 'T-010');
  });

  it('does not flag scope creep when notExpected capability is not used', () => {
    const capConfig = {
      richmond: {
        required: ['memoryRecall'],
        conditional: {},
        notExpected: ['costTracking'],
      },
    };

    const tasks = [
      makeTask('T-011', 'richmond', makeChecklist('T-011', 'richmond', {
        memoryRecall: { used: true },
        costTracking: { used: false },
      })),
    ];

    const systemLog = [makeSysEntry('memoryRecall', 'richmond', 'T-011')];

    const alerts = detectDrift(capConfig, systemLog, tasks, DEFAULT_MON_CONFIG);
    assert.equal(alerts.filter(a => a.type === 'scopeCreep').length, 0, 'no scope creep when notExpected not used');
  });
});

// ---------------------------------------------------------------------------
// 5. Usage rates computed correctly (4.4)
// ---------------------------------------------------------------------------

describe('computeUsageRates', () => {
  it('computes 100% usage rate when capability appears in every task system log', () => {
    const capConfig = {
      roy: {
        required: ['memoryRecall'],
        conditional: {},
        notExpected: [],
      },
    };

    const tasks = [
      makeTask('T-001', 'roy'),
      makeTask('T-002', 'roy'),
      makeTask('T-003', 'roy'),
    ];

    const systemLog = [
      makeSysEntry('memoryRecall', 'roy', 'T-001'),
      makeSysEntry('memoryRecall', 'roy', 'T-002'),
      makeSysEntry('memoryRecall', 'roy', 'T-003'),
    ];

    const rates = computeUsageRates(capConfig, systemLog, tasks, 10);

    assert.ok(rates.roy, 'should have rates for roy');
    assert.ok(rates.roy.memoryRecall, 'should have memoryRecall rate');
    assert.equal(rates.roy.memoryRecall.used, 3);
    assert.equal(rates.roy.memoryRecall.total, 3);
    assert.equal(rates.roy.memoryRecall.rate, 100);
  });

  it('computes 0% usage rate when capability never appears in system log', () => {
    const capConfig = {
      roy: {
        required: ['semanticSearch'],
        conditional: {},
        notExpected: [],
      },
    };

    const tasks = [
      makeTask('T-001', 'roy'),
      makeTask('T-002', 'roy'),
    ];

    const systemLog = []; // no entries

    const rates = computeUsageRates(capConfig, systemLog, tasks, 10);

    assert.ok(rates.roy?.semanticSearch, 'should have semanticSearch rate');
    assert.equal(rates.roy.semanticSearch.used, 0);
    assert.equal(rates.roy.semanticSearch.total, 2);
    assert.equal(rates.roy.semanticSearch.rate, 0);
  });

  it('computes correct partial usage rate (2 out of 4 tasks = 50%)', () => {
    const capConfig = {
      roy: {
        required: ['defeatTests'],
        conditional: {},
        notExpected: [],
      },
    };

    const tasks = [
      makeTask('T-001', 'roy'),
      makeTask('T-002', 'roy'),
      makeTask('T-003', 'roy'),
      makeTask('T-004', 'roy'),
    ];

    const systemLog = [
      makeSysEntry('defeatTests', 'roy', 'T-001'),
      makeSysEntry('defeatTests', 'roy', 'T-003'),
    ];

    const rates = computeUsageRates(capConfig, systemLog, tasks, 10);

    assert.equal(rates.roy.defeatTests.used, 2);
    assert.equal(rates.roy.defeatTests.total, 4);
    assert.equal(rates.roy.defeatTests.rate, 50);
  });

  it('respects windowSize limit', () => {
    const capConfig = {
      roy: { required: ['memoryRecall'], conditional: {}, notExpected: [] },
    };

    // 10 completed tasks, windowSize=5
    const tasks = Array.from({ length: 10 }, (_, i) => {
      const id = `T-${String(i + 1).padStart(3, '0')}`;
      const dt = new Date(2026, 0, i + 1).toISOString();
      return makeTask(id, 'roy', null, dt);
    });

    const systemLog = tasks.map(t => makeSysEntry('memoryRecall', 'roy', t.id));

    const rates = computeUsageRates(capConfig, systemLog, tasks, 5);

    // windowSize=5 means only last 5 tasks are analyzed
    assert.equal(rates.roy.memoryRecall.total, 5, 'total should be capped at windowSize=5');
  });
});

// ---------------------------------------------------------------------------
// 6. Discrepancy detection (4.2b)
// ---------------------------------------------------------------------------

describe('detectDiscrepancies', () => {
  it('flags discrepancy when agent self-reports used=true but system log has no entry', () => {
    const tasks = [
      makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', {
        memoryRecall: { used: true }, // claims used
      })),
    ];

    const systemLog = []; // no system log entry for memoryRecall/roy/T-001

    const discrepancies = detectDiscrepancies(systemLog, tasks);

    assert.equal(discrepancies.length, 1, 'one discrepancy expected');
    assert.equal(discrepancies[0].agent, 'roy');
    assert.equal(discrepancies[0].taskId, 'T-001');
    assert.equal(discrepancies[0].capability, 'memoryRecall');
    assert.ok(discrepancies[0].message.includes('no system log entry'), 'message should mention missing system log entry');
  });

  it('does not flag discrepancy when system log confirms capability was used', () => {
    const tasks = [
      makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', {
        memoryRecall: { used: true },
      })),
    ];

    const systemLog = [makeSysEntry('memoryRecall', 'roy', 'T-001')];

    const discrepancies = detectDiscrepancies(systemLog, tasks);

    assert.equal(discrepancies.length, 0, 'no discrepancy when system log confirms usage');
  });

  it('does not flag discrepancy when agent self-reports used=false (no claim to verify)', () => {
    const tasks = [
      makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', {
        semanticSearch: { used: false, skipReason: 'not installed' },
      })),
    ];

    const systemLog = [];

    const discrepancies = detectDiscrepancies(systemLog, tasks);

    assert.equal(discrepancies.length, 0, 'no discrepancy for used=false entries');
  });

  it('flags multiple discrepancies across different capabilities in one task', () => {
    const tasks = [
      makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', {
        memoryRecall: { used: true },
        defeatTests: { used: true },
        costTracking: { used: false },
      })),
    ];

    const systemLog = []; // none match

    const discrepancies = detectDiscrepancies(systemLog, tasks);

    assert.equal(discrepancies.length, 2, 'two discrepancies for two claimed-but-absent capabilities');
    const caps = discrepancies.map(d => d.capability).sort();
    assert.deepEqual(caps, ['defeatTests', 'memoryRecall']);
  });

  it('handles tasks with null capabilityChecklist gracefully', () => {
    const tasks = [
      makeTask('T-001', 'roy', null), // no checklist
    ];

    const systemLog = [];

    const discrepancies = detectDiscrepancies(systemLog, tasks);

    assert.equal(discrepancies.length, 0, 'no discrepancies when checklist is null');
  });
});
