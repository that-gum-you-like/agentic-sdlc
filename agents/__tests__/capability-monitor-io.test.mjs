/**
 * capability-monitor-io.test.mjs — REQ-H8: cover the genuinely-uncovered
 * paths of capability-monitor.mjs (file I/O loaders + CLI report emission).
 * The pure detection functions are already covered by capability-monitor.test.mjs.
 *
 * Runs the CLI in a subprocess against a temp project fixture.
 *
 * Run with:
 *   node --test agents/__tests__/capability-monitor-io.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = resolve(__dirname, '..');
const MONITOR = join(AGENTS_DIR, 'capability-monitor.mjs');
const TMP_PROJECT = join(tmpdir(), `sdlc-capmon-io-test-${process.pid}`);

function runMonitor(args) {
  return execFileSync(process.execPath, [MONITOR, ...args], {
    encoding: 'utf8',
    env: { ...process.env, SDLC_PROJECT_DIR: TMP_PROJECT },
  });
}

describe('capability-monitor — file I/O + report emission (REQ-H8)', () => {
  before(() => {
    mkdirSync(join(TMP_PROJECT, 'agents'), { recursive: true });
    mkdirSync(join(TMP_PROJECT, 'pm'), { recursive: true });
    mkdirSync(join(TMP_PROJECT, 'tasks', 'completed'), { recursive: true });

    writeFileSync(join(TMP_PROJECT, 'agents', 'project.json'), JSON.stringify({
      name: 'capmon-fixture', projectDir: TMP_PROJECT, appDir: '.', testCmd: 'true',
      agents: ['tester'],
      capabilityMonitoring: { enabled: true, driftThreshold: 3, windowSize: 10 },
    }));

    writeFileSync(join(TMP_PROJECT, 'agents', 'capabilities.json'), JSON.stringify({
      tester: {
        memoryRecall: { required: true },
        defeatTests: { required: false },
      },
    }));

    // System log: valid entries + one malformed line that must be skipped
    writeFileSync(join(TMP_PROJECT, 'pm', 'capability-log.jsonl'), [
      JSON.stringify({ capability: 'memoryRecall', agent: 'tester', taskId: 'T-1', script: 'memory-manager.mjs', command: 'recall', timestamp: '2026-07-01T00:00:00Z' }),
      '{ this line is not valid json',
      JSON.stringify({ capability: 'memoryRecall', agent: 'tester', taskId: 'T-2', script: 'memory-manager.mjs', command: 'recall', timestamp: '2026-07-02T00:00:00Z' }),
      '',
    ].join('\n'));

    // Completed tasks: valid + malformed (skipped)
    writeFileSync(join(TMP_PROJECT, 'tasks', 'completed', 'T-1.json'), JSON.stringify({
      id: 'T-1', assignee: 'tester', status: 'completed',
      capabilityChecklist: { taskId: 'T-1', agent: 'tester', timestamp: '2026-07-01T00:00:00Z', capabilities: { memoryRecall: { used: true } } },
    }));
    writeFileSync(join(TMP_PROJECT, 'tasks', 'completed', 'T-2.json'), JSON.stringify({
      id: 'T-2', assignee: 'tester', status: 'completed',
      capabilityChecklist: { taskId: 'T-2', agent: 'tester', timestamp: '2026-07-02T00:00:00Z', capabilities: { memoryRecall: { used: true } } },
    }));
    writeFileSync(join(TMP_PROJECT, 'tasks', 'completed', 'broken.json'), '{ not json');
  });

  after(() => {
    rmSync(TMP_PROJECT, { recursive: true, force: true });
  });

  it('loadSystemLog parses JSONL and silently skips malformed lines', () => {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { loadSystemLog } from ${JSON.stringify(MONITOR)};
      const entries = loadSystemLog();
      console.log(JSON.stringify(entries.length));
    `], { encoding: 'utf8', env: { ...process.env, SDLC_PROJECT_DIR: TMP_PROJECT } });
    assert.equal(JSON.parse(out.trim().split('\n').pop()), 2, 'two valid entries, malformed line skipped');
  });

  it('loadCompletedTasks reads task JSONs and skips malformed files', () => {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { loadCompletedTasks } from ${JSON.stringify(MONITOR)};
      console.log(JSON.stringify(loadCompletedTasks().length));
    `], { encoding: 'utf8', env: { ...process.env, SDLC_PROJECT_DIR: TMP_PROJECT } });
    assert.equal(JSON.parse(out.trim().split('\n').pop()), 2, 'two valid tasks, broken.json skipped');
  });

  it('check emits a health verdict from the fixture data', () => {
    const out = runMonitor(['check']);
    assert.match(out, /nominal|DRIFT|Discrepanc/i, 'check must emit a verdict');
  });

  it('report emits the per-agent usage table', () => {
    const out = runMonitor(['report']);
    assert.match(out, /tester/, 'report must include the agent');
    assert.match(out, /memoryRecall/, 'report must include the capability');
    assert.match(out, /100%|2\/2/, 'usage rate computed from the system log');
  });

  it('status runs without error on the fixture project', () => {
    const out = runMonitor(['status']);
    assert.ok(out.length > 0, 'status must emit output');
  });
});
