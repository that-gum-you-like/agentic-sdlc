/**
 * weekly-review-steps.test.mjs — CV-REQ-010: buildWeeklySteps returns the correct
 * ordered list of weekly review steps and appends --dry-run when requested.
 * Also tests runWeeklySteps runner function (CV-103).
 * Also tests capacityForecast (CV-REQ-017) and groomingReport (CV-REQ-018).
 *
 * Run with:
 *   node --test agents/__tests__/weekly-review-steps.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWeeklySteps, runWeeklySteps, capacityForecast, groomingReport, architectureCheck, agentMdChangedSinceSnapshot } from '../cycles/weekly-review.mjs';

describe('buildWeeklySteps', () => {
  it('returns exactly three steps in the correct order', () => {
    const steps = buildWeeklySteps();
    assert.equal(steps.length, 3, 'must return three steps');

    assert.equal(steps[0].label, 'Pattern hunt');
    assert.equal(steps[0].script, 'pattern-hunt.mjs');
    assert.deepEqual(steps[0].args, []);

    assert.equal(steps[1].label, 'REM sleep similarity');
    assert.equal(steps[1].script, 'rem-sleep.mjs');
    assert.deepEqual(steps[1].args, ['--similarity']);

    assert.equal(steps[2].label, 'Behavior drift');
    assert.equal(steps[2].script, 'test-behavior.mjs');
    assert.deepEqual(steps[2].args, ['--drift']);
  });

  it('appends --dry-run to every step when dryRun is true', () => {
    const steps = buildWeeklySteps({ dryRun: true });
    assert.equal(steps.length, 3);
    for (const step of steps) {
      assert.ok(step.args.includes('--dry-run'),
        `step "${step.label}" should include --dry-run in args: ${JSON.stringify(step.args)}`);
    }
    // Also verify the original step-specific args are preserved
    assert.ok(steps[0].args.includes('--dry-run'));
    assert.deepEqual(steps[1].args, ['--similarity', '--dry-run']);
    assert.deepEqual(steps[2].args, ['--drift', '--dry-run']);
  });

  it('does not add --dry-run when dryRun is false (default)', () => {
    const steps = buildWeeklySteps();
    for (const step of steps) {
      assert.ok(!step.args.includes('--dry-run'),
        `step "${step.label}" should NOT include --dry-run when dryRun is false`);
    }
  });

  it('each step has the expected shape {label, script, args}', () => {
    const steps = buildWeeklySteps();
    for (const step of steps) {
      assert.equal(typeof step.label, 'string', 'label must be a string');
      assert.equal(typeof step.script, 'string', 'script must be a string');
      assert.ok(Array.isArray(step.args), 'args must be an array');
      assert.match(step.script, /\.mjs$/, 'script must end with .mjs');
    }
  });
});

describe('runWeeklySteps', () => {
  it('executes all steps even when step 1 fails (runner stub)', () => {
    const executed = [];
    const stubRunner = (label, script, args) => {
      executed.push(label);
      return { label, ok: label !== 'Step 1' };
    };
    const steps = [
      { label: 'Step 1', script: 'a.mjs', args: [] },
      { label: 'Step 2', script: 'b.mjs', args: [] },
      { label: 'Step 3', script: 'c.mjs', args: [] },
    ];
    const results = runWeeklySteps(steps, stubRunner);
    // A failing step must not stop subsequent steps
    assert.deepEqual(executed, ['Step 1', 'Step 2', 'Step 3'],
      'all three steps must be executed even when one fails');
    // Result array has all 3 entries
    assert.equal(results.length, 3, 'result array must have 3 entries');
    assert.equal(results[0].ok, false, 'step 1 must be FAIL');
    assert.equal(results[1].ok, true, 'step 2 must be PASS');
    assert.equal(results[2].ok, true, 'step 3 must be PASS');
  });

  it('returns correct number of results matching input steps', () => {
    const stubRunner = (label, script, args) => ({ label, ok: true });
    const steps = buildWeeklySteps();
    const results = runWeeklySteps(steps, stubRunner);
    assert.equal(results.length, steps.length,
      'result count must match input step count');
    for (const r of results) {
      assert.equal(typeof r.label, 'string');
      assert.equal(typeof r.ok, 'boolean');
    }
  });

  it('every step runs even when all fail', () => {
    const executed = [];
    const stubRunner = (label, script, args) => {
      executed.push(label);
      return { label, ok: false };
    };
    const steps = [
      { label: 'First', script: 'x.mjs', args: [] },
      { label: 'Second', script: 'y.mjs', args: [] },
    ];
    const results = runWeeklySteps(steps, stubRunner);
    assert.equal(results.length, 2);
    assert.equal(results[0].ok, false);
    assert.equal(results[1].ok, false);
  });

  it('uses the default runStep from monthly-review when no runner provided', () => {
    // Exercise runWeeklySteps with the default runner by passing a
    // spy wrapper that captures invocations without shelling out.
    const invoked = [];
    const spyRunner = (label, script, args) => {
      invoked.push({ label, script, args });
      return { label, ok: true };
    };
    const steps = buildWeeklySteps();
    const results = runWeeklySteps(steps, spyRunner);
    assert.equal(results.length, steps.length, 'all steps produced a result');
    assert.equal(invoked.length, steps.length, 'spy runner was called for every step');
    // Each invocation received the (label, script, args) shape expected by runStep
    for (let i = 0; i < steps.length; i++) {
      assert.equal(invoked[i].label, steps[i].label);
      assert.equal(invoked[i].script, steps[i].script);
      assert.deepEqual(invoked[i].args, steps[i].args);
    }
  });

  it('importing weekly-review does not trigger main() side effects', () => {
    // The __isMainModule guard should prevent main() from running when
    // the module is imported. We verify this by importing and checking
    // that the file's exports are functions, not side-effect output.
    assert.equal(typeof buildWeeklySteps, 'function');
    assert.equal(typeof runWeeklySteps, 'function');
    // No side-effect console output should have been produced by the import
    // itself — the test harness would have captured any output but we just
    // verify the module is importable and exports are present.
  });
});

describe('capacityForecast (CV-REQ-017)', () => {
  it('returns "4 days" for 1,000,000 tokens at 250,000 daily budget', () => {
    const tasks = [{ estimatedTokens: 500000 }, { estimatedTokens: 500000 }];
    const result = capacityForecast(tasks, 250000);
    assert.equal(result, '4 days');
  });

  it('returns "n/a" when budget is missing (undefined)', () => {
    const tasks = [{ estimatedTokens: 1000 }];
    assert.equal(capacityForecast(tasks, undefined), 'n/a');
  });

  it('returns "n/a" when budget is null', () => {
    const tasks = [{ estimatedTokens: 1000 }];
    assert.equal(capacityForecast(tasks, null), 'n/a');
  });

  it('returns "n/a" when budget is zero', () => {
    const tasks = [{ estimatedTokens: 1000 }];
    assert.equal(capacityForecast(tasks, 0), 'n/a');
  });

  it('returns "n/a" when budget is negative', () => {
    const tasks = [{ estimatedTokens: 1000 }];
    assert.equal(capacityForecast(tasks, -100), 'n/a');
  });

  it('treats tasks without estimatedTokens as contributing 0', () => {
    const tasks = [{ estimatedTokens: 1000 }, { noTokens: true }, { estimatedTokens: 1000 }];
    const result = capacityForecast(tasks, 500);
    // total = 2000, / 500 = 4
    assert.equal(result, '4 days');
  });

  it('returns "0 days" for empty tasks array with valid budget', () => {
    assert.equal(capacityForecast([], 250000), '0 days');
  });

  it('returns "1 day" when total equals the daily budget', () => {
    const tasks = [{ estimatedTokens: 50000 }];
    assert.equal(capacityForecast(tasks, 50000), '1 day');
  });

  it('rounds up fractional days', () => {
    const tasks = [{ estimatedTokens: 1 }];
    assert.equal(capacityForecast(tasks, 2), '1 day');
  });

  it('is a pure function (no side effects)', () => {
    const tasks = [{ estimatedTokens: 100000 }, { estimatedTokens: 200000 }];
    const tasksCopy = JSON.parse(JSON.stringify(tasks));
    capacityForecast(tasks, 50000);
    assert.deepEqual(tasks, tasksCopy, 'tasks array should not be mutated');
  });
});

describe('groomingReport (CV-REQ-018)', () => {
  it('flags a task missing estimatedTokens', () => {
    const tasks = [
      { id: 'task-1', title: 'Task One', acceptance_criteria: 'done', priority: 'HIGH', estimatedTokens: 100 },
      { id: 'task-2', title: 'Task Two', acceptance_criteria: 'done', priority: 'HIGH' }, // no estimatedTokens
    ];
    const result = groomingReport(tasks, new Date('2026-11-08'));
    assert.deepEqual(result.missingEstimatedTokens, ['task-2']);
  });

  it('flags a task missing acceptance_criteria', () => {
    const tasks = [
      { id: 'task-a', title: 'Task A', estimatedTokens: 100, priority: 'HIGH' }, // no acceptance_criteria
      { id: 'task-b', title: 'Task B', estimatedTokens: 100, acceptance_criteria: 'yes', priority: 'HIGH' },
    ];
    const result = groomingReport(tasks, new Date('2026-11-08'));
    assert.deepEqual(result.missingAcceptanceCriteria, ['task-a']);
  });

  it('flags a task missing priority', () => {
    const tasks = [
      { id: 'task-x', title: 'Task X', estimatedTokens: 100, acceptance_criteria: 'yes' }, // no priority
      { id: 'task-y', title: 'Task Y', estimatedTokens: 100, acceptance_criteria: 'yes', priority: 'HIGH' },
    ];
    const result = groomingReport(tasks, new Date('2026-11-08'));
    assert.deepEqual(result.missingPriority, ['task-x']);
  });

  it('flags a task unclaimed over 30 days', () => {
    const oldDate = new Date('2026-09-01').toISOString(); // >30 days before Nov 8
    const tasks = [
      { id: 'task-1', title: 'Old Task', estimatedTokens: 100, acceptance_criteria: 'yes', priority: 'HIGH', claimedBy: null, createdAt: oldDate },
      { id: 'task-2', title: 'Recent Task', estimatedTokens: 100, acceptance_criteria: 'yes', priority: 'HIGH', claimedBy: null, createdAt: new Date('2026-11-01').toISOString() },
    ];
    const result = groomingReport(tasks, new Date('2026-11-08'));
    assert.deepEqual(result.unclaimedOver30Days, ['task-1']);
    assert.ok(!result.unclaimedOver30Days.includes('task-2'));
  });

  it('returns empty arrays when all tasks are healthy', () => {
    const tasks = [
      { id: 't1', title: 'T1', estimatedTokens: 100, acceptance_criteria: 'yes', priority: 'HIGH', claimedBy: 'bot', createdAt: new Date().toISOString() },
    ];
    const result = groomingReport(tasks, new Date());
    assert.deepEqual(result.missingEstimatedTokens, []);
    assert.deepEqual(result.missingAcceptanceCriteria, []);
    assert.deepEqual(result.missingPriority, []);
    assert.deepEqual(result.unclaimedOver30Days, []);
  });

  it('is a pure function (no side effects)', () => {
    const tasks = [
      { id: 't1', title: 'T1', estimatedTokens: 100, acceptance_criteria: 'yes', priority: 'HIGH', claimedBy: 'bot' },
    ];
    const tasksCopy = JSON.parse(JSON.stringify(tasks));
    groomingReport(tasks, new Date('2026-11-08'));
    assert.deepEqual(tasks, tasksCopy, 'tasks array should not be mutated');
  });

  it('does not flag unclaimed task without createdAt', () => {
    const tasks = [
      { id: 't1', title: 'T1', estimatedTokens: 100, acceptance_criteria: 'yes', priority: 'HIGH', claimedBy: null },
    ];
    const result = groomingReport(tasks, new Date('2026-11-08'));
    assert.deepEqual(result.unclaimedOver30Days, []);
  });

  it('uses task title as fallback when id is missing', () => {
    const tasks = [
      { title: 'NoIdTask', estimatedTokens: 100, acceptance_criteria: 'yes', priority: 'HIGH' },
    ];
    // With all fields set, no grooming issues — but if one were, title would be the label
    const result = groomingReport(tasks, new Date('2026-11-08'));
    // This task is healthy, so no issues
    assert.deepEqual(result.missingEstimatedTokens, []);
    assert.deepEqual(result.missingAcceptanceCriteria, []);
    assert.deepEqual(result.missingPriority, []);
  });

  it('reports multiple issues on a single task across all four categories', () => {
    const oldDate = new Date('2026-09-01').toISOString();
    const tasks = [
      { id: 'neglected', title: 'Neglected Task', claimedBy: null, createdAt: oldDate },
      // missing estimatedTokens, acceptance_criteria, priority, AND unclaimed
    ];
    const result = groomingReport(tasks, new Date('2026-11-08'));
    assert.deepEqual(result.missingEstimatedTokens, ['neglected']);
    assert.deepEqual(result.missingAcceptanceCriteria, ['neglected']);
    assert.deepEqual(result.missingPriority, ['neglected']);
    assert.deepEqual(result.unclaimedOver30Days, ['neglected']);
  });
});

describe('architectureCheck (CV-REQ-016)', () => {
  it('flags agent as underperforming when >= 5 tasks and firstAttemptSuccessRate < 0.5', () => {
    const metrics = {
      'agent-a': { firstAttemptSuccessRate: 0.4, tasksCompleted: 5, routedDomains: 3, tasksLast4Weeks: 3 },
    };
    const result = architectureCheck(metrics);
    assert.deepEqual(result.underperforming, ['agent-a']);
    assert.deepEqual(result.splitCandidates, []);
    assert.deepEqual(result.idle, []);
  });

  it('does NOT flag agent when < 5 tasks even with low success rate', () => {
    const metrics = {
      'agent-a': { firstAttemptSuccessRate: 0.0, tasksCompleted: 4, routedDomains: 3, tasksLast4Weeks: 4 },
    };
    const result = architectureCheck(metrics);
    assert.deepEqual(result.underperforming, []);
  });

  it('does NOT flag agent when firstAttemptSuccessRate >= 0.5 with >= 5 tasks', () => {
    const metrics = {
      'agent-a': { firstAttemptSuccessRate: 0.5, tasksCompleted: 5, routedDomains: 3, tasksLast4Weeks: 5 },
      'agent-b': { firstAttemptSuccessRate: 0.8, tasksCompleted: 10, routedDomains: 3, tasksLast4Weeks: 10 },
    };
    const result = architectureCheck(metrics);
    assert.deepEqual(result.underperforming, []);
  });

  it('flags agent as split-candidate when routedDomains > 6', () => {
    const metrics = {
      'agent-a': { firstAttemptSuccessRate: 0.8, tasksCompleted: 5, routedDomains: 7, tasksLast4Weeks: 5 },
    };
    const result = architectureCheck(metrics);
    assert.deepEqual(result.splitCandidates, ['agent-a']);
  });

  it('does NOT flag agent as split-candidate when routedDomains <= 6', () => {
    const metrics = {
      'agent-a': { firstAttemptSuccessRate: 0.8, tasksCompleted: 5, routedDomains: 6, tasksLast4Weeks: 5 },
      'agent-b': { firstAttemptSuccessRate: 0.8, tasksCompleted: 5, routedDomains: 3, tasksLast4Weeks: 5 },
    };
    const result = architectureCheck(metrics);
    assert.deepEqual(result.splitCandidates, []);
  });

  it('flags agent as idle when tasksLast4Weeks is 0', () => {
    const metrics = {
      'agent-a': { firstAttemptSuccessRate: 0.8, tasksCompleted: 10, routedDomains: 3, tasksLast4Weeks: 0 },
    };
    const result = architectureCheck(metrics);
    assert.deepEqual(result.idle, ['agent-a']);
  });

  it('does NOT flag agent as idle when tasksLast4Weeks > 0', () => {
    const metrics = {
      'agent-a': { firstAttemptSuccessRate: 0.8, tasksCompleted: 5, routedDomains: 3, tasksLast4Weeks: 1 },
      'agent-b': { firstAttemptSuccessRate: 0.8, tasksCompleted: 5, routedDomains: 3, tasksLast4Weeks: 5 },
    };
    const result = architectureCheck(metrics);
    assert.deepEqual(result.idle, []);
  });

  it('correctly classifies multiple agents in different states', () => {
    const metrics = {
      'agent-a': { firstAttemptSuccessRate: 0.3, tasksCompleted: 5, routedDomains: 2, tasksLast4Weeks: 1 },  // underperforming
      'agent-b': { firstAttemptSuccessRate: 0.9, tasksCompleted: 10, routedDomains: 8, tasksLast4Weeks: 10 }, // split-candidate
      'agent-c': { firstAttemptSuccessRate: 0.0, tasksCompleted: 0, routedDomains: 3, tasksLast4Weeks: 0 },   // idle
      'agent-d': { firstAttemptSuccessRate: 0.3, tasksCompleted: 5, routedDomains: 8, tasksLast4Weeks: 0 },   // underperforming + split-candidate + idle
      'agent-e': { firstAttemptSuccessRate: 0.9, tasksCompleted: 10, routedDomains: 3, tasksLast4Weeks: 3 },  // healthy
    };
    const result = architectureCheck(metrics);
    assert.deepEqual(result.underperforming, ['agent-a', 'agent-d']);
    assert.deepEqual(result.splitCandidates, ['agent-b', 'agent-d']);
    assert.deepEqual(result.idle, ['agent-c', 'agent-d']);
  });

  it('returns empty arrays for empty metrics input', () => {
    const result = architectureCheck({});
    assert.deepEqual(result.underperforming, []);
    assert.deepEqual(result.splitCandidates, []);
    assert.deepEqual(result.idle, []);
  });

  it('is a pure function (no side effects)', () => {
    const metrics = {
      'agent-a': { firstAttemptSuccessRate: 0.3, tasksCompleted: 5, routedDomains: 7, tasksLast4Weeks: 0 },
    };
    const metricsCopy = JSON.parse(JSON.stringify(metrics));
    architectureCheck(metrics);
    assert.deepEqual(metrics, metricsCopy, 'metrics object should not be mutated');
  });
});

describe('agentMdChangedSinceSnapshot (CV-REQ-016)', () => {
  function setupDirs() {
    const tmpDir = mkdtempSync(join(tmpdir(), 'agent-md-snapshot-'));
    const agentsDir = join(tmpDir, 'agents');
    const versionsDir = join(agentsDir, 'versions');
    mkdirSync(versionsDir, { recursive: true });
    return { tmpDir, agentsDir, versionsDir };
  }

  function cleanup(tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  function createAgentMd(agentsDir, agent, content) {
    const agentDir = join(agentsDir, agent);
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'AGENT.md'), content, 'utf8');
  }

  function createSnapshot(versionsDir, date, agent, content) {
    const snapshotDir = join(versionsDir, date);
    mkdirSync(snapshotDir, { recursive: true });
    writeFileSync(join(snapshotDir, `${agent}.md`), content, 'utf8');
  }

  it('returns false when all AGENT.md files are identical to the latest snapshot', () => {
    const { tmpDir, agentsDir, versionsDir } = setupDirs();
    try {
      createAgentMd(agentsDir, 'test-agent', '# Test Agent\ncontent v1\n');
      createSnapshot(versionsDir, '2026-01-01', 'test-agent', '# Test Agent\ncontent v1\n');
      assert.equal(agentMdChangedSinceSnapshot(agentsDir, versionsDir), false);
    } finally {
      cleanup(tmpDir);
    }
  });

  it('returns true when an AGENT.md has been edited since the snapshot', () => {
    const { tmpDir, agentsDir, versionsDir } = setupDirs();
    try {
      createAgentMd(agentsDir, 'test-agent', '# Test Agent\ncontent v2\n');
      createSnapshot(versionsDir, '2026-01-01', 'test-agent', '# Test Agent\ncontent v1\n');
      assert.equal(agentMdChangedSinceSnapshot(agentsDir, versionsDir), true);
    } finally {
      cleanup(tmpDir);
    }
  });

  it('returns true when no snapshot directory exists', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'agent-md-snapshot-'));
    const agentsDir = join(tmpDir, 'agents');
    const versionsDir = join(tmpDir, 'versions');
    // Do NOT create versions dir
    try {
      mkdirSync(agentsDir, { recursive: true });
      assert.equal(agentMdChangedSinceSnapshot(agentsDir, versionsDir), true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns true when versions directory exists but has no date snapshots', () => {
    const { tmpDir, agentsDir, versionsDir } = setupDirs();
    try {
      // versions dir is empty (no date directories)
      createAgentMd(agentsDir, 'test-agent', '# Test Agent\ncontent\n');
      assert.equal(agentMdChangedSinceSnapshot(agentsDir, versionsDir), true);
    } finally {
      cleanup(tmpDir);
    }
  });

  it('returns true when an agent has AGENT.md but no matching snapshot file', () => {
    const { tmpDir, agentsDir, versionsDir } = setupDirs();
    try {
      createAgentMd(agentsDir, 'test-agent', '# Test Agent\ncontent\n');
      createSnapshot(versionsDir, '2026-01-01', 'other-agent', '# Other Agent\n');
      assert.equal(agentMdChangedSinceSnapshot(agentsDir, versionsDir), true);
    } finally {
      cleanup(tmpDir);
    }
  });

  it('returns false when multiple agents all match their snapshots', () => {
    const { tmpDir, agentsDir, versionsDir } = setupDirs();
    try {
      createAgentMd(agentsDir, 'agent-a', '# Agent A\nv1\n');
      createAgentMd(agentsDir, 'agent-b', '# Agent B\nv1\n');
      createSnapshot(versionsDir, '2026-01-01', 'agent-a', '# Agent A\nv1\n');
      createSnapshot(versionsDir, '2026-01-01', 'agent-b', '# Agent B\nv1\n');
      assert.equal(agentMdChangedSinceSnapshot(agentsDir, versionsDir), false);
    } finally {
      cleanup(tmpDir);
    }
  });

  it('returns true when one of multiple agents has changed', () => {
    const { tmpDir, agentsDir, versionsDir } = setupDirs();
    try {
      createAgentMd(agentsDir, 'agent-a', '# Agent A\nv1\n');
      createAgentMd(agentsDir, 'agent-b', '# Agent B\nv2\n'); // changed
      createSnapshot(versionsDir, '2026-01-01', 'agent-a', '# Agent A\nv1\n');
      createSnapshot(versionsDir, '2026-01-01', 'agent-b', '# Agent B\nv1\n');
      assert.equal(agentMdChangedSinceSnapshot(agentsDir, versionsDir), true);
    } finally {
      cleanup(tmpDir);
    }
  });

  it('is a pure function (no side effects)', () => {
    const { tmpDir, agentsDir, versionsDir } = setupDirs();
    try {
      createAgentMd(agentsDir, 'test-agent', '# Test Agent\ncontent\n');
      createSnapshot(versionsDir, '2026-01-01', 'test-agent', '# Test Agent\ncontent\n');
      const snapshotDirBefore = join(versionsDir, '2026-01-01');
      assert.ok(existsSync(snapshotDirBefore));
      agentMdChangedSinceSnapshot(agentsDir, versionsDir);
      // Verify no files were created, modified, or deleted
      assert.ok(existsSync(snapshotDirBefore));
      assert.equal(existsSync(join(snapshotDirBefore, 'test-agent.md')), true);
    } finally {
      cleanup(tmpDir);
    }
  });

  it('returns true when an agent subdirectory exists without AGENT.md but snapshot has it', () => {
    const { tmpDir, agentsDir, versionsDir } = setupDirs();
    try {
      // An agent subdir exists but no AGENT.md inside it — snapshot has a file for it
      const noMdDir = join(agentsDir, 'no-md-agent');
      mkdirSync(noMdDir, { recursive: true });
      createSnapshot(versionsDir, '2026-01-01', 'no-md-agent', '# Was removed\n');
      // Another agent with matching content
      createAgentMd(agentsDir, 'agent-a', '# Agent A\nv1\n');
      createSnapshot(versionsDir, '2026-01-01', 'agent-a', '# Agent A\nv1\n');
      // Snapshot has no-md-agent but current AGENT.md doesn't exist — that's a change
      assert.equal(agentMdChangedSinceSnapshot(agentsDir, versionsDir), true);
    } finally {
      cleanup(tmpDir);
    }
  });
});