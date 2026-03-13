/**
 * instance-scaling.test.mjs
 *
 * Tests for the instance-scaling feature (tasks 9.1–9.6):
 *
 *   1. Two independent tasks assigned to two instances
 *   2. Two overlapping tasks serialised to one instance
 *   3. Budget shared correctly across instances (9.5)
 *   4. Scale suggestion shown when queue is deep (9.6)
 *
 * Run with:
 *   node --test agents/__tests__/instance-scaling.test.mjs
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const AGENTS_DIR = resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers extracted from queue-drainer source (avoids importing the CLI module
// which has top-level side-effects that require a real project on disk).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal task object.
 */
function makeTask(id, files = [], assignee = null, status = 'pending') {
  return { id, title: id, description: '', files, assignee, status, claimedBy: null };
}

/**
 * Extract and build the `baseAgentName` function from queue-drainer source.
 */
function extractBaseAgentName(src) {
  const match = src.match(/(function baseAgentName\([\s\S]*?\n\})/);
  assert.ok(match, 'Could not extract baseAgentName from queue-drainer.mjs');
  // eslint-disable-next-line no-new-func
  return new Function(`return (${match[1]})`)();
}

/**
 * Extract and build the `filePatternOverlap` function from queue-drainer source.
 * The function calls `determineAgent` and `getAgentFilePatterns` which themselves
 * reference `AGENT_DOMAINS` and `config`. We stub both by injecting replacements.
 */
function buildFilePatternOverlap(agentDomains = {}, agentConfigs = {}) {
  const src = readFileSync(resolve(AGENTS_DIR, 'queue-drainer.mjs'), 'utf8');

  // Extract determineAgent — needs AGENT_DOMAINS and config
  const determineAgentMatch = src.match(/(function determineAgent\([\s\S]*?\n\})/);
  assert.ok(determineAgentMatch, 'Could not extract determineAgent');

  const getAgentFilePatternsMatch = src.match(/(function getAgentFilePatterns\([\s\S]*?\n\})/);
  assert.ok(getAgentFilePatternsMatch, 'Could not extract getAgentFilePatterns');

  const filePatternOverlapMatch = src.match(/(function filePatternOverlap\([\s\S]*?\n\})/);
  assert.ok(filePatternOverlapMatch, 'Could not extract filePatternOverlap');

  const factory = new Function(
    'AGENT_DOMAINS', 'config',
    `
    ${determineAgentMatch[1]}
    ${getAgentFilePatternsMatch[1]}
    ${filePatternOverlapMatch[1]}
    return filePatternOverlap;
    `,
  );

  return factory(agentDomains, { agents: [], agentConfigs });
}

/**
 * Build the `getMaxInstances` function from queue-drainer source.
 */
function buildGetMaxInstances(agentConfigs = {}) {
  const src = readFileSync(resolve(AGENTS_DIR, 'queue-drainer.mjs'), 'utf8');
  const match = src.match(/(function getMaxInstances\([\s\S]*?\n\})/);
  assert.ok(match, 'Could not extract getMaxInstances from queue-drainer.mjs');
  const factory = new Function('config', `return (${match[1]})`);
  return factory({ agentConfigs });
}

/**
 * Simulate the parallel batch-assignment logic extracted from the `run --parallel`
 * branch of queue-drainer. Returns an array of { task, agent, instanceId }.
 *
 * We re-implement the same algorithm here so the test is deterministic without
 * needing real file I/O or a project on disk.
 */
