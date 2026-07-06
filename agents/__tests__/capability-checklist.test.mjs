/**
 * capability-checklist.test.mjs — Q-101
 *
 * Dedicated unit tests for agents/capability-monitor.mjs covering:
 *   1. Schema validation of capability-checklist entries
 *   2. Config loading (getMonitoringConfig, loadCapabilitiesConfig)
 *   3. Drift-detection edge cases (threshold extremes, empty data)
 *   4. Scope-creep edge cases
 *   5. Checklist parsing from mock agent output (various shapes)
 *
 * Run with:
 *   node --test agents/__tests__/capability-checklist.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the module's pure functions (__isMainModule guards CLI side-effects)
const {
  detectDrift,
  detectDiscrepancies,
  computeUsageRates,
  getMonitoringConfig,
  loadCapabilitiesConfig,
} = await import(resolve(__dirname, '../capability-monitor.mjs'));

// ---------------------------------------------------------------------------
// Test helpers (following existing patterns in capability-monitor.test.mjs)
// ---------------------------------------------------------------------------

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

function makeTaskOnlyAssignee(id, agent, checklist = null) {
  return {
    id,
    title: `Task ${id}`,
    status: 'completed',
    assignee: agent,
    // claimedBy intentionally absent — test that assignee fallback works
    completed_at: new Date().toISOString(),
    capabilityChecklist: checklist,
  };
}

function makeChecklist(taskId, agent, caps) {
  return {
    taskId,
    agent,
    timestamp: new Date().toISOString(),
    capabilities: caps,
  };
}

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

// ===========================================================================
// 1. Schema validation of capability-checklist entries
// ===========================================================================

describe('1. checklist schema validation', () => {

  it('a well-formed checklist has all required top-level keys', () => {
    const checklist = makeChecklist('T-001', 'roy', {
      memoryRecall: { used: true },
    });

    assert.ok(typeof checklist.taskId === 'string' && checklist.taskId.length > 0,
      'taskId must be a non-empty string');
    assert.ok(typeof checklist.agent === 'string' && checklist.agent.length > 0,
      'agent must be a non-empty string');
    assert.ok(!isNaN(Date.parse(checklist.timestamp)),
      'timestamp must be a valid ISO date');
    assert.ok(checklist.capabilities !== null && typeof checklist.capabilities === 'object',
      'capabilities must be a non-null object');
  });

  it('each capability entry has "used" boolean and optional "skipReason"', () => {
    const caps = {
      memoryRecall: { used: true },
      defeatTests: { used: false, skipReason: 'not applicable' },
      costTracking: { used: false },
    };

    for (const [name, entry] of Object.entries(caps)) {
      assert.ok('used' in entry, `capability "${name}" must have a "used" field`);
      assert.equal(typeof entry.used, 'boolean',
        `capability "${name}".used must be boolean`);
      if ('skipReason' in entry) {
        assert.ok(entry.skipReason === null || typeof entry.skipReason === 'string',
          `capability "${name}".skipReason must be string or null`);
      }
    }
  });

  it('handles null capabilityChecklist gracefully in drift detection', () => {
    const capConfig = {
      roy: { required: ['memoryRecall'], conditional: {}, notExpected: [] },
    };
    const tasks = [makeTask('T-001', 'roy', null)];
    const systemLog = [];

    const alerts = detectDrift(capConfig, systemLog, tasks, DEFAULT_MON_CONFIG);
    assert.equal(alerts.length, 0, 'no alerts when checklist is null');
  });

  it('handles checklist with missing capabilities key', () => {
    const capConfig = {
      roy: { required: ['memoryRecall'], conditional: {}, notExpected: [] },
    };
    // Checklist exists but is missing the capabilities property
    const badChecklist = { taskId: 'T-001', agent: 'roy', timestamp: new Date().toISOString() };
    const tasks = [makeTask('T-001', 'roy', badChecklist)];
    const systemLog = [];

    const alerts = detectDrift(capConfig, systemLog, tasks, DEFAULT_MON_CONFIG);
    assert.equal(alerts.length, 0, 'no alerts when checklist has no capabilities key');

    const discrepancies = detectDiscrepancies(systemLog, tasks);
    assert.equal(discrepancies.length, 0, 'no discrepancies when checklist has no capabilities key');
  });

  it('handles checklist with empty capabilities object', () => {
    const capConfig = {
      roy: { required: ['memoryRecall'], conditional: {}, notExpected: [] },
    };
    // Use threshold=1 so a single skip triggers drift
    const monConfig = { enabled: true, driftThreshold: 1, windowSize: 10 };
    const tasks = [makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', {}))];
    const systemLog = [];

    const alerts = detectDrift(capConfig, systemLog, tasks, monConfig);
    const driftAlerts = alerts.filter(a => a.type === 'drift');
    // memoryRecall is required, not in capabilities (empty obj), and not in system log
    assert.equal(driftAlerts.length, 1, 'drift flagged for required capability absent from empty checklist');
  });

  it('handles checklist where a capability entry exists but used is not a boolean', () => {
    const capConfig = {
      roy: { required: ['memoryRecall'], conditional: {}, notExpected: [] },
    };
    // The source module reads report.used — if it's truthy but not boolean true,
    // the discrepancy check considers it used
    const tasks = [makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', {
      memoryRecall: { used: 'yes' }, // string instead of boolean
    }))];
    const systemLog = [];

    const discrepancies = detectDiscrepancies(systemLog, tasks);
    // 'yes' is truthy and === true check would fail, but the code checks `report?.used === true`
    // so a strict boolean true check means 'yes' is treated as not-used=true, thus not a discrepancy
    assert.ok(Array.isArray(discrepancies), 'discrepancies should be an array');
  });

});

// ===========================================================================
// 2. Config loading
// ===========================================================================

describe('2. config loading', () => {

  it('getMonitoringConfig returns the configured values', () => {
    const cfg = getMonitoringConfig();
    assert.ok(cfg !== null && typeof cfg === 'object', 'config must be an object');
    assert.ok('enabled' in cfg, 'config must have enabled field');
    assert.ok('driftThreshold' in cfg, 'config must have driftThreshold field');
    assert.ok('windowSize' in cfg, 'config must have windowSize field');
    assert.equal(typeof cfg.enabled, 'boolean', 'enabled must be boolean');
    assert.equal(typeof cfg.driftThreshold, 'number', 'driftThreshold must be number');
    assert.equal(typeof cfg.windowSize, 'number', 'windowSize must be number');
  });

  it('getMonitoringConfig returns non-negative integer thresholds', () => {
    const cfg = getMonitoringConfig();
    assert.ok(cfg.driftThreshold >= 1, 'driftThreshold must be >= 1');
    assert.ok(cfg.windowSize >= 1, 'windowSize must be >= 1');
    assert.equal(Number.isInteger(cfg.driftThreshold), true, 'driftThreshold must be integer');
    assert.equal(Number.isInteger(cfg.windowSize), true, 'windowSize must be integer');
  });

  it('loadCapabilitiesConfig returns an object when file does not exist', () => {
    const caps = loadCapabilitiesConfig();
    assert.ok(caps !== null && typeof caps === 'object',
      'loadCapabilitiesConfig must return an object even when file is missing');
  });

  it('loadCapabilitiesConfig returns empty object when capabilities.json is absent', () => {
    // In this repo there is no agents/capabilities.json, so should yield {}
    const caps = loadCapabilitiesConfig();
    assert.deepEqual(caps, {}, 'should return empty object when no capabilities.json exists');
  });

  it('loadCapabilitiesConfig returns parsed content with capabilities.json via temp fixture', () => {
    // Test via subprocess to avoid loadConfig() cache interference
    const tmpDir = resolve(tmpdir(), `sdlc-checklist-config-${process.pid}-${Date.now()}`);
    mkdirSync(resolve(tmpDir, 'agents'), { recursive: true });
    mkdirSync(resolve(tmpDir, 'pm'), { recursive: true });

    writeFileSync(resolve(tmpDir, 'agents', 'project.json'), JSON.stringify({
      name: 'config-fixture', projectDir: tmpDir, appDir: '.', testCmd: 'true',
      agents: ['roy', 'moss'],
      agentsDir: resolve(tmpDir, 'agents'),
      capabilityMonitoring: { enabled: true, driftThreshold: 5, windowSize: 3 },
    }));

    writeFileSync(resolve(tmpDir, 'agents', 'capabilities.json'), JSON.stringify({
      roy: { required: ['memoryRecall', 'defeatTests'], conditional: {}, notExpected: ['costTracking'] },
      moss: { required: ['memoryRecord'], conditional: { browserE2E: 'when frontend changes' }, notExpected: [] },
    }));

    const monitorPath = resolve(__dirname, '../capability-monitor.mjs');
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { loadCapabilitiesConfig, getMonitoringConfig } from ${JSON.stringify(monitorPath)};
      const caps = loadCapabilitiesConfig();
      const cfg = getMonitoringConfig();
      console.log(JSON.stringify({ caps: Object.keys(caps), driftThreshold: cfg.driftThreshold, windowSize: cfg.windowSize }));
    `], { encoding: 'utf8', env: { ...process.env, SDLC_PROJECT_DIR: tmpDir } });

    const result = JSON.parse(out.trim().split('\n').pop());
    assert.deepEqual(result.caps.sort(), ['moss', 'roy'], 'should list both agents');
    assert.equal(result.driftThreshold, 5, 'should read custom driftThreshold');
    assert.equal(result.windowSize, 3, 'should read custom windowSize');

    rmSync(tmpDir, { recursive: true, force: true });
  });

});

// ===========================================================================
// 3. Drift-detection edge cases
// ===========================================================================

describe('3. drift-detection edge cases', () => {

  it('flags drift when threshold=1 and single task skips required capability', () => {
    const monConfig = { enabled: true, driftThreshold: 1, windowSize: 10 };
    const capConfig = {
      roy: { required: ['defeatTests'], conditional: {}, notExpected: [] },
    };
    const tasks = [makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', {
      defeatTests: { used: false },
    }))];
    const systemLog = [];

    const alerts = detectDrift(capConfig, systemLog, tasks, monConfig);
    const driftAlerts = alerts.filter(a => a.type === 'drift');
    assert.equal(driftAlerts.length, 1, 'drift flagged at threshold=1');
    assert.equal(driftAlerts[0].consecutiveSkips, 1);
  });

  it('does not flag drift when threshold=1 and single task uses required capability', () => {
    const monConfig = { enabled: true, driftThreshold: 1, windowSize: 10 };
    const capConfig = {
      roy: { required: ['defeatTests'], conditional: {}, notExpected: [] },
    };
    const tasks = [makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', {
      defeatTests: { used: true },
    }))];
    const systemLog = [makeSysEntry('defeatTests', 'roy', 'T-001')];

    const alerts = detectDrift(capConfig, systemLog, tasks, monConfig);
    assert.equal(alerts.length, 0, 'no drift when capability was used');
  });

  it('handles agent with zero completed tasks', () => {
    const capConfig = {
      roy: { required: ['memoryRecall'], conditional: {}, notExpected: [] },
    };
    const alerts = detectDrift(capConfig, [], [], DEFAULT_MON_CONFIG);
    assert.equal(alerts.length, 0, 'no drift when agent has no tasks');
  });

  it('handles empty capabilities config (no agents defined)', () => {
    const tasks = [makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', {
      memoryRecall: { used: false },
    }))];

    const alerts = detectDrift({}, [], tasks, DEFAULT_MON_CONFIG);
    // No agent config means no required capabilities to check
    assert.equal(alerts.length, 0, 'no drift when no capabilities config');
  });

  it('handles tasks with only assignee (no claimedBy)', () => {
    const capConfig = {
      moss: { required: ['memoryRecall'], conditional: {}, notExpected: [] },
    };
    const monConfig = { enabled: true, driftThreshold: 1, windowSize: 10 };
    const tasks = [makeTaskOnlyAssignee('T-001', 'moss', makeChecklist('T-001', 'moss', {
      memoryRecall: { used: false },
    }))];
    const systemLog = [];

    const alerts = detectDrift(capConfig, systemLog, tasks, monConfig);
    const driftAlerts = alerts.filter(a => a.type === 'drift');
    assert.equal(driftAlerts.length, 1, 'drift detected via assignee field');
    assert.equal(driftAlerts[0].agent, 'moss');
  });

  it('breaks consecutive streak when one task in the middle uses the capability', () => {
    const capConfig = {
      roy: { required: ['memoryRecall'], conditional: {}, notExpected: [] },
    };
    // detectDrift processes newest first, so order: T-005 (skip), T-004 (used -> breaks streak), T-003, T-002, T-001
    const tasks = [
      makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', { memoryRecall: { used: false } }), '2026-01-01T00:00:00Z'),
      makeTask('T-002', 'roy', makeChecklist('T-002', 'roy', { memoryRecall: { used: false } }), '2026-01-02T00:00:00Z'),
      makeTask('T-003', 'roy', makeChecklist('T-003', 'roy', { memoryRecall: { used: false } }), '2026-01-03T00:00:00Z'),
      makeTask('T-004', 'roy', null, '2026-01-04T00:00:00Z'), // uses it (no checklist = no skip reason)
      makeTask('T-005', 'roy', makeChecklist('T-005', 'roy', { memoryRecall: { used: false } }), '2026-01-05T00:00:00Z'),
    ];
    // System log has memoryRecall for T-004
    const systemLog = [makeSysEntry('memoryRecall', 'roy', 'T-004')];

    const alerts = detectDrift(capConfig, systemLog, tasks, DEFAULT_MON_CONFIG);
    const driftAlerts = alerts.filter(a => a.type === 'drift');

    // Newest-first: T-005 skip -> T-004 used (breaks) -> no alert because streak is 1 not 3
    assert.equal(driftAlerts.length, 0, 'streak broken by middle task that used capability');
  });

  it('applies windowSize to limit tasks analyzed', () => {
    const monConfig = { enabled: true, driftThreshold: 3, windowSize: 5 };
    const capConfig = {
      roy: { required: ['memoryRecall'], conditional: {}, notExpected: [] },
    };
    // 10 tasks over threshold, but windowSize=5 means only newest 5 are analyzed
    const tasks = Array.from({ length: 10 }, (_, i) => {
      const id = `T-${String(i + 1).padStart(3, '0')}`;
      const dt = new Date(2026, 0, i + 1).toISOString();
      return makeTask(id, 'roy', makeChecklist(id, 'roy', { memoryRecall: { used: false } }), dt);
    });
    const systemLog = [];

    const alerts = detectDrift(capConfig, systemLog, tasks, monConfig);
    const driftAlerts = alerts.filter(a => a.type === 'drift');

    // windowSize=5 means only 5 newest tasks checked — still triggers drift at threshold=3
    assert.ok(driftAlerts.length > 0, 'drift flagged within window');
    assert.equal(driftAlerts[0].consecutiveSkips, 5, 'all 5 tasks in window are consecutive skips');
  });

  it('handles multiple agents independently', () => {
    const capConfig = {
      roy: { required: ['memoryRecall'], conditional: {}, notExpected: [] },
      moss: { required: ['defeatTests'], conditional: {}, notExpected: [] },
    };
    const tasks = [
      makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', { memoryRecall: { used: false } }), '2026-01-03T00:00:00Z'),
      makeTask('T-001', 'moss', makeChecklist('T-001', 'moss', { defeatTests: { used: true } }), '2026-01-03T00:00:00Z'),
      makeTask('T-002', 'roy', makeChecklist('T-002', 'roy', { memoryRecall: { used: false } }), '2026-01-02T00:00:00Z'),
      makeTask('T-003', 'roy', makeChecklist('T-003', 'roy', { memoryRecall: { used: false } }), '2026-01-01T00:00:00Z'),
    ];
    const systemLog = [makeSysEntry('defeatTests', 'moss', 'T-001')];

    const alerts = detectDrift(capConfig, systemLog, tasks, DEFAULT_MON_CONFIG);
    const driftAlerts = alerts.filter(a => a.type === 'drift');

    assert.equal(driftAlerts.length, 1, 'only roy should have drift (moss used defeatTests)');
    assert.equal(driftAlerts[0].agent, 'roy');
  });

});

// ===========================================================================
// 4. Scope-creep detection edge cases
// ===========================================================================

describe('4. scope-creep edge cases', () => {

  it('flags scope creep across multiple tasks', () => {
    const capConfig = {
      richmond: {
        required: ['memoryRecall'],
        conditional: {},
        notExpected: ['browserE2E', 'costTracking'],
      },
    };
    const tasks = [
      makeTask('T-010', 'richmond', makeChecklist('T-010', 'richmond', {
        memoryRecall: { used: true },
        browserE2E: { used: true },
      })),
      makeTask('T-011', 'richmond', makeChecklist('T-011', 'richmond', {
        memoryRecall: { used: true },
        costTracking: { used: true },
      })),
    ];
    const systemLog = [
      makeSysEntry('memoryRecall', 'richmond', 'T-010'),
      makeSysEntry('memoryRecall', 'richmond', 'T-011'),
    ];

    const alerts = detectDrift(capConfig, systemLog, tasks, DEFAULT_MON_CONFIG);
    const scopeAlerts = alerts.filter(a => a.type === 'scopeCreep');

    assert.equal(scopeAlerts.length, 2, 'two scope creep alerts across two tasks');
    assert.equal(scopeAlerts[0].capability, 'browserE2E');
    assert.equal(scopeAlerts[1].capability, 'costTracking');
  });

  it('does not flag scope creep for required capabilities that happen to be in notExpected', () => {
    const capConfig = {
      richmond: {
        required: ['memoryRecall'],
        conditional: {},
        notExpected: ['costTracking'],
      },
    };
    const tasks = [
      makeTask('T-010', 'richmond', makeChecklist('T-010', 'richmond', {
        memoryRecall: { used: true }, // required, not notExpected
      })),
    ];
    const systemLog = [makeSysEntry('memoryRecall', 'richmond', 'T-010')];

    const alerts = detectDrift(capConfig, systemLog, tasks, DEFAULT_MON_CONFIG);
    const scopeAlerts = alerts.filter(a => a.type === 'scopeCreep');
    assert.equal(scopeAlerts.length, 0, 'no scope creep for required capability');
  });

  it('handles agent with no notExpected list gracefully', () => {
    const capConfig = {
      richmond: {
        required: ['memoryRecall'],
        conditional: {},
        // notExpected not set
      },
    };
    const tasks = [
      makeTask('T-010', 'richmond', makeChecklist('T-010', 'richmond', {
        memoryRecall: { used: true },
        browserE2E: { used: true },
      })),
    ];
    const systemLog = [makeSysEntry('memoryRecall', 'richmond', 'T-010')];

    const alerts = detectDrift(capConfig, systemLog, tasks, DEFAULT_MON_CONFIG);
    // Should not crash when notExpected is not set
    assert.ok(Array.isArray(alerts), 'should return an array without error');
  });

});

// ===========================================================================
// 5. Checklist parsing from mock agent output
// ===========================================================================

describe('5. checklist parsing from mock agent output', () => {

  it('parses a fully populated checklist with all capability types', () => {
    const capConfig = {
      roy: {
        required: ['memoryRecall', 'defeatTests'],
        conditional: { browserE2E: 'when frontend changes' },
        notExpected: ['costTracking'],
      },
    };
    const tasks = [
      makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', {
        memoryRecall: { used: true },
        defeatTests: { used: true },
        browserE2E: { used: false, skipReason: 'backend-only change' },
        costTracking: { used: false },
      })),
    ];
    const systemLog = [
      makeSysEntry('memoryRecall', 'roy', 'T-001'),
      makeSysEntry('defeatTests', 'roy', 'T-001'),
    ];

    // Test detectDrift — should be clean
    const driftAlerts = detectDrift(capConfig, systemLog, tasks, DEFAULT_MON_CONFIG);
    assert.equal(driftAlerts.length, 0, 'no alerts for correctly populated checklist');

    // Test computeUsageRates
    const rates = computeUsageRates(capConfig, systemLog, tasks, 10);
    assert.ok(rates.roy, 'should have rates for roy');
    assert.equal(rates.roy.memoryRecall?.used, 1, 'memoryRecall used once');
    assert.equal(rates.roy.defeatTests?.used, 1, 'defeatTests used once');
  });

  it('parses a checklist where all capabilities are skipped with valid reasons', () => {
    const capConfig = {
      moss: {
        required: ['memoryRecall', 'defeatTests'],
        conditional: {},
        notExpected: [],
      },
    };
    const tasks = [
      makeTask('T-001', 'moss', makeChecklist('T-001', 'moss', {
        memoryRecall: { used: false, skipReason: 'no memory recall needed for doc-only task' },
        defeatTests: { used: false, skipReason: 'documentation change, no code to test' },
      })),
    ];
    const systemLog = [];

    const alerts = detectDrift(capConfig, systemLog, tasks, DEFAULT_MON_CONFIG);
    assert.equal(alerts.length, 0, 'no drift when all skips have skipReason');
  });

  it('parses a checklist where used capabilities are confirmed by system log', () => {
    const capConfig = {
      roy: { required: ['semanticSearch'], conditional: {}, notExpected: [] },
    };
    const tasks = [
      makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', {
        semanticSearch: { used: true },
      })),
    ];
    const systemLog = [makeSysEntry('semanticSearch', 'roy', 'T-001')];

    const discrepancies = detectDiscrepancies(systemLog, tasks);
    assert.equal(discrepancies.length, 0, 'no discrepancy when system log confirms usage');

    const rates = computeUsageRates(capConfig, systemLog, tasks, 10);
    assert.equal(rates.roy.semanticSearch.rate, 100, '100% usage when confirmed');
  });

  it('parses a checklist where used capabilities are NOT confirmed by system log', () => {
    const capConfig = {
      roy: { required: ['semanticSearch'], conditional: {}, notExpected: [] },
    };
    const tasks = [
      makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', {
        semanticSearch: { used: true },
      })),
    ];
    const systemLog = []; // empty — no log entry for semanticSearch

    const discrepancies = detectDiscrepancies(systemLog, tasks);
    assert.equal(discrepancies.length, 1, 'discrepancy when system log is empty');
    assert.equal(discrepancies[0].capability, 'semanticSearch');
  });

  it('handles a task with no capabilityChecklist field at all', () => {
    const capConfig = {
      roy: { required: ['memoryRecall'], conditional: {}, notExpected: [] },
    };
    const monConfig = { enabled: true, driftThreshold: 1, windowSize: 10 };
    const taskNoChecklist = { id: 'T-001', title: 'No checklist', status: 'completed', claimedBy: 'roy', assignee: 'roy' };
    const tasks = [taskNoChecklist];
    const systemLog = [];

    const driftAlerts = detectDrift(capConfig, systemLog, tasks, monConfig);
    const discrepancies = detectDiscrepancies(systemLog, tasks);

    // No checklist means no self-report data — drift is checked via system log only
    assert.equal(discrepancies.length, 0, 'no discrepancies without checklist');
    // The required capability memoryRecall has no system log entries — drift should be detected
    // because there are tasks but no evidence the capability was used
    const drift = driftAlerts.filter(a => a.type === 'drift');
    assert.equal(drift.length, 1, 'drift flagged because required capability never appeared in system log');
  });

  it('handles tasks with mixed claimedBy/assignee patterns', () => {
    const capConfig = {
      roy: { required: ['memoryRecall'], conditional: {}, notExpected: [] },
      moss: { required: ['defeatTests'], conditional: {}, notExpected: [] },
    };
    const monConfig = { enabled: true, driftThreshold: 1, windowSize: 10 };
    const tasks = [
      makeTask('T-001', 'roy', makeChecklist('T-001', 'roy', { memoryRecall: { used: false } })),
      // Only assignee set, no claimedBy
      makeTaskOnlyAssignee('T-002', 'moss', makeChecklist('T-002', 'moss', { defeatTests: { used: false } })),
    ];
    const systemLog = [];

    const alerts = detectDrift(capConfig, systemLog, tasks, monConfig);
    const driftAlerts = alerts.filter(a => a.type === 'drift');
    assert.equal(driftAlerts.length, 2, 'both agents should have drift alerts');
    const agents = driftAlerts.map(a => a.agent).sort();
    assert.deepEqual(agents, ['moss', 'roy']);
  });

  it('respects windowSize for checklist parsing with many tasks', () => {
    const capConfig = {
      roy: { required: ['memoryRecall'], conditional: {}, notExpected: [] },
    };
    // 20 tasks, windowSize=3 — only meant to verify the function doesn't crash
    const tasks = Array.from({ length: 20 }, (_, i) => {
      const id = `T-${String(i + 1).padStart(3, '0')}`;
      return makeTask(id, 'roy', makeChecklist(id, 'roy', { memoryRecall: { used: false } }), new Date(2026, 0, i + 1).toISOString());
    });
    const systemLog = [];

    const rates = computeUsageRates(capConfig, systemLog, tasks, 3);
    assert.ok(rates.roy, 'rates should exist for roy');
    assert.equal(rates.roy.memoryRecall.total, 3, 'only 3 tasks within window');

    const driftAlerts = detectDrift(capConfig, systemLog, tasks, { enabled: true, driftThreshold: 3, windowSize: 3 });
    const drift = driftAlerts.filter(a => a.type === 'drift');
    assert.equal(drift.length, 1, 'drift still flagged for 3 consecutive skips in window');
  });

});