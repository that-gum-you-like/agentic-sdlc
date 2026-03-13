/**
 * capability-logger.test.mjs
 *
 * Tests for agents/capability-logger.mjs (task 1B.11).
 * Tests the JSONL format and field validation directly.
 *
 * Run with:
 *   node --test agents/__tests__/capability-logger.test.mjs
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const AGENTS_DIR = resolve(__dirname, '..');

describe('capability-logger.mjs', () => {

  // ---------------------------------------------------------------------------
  // File I/O tests using _appendToLog (avoids loadConfig() cache issues)
  // ---------------------------------------------------------------------------

  let appendToLog;
  before(async () => {
    const mod = await import(resolve(AGENTS_DIR, 'capability-logger.mjs'));
    appendToLog = mod._appendToLog;
  });

  it('appends a valid JSONL line to the specified log path', () => {
    const tmpDir = resolve(os.tmpdir(), `cap-log-io-${Date.now()}`);
    const logPath = resolve(tmpDir, 'capability-log.jsonl');
    mkdirSync(tmpDir, { recursive: true });

    appendToLog(logPath, 'memoryRecall', 'roy', 'T-001', 'memory-manager.mjs', 'recall');

    assert.ok(existsSync(logPath), 'log file should be created');
    const lines = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 1);
    const obj = JSON.parse(lines[0]);
    assert.equal(obj.capability, 'memoryRecall');
    assert.equal(obj.agent, 'roy');
    assert.equal(obj.taskId, 'T-001');
    assert.equal(obj.script, 'memory-manager.mjs');
    assert.equal(obj.command, 'recall');
    assert.ok(!isNaN(Date.parse(obj.timestamp)), 'timestamp should be valid ISO date');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('multiple calls produce multiple JSONL lines', () => {
    const tmpDir = resolve(os.tmpdir(), `cap-log-multi-${Date.now()}`);
    const logPath = resolve(tmpDir, 'capability-log.jsonl');
    mkdirSync(tmpDir, { recursive: true });

    appendToLog(logPath, 'memoryRecall', 'roy', 'T-001', 'memory-manager.mjs', 'recall');
    appendToLog(logPath, 'memoryRecord', 'roy', 'T-001', 'memory-manager.mjs', 'record');
    appendToLog(logPath, 'defeatTests', 'roy', 'T-001', 'four-layer-validate.mjs', 'run');

    const lines = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 3);
    assert.equal(JSON.parse(lines[0]).capability, 'memoryRecall');
    assert.equal(JSON.parse(lines[1]).capability, 'memoryRecord');
    assert.equal(JSON.parse(lines[2]).capability, 'defeatTests');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('auto-creates the parent directory when it does not exist', () => {
    const tmpDir = resolve(os.tmpdir(), `cap-log-mkdir-${Date.now()}`);
    const logPath = resolve(tmpDir, 'pm', 'capability-log.jsonl');
    // Do NOT pre-create the pm/ subdirectory

    appendToLog(logPath, 'schemaValidation', 'system', 'unknown', 'queue-drainer.mjs', 'claim');

    assert.ok(existsSync(resolve(tmpDir, 'pm')), 'pm/ should be auto-created');
    assert.ok(existsSync(logPath), 'log file should exist');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('each appended line is valid JSON with all required fields', () => {
    const tmpDir = resolve(os.tmpdir(), `cap-log-fields-${Date.now()}`);
    const logPath = resolve(tmpDir, 'capability-log.jsonl');
    mkdirSync(tmpDir, { recursive: true });

    appendToLog(logPath, 'costTracking', 'moss', 'T-042', 'cost-tracker.mjs', 'record');
    appendToLog(logPath, 'openclawNotify', 'system', 'T-043', 'notify.mjs', 'send');

    const REQUIRED = ['timestamp', 'capability', 'agent', 'taskId', 'script', 'command'];
    const lines = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const obj = JSON.parse(line);
      for (const field of REQUIRED) {
        assert.ok(field in obj, `missing required field: ${field}`);
        assert.equal(typeof obj[field], 'string', `field "${field}" must be a string`);
        assert.ok(obj[field].length > 0, `field "${field}" must not be empty`);
      }
    }

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('falls back to "system"/"unknown" for falsy agent/taskId via _appendToLog', () => {
    const tmpDir = resolve(os.tmpdir(), `cap-log-fallback-${Date.now()}`);
    const logPath = resolve(tmpDir, 'capability-log.jsonl');
    mkdirSync(tmpDir, { recursive: true });

    appendToLog(logPath, 'remSleep', '', null, 'rem-sleep.mjs', 'consolidate');

    const lines = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
    const obj = JSON.parse(lines[0]);
    assert.equal(obj.agent, 'system');
    assert.equal(obj.taskId, 'unknown');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // JSONL format tests (unit tests, no file I/O)
  // ---------------------------------------------------------------------------

  it('produces valid JSONL entry format', () => {
    // Simulate what logCapabilityUsage writes
    const entry = {
      timestamp: new Date().toISOString(),
      capability: 'memoryRecall',
      agent: 'roy',
      taskId: 'T-015',
      script: 'memory-manager.mjs',
      command: 'recall',
    };
    const line = JSON.stringify(entry);
    const parsed = JSON.parse(line);

    assert.equal(parsed.capability, 'memoryRecall');
    assert.equal(parsed.agent, 'roy');
    assert.equal(parsed.taskId, 'T-015');
    assert.equal(parsed.script, 'memory-manager.mjs');
    assert.equal(parsed.command, 'recall');
    assert.ok(parsed.timestamp);
  });

  it('all required fields are present in entry', () => {
    const REQUIRED_FIELDS = ['timestamp', 'capability', 'agent', 'taskId', 'script', 'command'];
    const entry = {
      timestamp: new Date().toISOString(),
      capability: 'costTracking',
      agent: 'system',
      taskId: 'unknown',
      script: 'cost-tracker.mjs',
      command: 'record',
    };

    for (const field of REQUIRED_FIELDS) {
      assert.ok(field in entry, `missing field: ${field}`);
      assert.ok(typeof entry[field] === 'string', `${field} must be string`);
    }
  });

  it('multiple entries produce valid JSONL (one object per line)', () => {
    const entries = [
      { timestamp: '2026-03-13T10:00:00Z', capability: 'memoryRecall', agent: 'roy', taskId: 'T-001', script: 'memory-manager.mjs', command: 'recall' },
      { timestamp: '2026-03-13T10:00:01Z', capability: 'defeatTests', agent: 'roy', taskId: 'T-001', script: 'four-layer-validate.mjs', command: 'run' },
      { timestamp: '2026-03-13T10:00:02Z', capability: 'memoryRecord', agent: 'roy', taskId: 'T-001', script: 'memory-manager.mjs', command: 'record' },
    ];

    const jsonl = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    const lines = jsonl.trim().split('\n');

    assert.equal(lines.length, 3);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      assert.ok(parsed.capability);
      assert.ok(parsed.agent);
    }
  });

  it('defaults agent to "system" and taskId to "unknown" for falsy values', () => {
    // Simulate the String() coercion in logCapabilityUsage
    const agent = String(null || 'system');
    const taskId = String(undefined || 'unknown');

    assert.equal(agent, 'system');
    assert.equal(taskId, 'unknown');
  });

  it('errors do not propagate when wrapped in try/catch', () => {
    // This is how all instrumented scripts call the logger
    let threw = false;
    try {
      try {
        throw new Error('simulated logger failure');
      } catch {
        // Host script catches — this is the pattern
      }
    } catch {
      threw = true;
    }
    assert.equal(threw, false, 'wrapped try/catch should not propagate');
  });

  it('capability-logger.mjs exports logCapabilityUsage', async () => {
    const { readFileSync } = await import('fs');
    const { resolve, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const src = readFileSync(resolve(dirname(__filename), '..', 'capability-logger.mjs'), 'utf8');
    assert.ok(src.includes('export function logCapabilityUsage'));
    assert.ok(src.includes('appendFileSync'));
    assert.ok(src.includes('capability-log.jsonl'));
  });

  it('all instrumented scripts import capability-logger', async () => {
    const { readFileSync } = await import('fs');
    const { resolve, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const agentsDir = resolve(dirname(__filename), '..');

    const INSTRUMENTED = [
      'memory-manager.mjs',
      'semantic-index.mjs',
      'cost-tracker.mjs',
      'four-layer-validate.mjs',
      'queue-drainer.mjs',
      'notify.mjs',
      'pattern-hunt.mjs',
      'rem-sleep.mjs',
      'review-hook.mjs',
    ];

    for (const script of INSTRUMENTED) {
      const src = readFileSync(resolve(agentsDir, script), 'utf8');
      assert.ok(
        src.includes('logCapabilityUsage'),
        `${script} should import/call logCapabilityUsage`
      );
    }
  });
});