function simulateParallelAssignment(tasks, agentDomains, agentConfigs) {
  const filePatternOverlap = buildFilePatternOverlap(agentDomains, agentConfigs);

  function determineAgent(task) {
    if (task.assignee && agentDomains[task.assignee]) return task.assignee;
    if (Object.keys(agentDomains).length === 0) return task.assignee || 'unassigned';
    const text = `${task.title} ${task.description} ${(task.files || []).join(' ')}`.toLowerCase();
    let bestAgent = null, bestScore = 0;
    for (const [agent, cfg] of Object.entries(agentDomains)) {
      let score = 0;
      for (const pattern of (cfg.patterns || [])) {
        if (text.includes(pattern.toLowerCase())) score++;
      }
      if (score > bestScore) { bestScore = score; bestAgent = agent; }
    }
    return bestAgent || 'unassigned';
  }

  function getMaxInstances(agentKey) {
    return agentConfigs[agentKey]?.maxInstances ?? 1;
  }

  const agentTaskCounts = {};
  const assigned = [];
  const claimedFiles = [];

  for (const task of tasks) {
    const agent = determineAgent(task);
    const taskFiles = task.files || [];

    // 9.3: file pattern conflict check
    const overlaps = claimedFiles.some(cf => {
      const set = new Set(cf);
      return taskFiles.some(f => set.has(f));
    });
    if (overlaps) continue; // serialised

    agentTaskCounts[agent] = (agentTaskCounts[agent] || 0) + 1;
    const maxInst = getMaxInstances(agent);
    const instanceNum = agentTaskCounts[agent];

    if (instanceNum > maxInst) continue; // deferred

    const instanceId = maxInst > 1 ? `${agent}-${instanceNum}` : agent;
    assigned.push({ task, agent, instanceId });
    if (taskFiles.length > 0) claimedFiles.push(taskFiles);
  }

  return assigned;
}

/**
 * Simulate checkAgentBudget budget-sharing logic (9.5).
 * Returns total usage summed across all instances of the base agent.
 */
function simulateBudgetLookup(agentName, costLog, budgetAgents, today) {
  function baseAgentName(key) {
    return key.replace(/-\d+$/, '');
  }

  const budgetKey = baseAgentName(agentName);
  const agentBudget = budgetAgents[budgetKey];
  if (!agentBudget) return { allowed: true };

  const dailyLimit = agentBudget.dailyTokens;
  const todayUsage = costLog
    .filter(e => baseAgentName(e.agent) === budgetKey && e.timestamp?.startsWith(today))
    .reduce((sum, e) => sum + (e.inputTokens || 0) + (e.outputTokens || 0), 0);

  return { allowed: todayUsage < dailyLimit, used: todayUsage, limit: dailyLimit };
}

/**
 * Simulate scale-suggestion logic from showStatus (9.6).
 * Returns array of suggestion strings.
 */
function simulateScaleSuggestions(independentTasks, inProgressTasks, agentDomains, agentConfigs) {
  function determineAgent(task) {
    if (task.assignee && agentDomains[task.assignee]) return task.assignee;
    return task.assignee || 'unassigned';
  }

  function getMaxInstances(agentKey) {
    return agentConfigs[agentKey]?.maxInstances ?? 1;
  }

  function baseAgentName(key) {
    return key.replace(/-\d+$/, '');
  }

  const domainCounts = {};
  for (const t of independentTasks) {
    const agent = determineAgent(t);
    domainCounts[agent] = (domainCounts[agent] || 0) + 1;
  }

  const suggestions = [];
  for (const [agent, count] of Object.entries(domainCounts)) {
    if (count > 3 && getMaxInstances(agent) > 1) {
      const runningInstances = inProgressTasks.filter(t => baseAgentName(t.claimedBy || '') === agent).length;
      if (runningInstances < getMaxInstances(agent)) {
        suggestions.push(`Consider scaling ${agent} (${count} unblocked tasks, max ${getMaxInstances(agent)} instances)`);
      }
    }
  }
  return suggestions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 1: Two independent tasks → two instances
// ─────────────────────────────────────────────────────────────────────────────

describe('Instance Scaling — independent tasks get unique instance IDs', () => {
  const agentDomains = {
    roy: { patterns: ['backend'], filePatterns: ['src/api'] },
  };
  const agentConfigs = {
    roy: { maxInstances: 2, permissions: 'full-edit' },
  };

  it('two tasks with different files are both assigned', () => {
    const tasks = [
      makeTask('T-001', ['src/api/auth.js'], 'roy'),
      makeTask('T-002', ['src/api/users.js'], 'roy'),
    ];
    const assigned = simulateParallelAssignment(tasks, agentDomains, agentConfigs);
    assert.equal(assigned.length, 2, 'Both tasks should be assigned');
  });

  it('first task gets instance ID roy-1', () => {
    const tasks = [
      makeTask('T-001', ['src/api/auth.js'], 'roy'),
      makeTask('T-002', ['src/api/users.js'], 'roy'),
    ];
    const assigned = simulateParallelAssignment(tasks, agentDomains, agentConfigs);
    assert.equal(assigned[0].instanceId, 'roy-1');
  });

  it('second task gets instance ID roy-2', () => {
    const tasks = [
      makeTask('T-001', ['src/api/auth.js'], 'roy'),
      makeTask('T-002', ['src/api/users.js'], 'roy'),
    ];
    const assigned = simulateParallelAssignment(tasks, agentDomains, agentConfigs);
    assert.equal(assigned[1].instanceId, 'roy-2');
  });

  it('instance IDs are unique across the two assignments', () => {
    const tasks = [
      makeTask('T-001', ['src/api/auth.js'], 'roy'),
      makeTask('T-002', ['src/api/users.js'], 'roy'),
    ];
    const assigned = simulateParallelAssignment(tasks, agentDomains, agentConfigs);
    const ids = assigned.map(a => a.instanceId);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, 'Instance IDs must be unique');
  });

  it('single-instance agent uses plain agent name (no suffix)', () => {
    const singleConfigs = {
      roy: { maxInstances: 1, permissions: 'full-edit' },
    };
    const tasks = [makeTask('T-001', ['src/api/auth.js'], 'roy')];
    const assigned = simulateParallelAssignment(tasks, agentDomains, singleConfigs);
    assert.equal(assigned[0].instanceId, 'roy', 'Single instance should use plain name');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 2: Overlapping tasks serialised to single instance
// ─────────────────────────────────────────────────────────────────────────────

describe('Instance Scaling — overlapping tasks are serialised', () => {
  const agentDomains = {
    roy: { patterns: ['backend'], filePatterns: ['src/api'] },
  };
  const agentConfigs = {
    roy: { maxInstances: 2, permissions: 'full-edit' },
  };

  it('two tasks sharing a file produce only one assignment', () => {
    const tasks = [
      makeTask('T-001', ['src/api/auth.js'], 'roy'),
      makeTask('T-002', ['src/api/auth.js'], 'roy'), // same file
    ];
    const assigned = simulateParallelAssignment(tasks, agentDomains, agentConfigs);
    assert.equal(assigned.length, 1, 'Only one task should be assigned when files overlap');
  });

  it('the first overlapping task is assigned, not the second', () => {
    const tasks = [
      makeTask('T-001', ['src/api/auth.js'], 'roy'),
      makeTask('T-002', ['src/api/auth.js'], 'roy'),
    ];
    const assigned = simulateParallelAssignment(tasks, agentDomains, agentConfigs);
    assert.equal(assigned[0].task.id, 'T-001');
  });

  it('tasks with no overlap are both assigned even for same agent', () => {
    const tasks = [
      makeTask('T-001', ['src/api/auth.js'], 'roy'),
      makeTask('T-002', ['src/api/payments.js'], 'roy'),
    ];
    const assigned = simulateParallelAssignment(tasks, agentDomains, agentConfigs);
    assert.equal(assigned.length, 2, 'Non-overlapping tasks should both be assigned');
  });

  it('filePatternOverlap returns true for two tasks sharing an explicit file', () => {
    const overlap = buildFilePatternOverlap(agentDomains, agentConfigs);
    const t1 = makeTask('T-001', ['src/api/auth.js'], 'roy');
    const t2 = makeTask('T-002', ['src/api/auth.js'], 'roy');
    assert.equal(overlap(t1, t2), true);
  });

  it('filePatternOverlap returns false for tasks with no shared files and no domain pattern match', () => {
    // Use files that don't match the 'src/api' filePattern and are distinct
    const overlap = buildFilePatternOverlap(agentDomains, agentConfigs);
    const t1 = makeTask('T-001', ['docs/readme.md'], 'roy');
    const t2 = makeTask('T-002', ['tests/unit.test.js'], 'roy');
    assert.equal(overlap(t1, t2), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 3: Budget shared correctly across instances (9.5)
// ─────────────────────────────────────────────────────────────────────────────

describe('Instance Scaling — budget shared across instances', () => {
  const today = new Date().toISOString().split('T')[0];

  it('baseAgentName strips instance suffix', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'queue-drainer.mjs'), 'utf8');
    const fn = extractBaseAgentName(src);
    assert.equal(fn('roy-1'), 'roy');
    assert.equal(fn('roy-2'), 'roy');
    assert.equal(fn('moss-3'), 'moss');
  });

  it('baseAgentName leaves plain names unchanged', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'queue-drainer.mjs'), 'utf8');
    const fn = extractBaseAgentName(src);
    assert.equal(fn('roy'), 'roy');
    assert.equal(fn('jen'), 'jen');
  });

  it('tokens from roy-1 and roy-2 both count toward roy budget', () => {
    const costLog = [
      { agent: 'roy-1', timestamp: `${today}T10:00:00Z`, inputTokens: 30000, outputTokens: 5000 },
      { agent: 'roy-2', timestamp: `${today}T10:05:00Z`, inputTokens: 30000, outputTokens: 5000 },
    ];
    const budgetAgents = { roy: { dailyTokens: 100000 } };
    const result = simulateBudgetLookup('roy-1', costLog, budgetAgents, today);
    // Combined: 70000 tokens used
    assert.equal(result.used, 70000, 'Budget should aggregate all instances');
    assert.equal(result.allowed, true, '70K < 100K limit so allowed');
  });

  it('combined instance usage that exceeds limit blocks further assignment', () => {
    const costLog = [
      { agent: 'roy-1', timestamp: `${today}T10:00:00Z`, inputTokens: 60000, outputTokens: 0 },
      { agent: 'roy-2', timestamp: `${today}T10:05:00Z`, inputTokens: 50000, outputTokens: 0 },
    ];
    const budgetAgents = { roy: { dailyTokens: 100000 } };
    const result = simulateBudgetLookup('roy', costLog, budgetAgents, today);
    assert.equal(result.used, 110000, 'Should sum tokens across all instances');
    assert.equal(result.allowed, false, '110K > 100K limit so blocked');
  });

  it('budget entries from yesterday are not counted', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const costLog = [
      { agent: 'roy', timestamp: `${yesterday}T10:00:00Z`, inputTokens: 90000, outputTokens: 0 },
    ];
    const budgetAgents = { roy: { dailyTokens: 100000 } };
    const result = simulateBudgetLookup('roy', costLog, budgetAgents, today);
    assert.equal(result.used, 0, 'Yesterday tokens should not count');
    assert.equal(result.allowed, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 4: Scale suggestion shown when queue is deep (9.6)
// ─────────────────────────────────────────────────────────────────────────────

describe('Instance Scaling — scale suggestion when queue is deep', () => {
  const agentDomains = {
    roy: { patterns: ['backend'] },
  };

  it('no suggestion when queue <= 3 tasks', () => {
    const tasks = [
      makeTask('T-001', [], 'roy'),
      makeTask('T-002', [], 'roy'),
      makeTask('T-003', [], 'roy'),
    ];
    const agentConfigs = { roy: { maxInstances: 2 } };
    const suggestions = simulateScaleSuggestions(tasks, [], agentDomains, agentConfigs);
    assert.equal(suggestions.length, 0, 'No suggestion for 3 tasks');
  });

  it('suggestion appears when queue > 3 tasks and maxInstances > 1', () => {
    const tasks = [
      makeTask('T-001', [], 'roy'),
      makeTask('T-002', [], 'roy'),
      makeTask('T-003', [], 'roy'),
      makeTask('T-004', [], 'roy'),
    ];
    const agentConfigs = { roy: { maxInstances: 2 } };
    const suggestions = simulateScaleSuggestions(tasks, [], agentDomains, agentConfigs);
    assert.equal(suggestions.length, 1, 'Should suggest scaling');
    assert.match(suggestions[0], /Consider scaling roy/);
    assert.match(suggestions[0], /4 unblocked tasks/);
    assert.match(suggestions[0], /max 2 instances/);
  });

  it('no suggestion when maxInstances is 1 even if queue is deep', () => {
    const tasks = [
      makeTask('T-001', [], 'roy'),
      makeTask('T-002', [], 'roy'),
      makeTask('T-003', [], 'roy'),
      makeTask('T-004', [], 'roy'),
    ];
    const agentConfigs = { roy: { maxInstances: 1 } };
    const suggestions = simulateScaleSuggestions(tasks, [], agentDomains, agentConfigs);
    assert.equal(suggestions.length, 0, 'No suggestion when maxInstances is 1');
  });

  it('no suggestion when all instances already running', () => {
    const tasks = [
      makeTask('T-001', [], 'roy'),
      makeTask('T-002', [], 'roy'),
      makeTask('T-003', [], 'roy'),
      makeTask('T-004', [], 'roy'),
    ];
    // Both instances already running
    const inProgress = [
      { ...makeTask('T-000', [], 'roy', 'in_progress'), claimedBy: 'roy-1' },
      { ...makeTask('T-099', [], 'roy', 'in_progress'), claimedBy: 'roy-2' },
    ];
    const agentConfigs = { roy: { maxInstances: 2 } };
    const suggestions = simulateScaleSuggestions(tasks, inProgress, agentDomains, agentConfigs);
    assert.equal(suggestions.length, 0, 'No suggestion when all instances already running');
  });

  it('suggestion includes the correct agent name and counts', () => {
    const mossDomains = { moss: { patterns: ['ai'] } };
    const tasks = Array.from({ length: 5 }, (_, i) => makeTask(`T-00${i}`, [], 'moss'));
    const agentConfigs = { moss: { maxInstances: 3 } };
    const suggestions = simulateScaleSuggestions(tasks, [], mossDomains, agentConfigs);
    assert.equal(suggestions.length, 1);
    assert.match(suggestions[0], /moss/);
    assert.match(suggestions[0], /5 unblocked tasks/);
    assert.match(suggestions[0], /max 3 instances/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 5: load-config.mjs maxInstances field (9.1)
// ─────────────────────────────────────────────────────────────────────────────

describe('load-config.mjs — maxInstances field', () => {
  it('getMaxInstances returns 1 by default when maxInstances not in config', () => {
    const getMaxInstances = buildGetMaxInstances({});
    assert.equal(getMaxInstances('roy'), 1);
  });

  it('getMaxInstances returns the configured value', () => {
    const getMaxInstances = buildGetMaxInstances({ roy: { maxInstances: 3 } });
    assert.equal(getMaxInstances('roy'), 3);
  });

  it('getMaxInstances returns 1 when maxInstances is explicitly 1', () => {
    const getMaxInstances = buildGetMaxInstances({ moss: { maxInstances: 1 } });
    assert.equal(getMaxInstances('moss'), 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 6: worker.mjs generateInstanceSection (9.4)
// ─────────────────────────────────────────────────────────────────────────────

describe('worker.mjs — instance awareness injected into prompt', () => {
  let generateInstanceSection;

  before(() => {
    const src = readFileSync(resolve(AGENTS_DIR, 'worker.mjs'), 'utf8');
    const match = src.match(/(function generateInstanceSection\([\s\S]*?\n\})/);
    assert.ok(match, 'Could not extract generateInstanceSection from worker.mjs');
    // eslint-disable-next-line no-new-func
    generateInstanceSection = new Function(`return (${match[1]})`)();
  });

  it('returns empty string when task has no instanceId', () => {
    const task = makeTask('T-001', [], 'roy');
    assert.equal(generateInstanceSection(task), '');
  });

  it('returns empty string when instanceId equals assignee (single instance)', () => {
    const task = { ...makeTask('T-001', [], 'roy'), instanceId: 'roy' };
    assert.equal(generateInstanceSection(task), '');
  });

  it('returns non-empty section when instanceId differs from assignee', () => {
    const task = { ...makeTask('T-001', [], 'roy'), instanceId: 'roy-2', assignee: 'roy' };
    const section = generateInstanceSection(task);
    assert.ok(section.length > 0, 'Expected instance section to be non-empty');
  });

  it('section contains Instance Awareness heading', () => {
    const task = { ...makeTask('T-001', [], 'roy'), instanceId: 'roy-1', assignee: 'roy' };
    const section = generateInstanceSection(task);
    assert.match(section, /Instance Awareness/i);
  });

  it('section contains the instance ID', () => {
    const task = { ...makeTask('T-001', [], 'roy'), instanceId: 'roy-2', assignee: 'roy' };
    const section = generateInstanceSection(task);
    assert.match(section, /roy-2/);
  });

  it('section contains filesToAvoid when provided', () => {
    const task = {
      ...makeTask('T-001', ['src/api/users.js'], 'roy'),
      instanceId: 'roy-2',
      assignee: 'roy',
      filesToAvoid: ['src/api/auth.js'],
    };
    const section = generateInstanceSection(task);
    assert.match(section, /src\/api\/auth\.js/);
    assert.match(section, /DO NOT TOUCH/i);
  });
});
