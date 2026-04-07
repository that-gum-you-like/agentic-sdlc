#!/usr/bin/env node
/**
 * Queue Drainer — Reads task queue, assigns to the right agent, launches Claude subagents.
 *
 * Usage:
 *   queue-drainer.mjs run              # Process next available task
 *   queue-drainer.mjs run --parallel   # Process all independent tasks in parallel
 *   queue-drainer.mjs status           # Show queue status
 *   queue-drainer.mjs assign <task-id> # Manually assign a specific task
 *   queue-drainer.mjs reset <task-id>  # Reset a stuck task back to pending
 *   queue-drainer.mjs claim <task-id> <agent>  # Claim a task for an agent
 *   queue-drainer.mjs release <task-id>        # Release a claimed task
 *   queue-drainer.mjs archive                  # Move completed tasks to completed/
 *
 * Agent domains are loaded from <project>/agents/domains.json.
 * If not found, falls back to manual assignment.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { execSync } from 'child_process';
import { loadConfig } from './load-config.mjs';
import { triggerNotification, notifyHumanTask, runWellnessCheck } from './notify.mjs';
import { logCapabilityUsage } from './capability-logger.mjs';
import { loadOrchestrationAdapter } from './adapters/load-adapter.mjs';

let validate = null;
try {
  const sv = await import('./schema-validator.mjs');
  validate = sv.validate;
} catch {
  // schema validator not available
}

const config = loadConfig();
const PROJECT_DIR = config.projectDir;
const TASKS_DIR = config.tasksDir;
const COMPLETED_DIR = config.completedDir;
const AGENTS_DIR = config.agentsDir;
const BUDGET_PATH = config.budgetPath;
const COST_LOG_PATH = config.costLogPath;

const PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const STALE_CLAIM_MS = 30 * 60 * 1000; // 30 minutes
const PERMISSION_HIERARCHY = { 'read-only': 0, 'edit-gated': 1, 'full-edit': 2, 'deploy': 3 };

// Load agent domains from project's agents/domains.json
function loadAgentDomains() {
  const domainsPath = resolve(AGENTS_DIR, 'domains.json');
  if (existsSync(domainsPath)) {
    try {
      return JSON.parse(readFileSync(domainsPath, 'utf8'));
    } catch {
      console.warn('⚠️  Failed to parse domains.json, falling back to manual assignment');
    }
  }
  // Return empty domains — all tasks will need manual assignment
  return {};
}

const AGENT_DOMAINS = loadAgentDomains();

// Load orchestration adapter (file-based by default, configurable via project.json)
import * as fileBased from './adapters/orchestration/file-based.mjs';

function loadTasks() {
  return fileBased.loadTasks(TASKS_DIR);
}

function loadCompletedCount() {
  return fileBased.loadCompletedCount(COMPLETED_DIR);
}

function loadHumanTasks() {
  return fileBased.loadHumanTasks(config.humanQueueDir);
}

function saveHumanTask(task) {
  fileBased.saveHumanTask(config.humanQueueDir, task);
}

function saveTask(task) {
  fileBased.saveTask(TASKS_DIR, task);
}

/**
 * Parse a <!-- CAPABILITY_CHECKLIST --> JSON block from agent output text.
 * Returns the parsed checklist object, or null if not found / malformed.
 */
function parseCapabilityChecklist(taskId, outputText) {
  if (!outputText) return null;

  const startTag = '<!-- CAPABILITY_CHECKLIST -->';
  const endTag = '<!-- /CAPABILITY_CHECKLIST -->';

  const startIdx = outputText.indexOf(startTag);
  const endIdx = outputText.indexOf(endTag);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return null;
  }

  const raw = outputText.slice(startIdx + startTag.length, endIdx).trim();

  // Strip markdown code fences if present
  const stripped = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

  try {
    const parsed = JSON.parse(stripped);
    return parsed;
  } catch {
    console.warn(`Warning: malformed capability checklist JSON for ${taskId} — storing as null`);
    return null;
  }
}

function determineAgent(task) {
  const text = `${task.title} ${task.description} ${(task.files || []).join(' ')}`.toLowerCase();

  // If explicitly assigned, use that
  if (task.assignee && AGENT_DOMAINS[task.assignee]) return task.assignee;

  // If no domains configured, default to first agent or 'unassigned'
  if (Object.keys(AGENT_DOMAINS).length === 0) {
    return task.assignee || config.agents[0] || 'unassigned';
  }

  // Score each agent based on pattern matches
  let bestAgent = null;
  let bestScore = 0;

  for (const [agent, agentConfig] of Object.entries(AGENT_DOMAINS)) {
    let score = 0;
    for (const pattern of (agentConfig.patterns || [])) {
      if (text.includes(pattern.toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent;
    }
  }

  return bestAgent || config.agents[0] || 'unassigned';
}

function sortByPriority(tasks) {
  return tasks.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? PRIORITY_ORDER.MEDIUM;
    const pb = PRIORITY_ORDER[b.priority] ?? PRIORITY_ORDER.MEDIUM;
    return pa - pb;
  });
}

function findIndependentTasks(tasks) {
  const pending = tasks.filter(t => t.status === 'pending');

  // A task is independent if none of its blockedBy are incomplete
  const independent = pending.filter(task => {
    if (!task.blockedBy || task.blockedBy.length === 0) return true;
    return task.blockedBy.every(depId => {
      const dep = tasks.find(t => t.id === depId);
      return dep && dep.status === 'completed';
    });
  });

  return sortByPriority(independent);
}

function isClaimedByOther(task) {
  return task.claimedBy != null;
}

function isStaleClaim(task) {
  if (!task.claimedAt || task.status !== 'in_progress') return false;
  const elapsed = Date.now() - new Date(task.claimedAt).getTime();
  return elapsed > STALE_CLAIM_MS;
}

function touchesSameFiles(task1, task2) {
  const files1 = new Set(task1.files || []);
  const files2 = new Set(task2.files || []);
  for (const f of files1) {
    if (files2.has(f)) return true;
  }

  // Also check if same agent domain
  const agent1 = determineAgent(task1);
  const agent2 = determineAgent(task2);
  return agent1 === agent2;
}

function getParallelizable(independentTasks) {
  // Filter out claimed tasks for parallel assignment
  const unclaimed = independentTasks.filter(t => !isClaimedByOther(t));
  const groups = [];

  for (const task of unclaimed) {
    let placed = false;
    // Try to place in an existing group that has no file conflicts
    for (const group of groups) {
      if (!group.some(t => touchesSameFiles(t, task))) {
        group.push(task);
        placed = true;
        break;
      }
    }
    // If no compatible group found, create a new group
    if (!placed) {
      groups.push([task]);
    }
  }

  return groups;
}

function checkAgentBudget(agentName) {
  if (!existsSync(BUDGET_PATH)) return { allowed: true };
  if (!existsSync(COST_LOG_PATH)) return { allowed: true };

  // 9.5: use base agent name (e.g. "roy" from "roy-2") for budget lookup
  const budgetKey = baseAgentName(agentName);

  const budget = JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
  const agentBudget = budget.agents?.[budgetKey];
  if (!agentBudget) return { allowed: true };

  // Check if model-manager has marked this agent as budget-exhausted
  if (agentBudget.activeModel === 'budget-exhausted') {
    return {
      allowed: false,
      used: agentBudget.dailyTokens,
      limit: agentBudget.dailyTokens,
      exhausted: true,
      conservation: budget.conservationMode || false,
    };
  }

  const dailyLimit = budget.conservationMode
    ? Math.floor(agentBudget.dailyTokens / 2)
    : agentBudget.dailyTokens;

  const costLog = JSON.parse(readFileSync(COST_LOG_PATH, 'utf8'));
  const today = new Date().toISOString().split('T')[0];
  // 9.5: count tokens from all instances of this agent (roy, roy-1, roy-2, etc.)
  const todayUsage = costLog
    .filter(e => baseAgentName(e.agent) === budgetKey && e.timestamp?.startsWith(today))
    .reduce((sum, e) => sum + (e.inputTokens || 0) + (e.outputTokens || 0), 0);

  const pct = dailyLimit > 0 ? Math.round((todayUsage / dailyLimit) * 100) : 0;
  if (pct >= 80 && pct < 100) {
    triggerNotification('budgetAlert', `⚠️ Agent ${agentName} at ${pct}% of daily budget (${todayUsage.toLocaleString()}/${dailyLimit.toLocaleString()} tokens)`);
  }

  return {
    allowed: todayUsage < dailyLimit,
    used: todayUsage,
    limit: dailyLimit,
    conservation: budget.conservationMode || false,
  };
}

function getAgentName(agentKey) {
  return AGENT_DOMAINS[agentKey]?.name || agentKey;
}

function getAgentPermission(agentKey) {
  return config.agentConfigs?.[agentKey]?.permissions || 'full-edit';
}

function agentMeetsPermission(agentKey, requiredPermission) {
  const agentLevel = PERMISSION_HIERARCHY[getAgentPermission(agentKey)] ?? PERMISSION_HIERARCHY['full-edit'];
  const requiredLevel = PERMISSION_HIERARCHY[requiredPermission] ?? 0;
  return agentLevel >= requiredLevel;
}

// 9.1 / 9.2: maxInstances from budget config, default 1
function getMaxInstances(agentKey) {
  return config.agentConfigs?.[agentKey]?.maxInstances ?? 1;
}

// 9.5: strip instance suffix (e.g. "roy-2" → "roy") for budget lookup
function baseAgentName(agentKey) {
  return agentKey.replace(/-\d+$/, '');
}

// 9.3: Get file patterns declared in domains.json for an agent
function getAgentFilePatterns(agentKey) {
  return AGENT_DOMAINS[agentKey]?.filePatterns || [];
}

// 9.3: Check whether two tasks' file patterns overlap (explicit files or domain patterns)
function filePatternOverlap(task1, task2) {
  const files1 = task1.files || [];
  const files2 = task2.files || [];

  // Direct file overlap
  const set1 = new Set(files1);
  for (const f of files2) {
    if (set1.has(f)) return true;
  }

  // Domain pattern overlap: both tasks reference files matching the same agent's filePatterns
  const agent1 = determineAgent(task1);
  const agent2 = determineAgent(task2);
  if (agent1 === agent2) {
    const patterns = getAgentFilePatterns(agent1);
    if (patterns.length > 0) {
      const text1 = files1.join(' ');
      const text2 = files2.join(' ');
      for (const pattern of patterns) {
        if (text1.includes(pattern) && text2.includes(pattern)) return true;
      }
    }
  }

  return false;
}

function showStatus(tasks) {
  const pending = tasks.filter(t => t.status === 'pending');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const completed = tasks.filter(t => t.status === 'completed');
  const archivedCount = loadCompletedCount();
  const independent = findIndependentTasks(tasks);

  // Human Tasks section (12.3)
  const humanTasks = loadHumanTasks().filter(t => t.status !== 'completed');
  if (humanTasks.length > 0) {
    const now = Date.now();
    const URGENCY_ICON = { blocker: '🚨', normal: '⚠️ ', low: '💤' };
    console.log(`\n👤 Human Tasks (${humanTasks.length} pending)`);
    console.log(`${'─'.repeat(50)}`);
    for (const ht of humanTasks) {
      const ageDays = Math.floor((now - new Date(ht.createdAt).getTime()) / (24 * 60 * 60 * 1000));
      const ageStr = ageDays === 0 ? 'today' : `${ageDays}d old`;
      const icon = URGENCY_ICON[ht.urgency] || '⚠️ ';
      const unblocks = ht.unblocks?.length > 0 ? ` → unblocks: ${ht.unblocks.join(', ')}` : '';
      console.log(`  ${icon} [${ht.id}] (${ht.urgency}) ${ht.title} [${ageStr}]${unblocks}`);
    }
    console.log(`${'─'.repeat(50)}`);
  }

  console.log(`\n📋 Queue Status (${config.name})`);
  console.log(`${'─'.repeat(50)}`);
  console.log(`  Pending:     ${pending.length}`);
  console.log(`  In Progress: ${inProgress.length}`);
  console.log(`  Completed:   ${completed.length} (+ ${archivedCount} archived)`);
  console.log(`  Ready (unblocked): ${independent.length}`);
  console.log(`${'─'.repeat(50)}`);

  if (inProgress.length > 0) {
    console.log(`\n🔄 In Progress:`);
    for (const t of inProgress) {
      const stale = isStaleClaim(t);
      const staleStr = stale ? ' ⚠️  STALE CLAIM' : '';
      const claimed = t.claimedBy ? ` [claimed: ${t.claimedBy}]` : '';
      const tokens = t.estimatedTokens != null ? ` ~${t.estimatedTokens.toLocaleString()} tokens` : '';
      const perm = getAgentPermission(t.assignee);
      // Show escalation info if task has structured blockedBy with escalation data
      let escalationStr = '';
      if (t.blockedBy && typeof t.blockedBy === 'object' && t.blockedBy.tier) {
        const esc = t.blockedBy;
        const escAge = esc.escalatedAt ? Math.round((Date.now() - new Date(esc.escalatedAt).getTime()) / 60000) : 0;
        escalationStr = ` 🔺 ESCALATION tier:${esc.tier} (${escAge}m) — ${esc.reason || 'no reason'}`;
      }
      console.log(`  [${t.id}] ${t.title} → ${getAgentName(t.assignee)} [${perm}]${claimed}${tokens}${staleStr}${escalationStr}`);
      if (stale) {
        triggerNotification('blocker', `🚫 Task ${t.id} "${t.title}" has a stale claim (${t.claimedBy}, started ${t.claimedAt})`);
      }
    }
  }

  if (independent.length > 0) {
    console.log(`\n⏳ Ready to Start (by priority):`);
    for (const t of independent) {
      const agent = determineAgent(t);
      const pri = t.priority || 'MEDIUM';
      const claimed = t.claimedBy ? ` [claimed: ${t.claimedBy}]` : '';
      const tokens = t.estimatedTokens != null ? ` ~${t.estimatedTokens.toLocaleString()} tokens` : '';
      const perm = getAgentPermission(agent);
      const permSkip = t.requiredPermission && !agentMeetsPermission(agent, t.requiredPermission)
        ? ` ⛔ needs ${t.requiredPermission}` : '';
      console.log(`  [${t.id}] (${pri}) ${t.title} → ${getAgentName(agent)} [${perm}]${claimed}${tokens}${permSkip}`);
    }
  }

  const groups = getParallelizable(independent);
  if (groups.length > 0 && groups[0].length > 1) {
    console.log(`\n⚡ Can parallelize: ${groups[0].length} tasks in first batch`);
  }

  // 9.6: Scale suggestions — warn when queue depth > 3 for a domain and maxInstances not reached
  const domainCounts = {};
  for (const t of independent) {
    const agent = determineAgent(t);
    domainCounts[agent] = (domainCounts[agent] || 0) + 1;
  }
  const suggestions = [];
  for (const [agent, count] of Object.entries(domainCounts)) {
    if (count > 3 && getMaxInstances(agent) > 1) {
      // Only suggest if fewer instances are running than max
      const runningInstances = inProgress.filter(t => baseAgentName(t.claimedBy || '') === agent).length;
      if (runningInstances < getMaxInstances(agent)) {
        suggestions.push(`  Consider scaling ${agent} (${count} unblocked tasks, max ${getMaxInstances(agent)} instances)`);
      }
    }
  }
  if (suggestions.length > 0) {
    console.log(`\n📈 Scale Suggestions:`);
    for (const s of suggestions) console.log(s);
  }

  // 10.3: Cadence — next commit window per agent
  const cadence = config.cadence;
  if (cadence && Object.keys(cadence.agentOffsets || {}).length > 0) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const windowMinutes = cadence.commitWindowMinutes || 15;

    console.log(`\n⏱  Commit Cadence (${windowMinutes}-min windows):`);
    for (const [agent, offset] of Object.entries(cadence.agentOffsets)) {
      // Build list of window start times within the hour
      const windowsInHour = [];
      for (let t = offset; t < 60; t += windowMinutes) {
        windowsInHour.push(t);
      }
      // Find next window (look across current and next hour)
      let nextMinutes = null;
      for (const wm of windowsInHour) {
        const absMinutes = now.getHours() * 60 + wm;
        if (absMinutes > currentMinutes) { nextMinutes = absMinutes; break; }
      }
      if (nextMinutes === null) {
        // Wrap to next hour
        nextMinutes = (now.getHours() + 1) * 60 + windowsInHour[0];
      }
      const nextH = Math.floor(nextMinutes / 60) % 24;
      const nextM = nextMinutes % 60;
      const nextStr = `${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`;
      const minsUntil = nextMinutes - currentMinutes;
      console.log(`  ${getAgentName(agent).padEnd(12)} next window: ${nextStr} (in ${minsUntil} min)`);
    }
  }
}

// CLI entry point
const [,, cmd, ...args] = process.argv;

const tasks = loadTasks();

switch (cmd) {
  case 'status':
    showStatus(tasks);
    break;

  case 'run': {
    const parallel = args.includes('--parallel');
    const independent = findIndependentTasks(tasks);

    if (independent.length === 0) {
      console.log('No tasks ready to run.');
      break;
    }

    if (parallel) {
      const groups = getParallelizable(independent);
      const batch = groups[0] || [];

      // 9.2: Build multi-instance assignments per agent
      // Count how many tasks per agent domain are in this batch; if > 1 and maxInstances > 1,
      // assign unique instance IDs (roy-1, roy-2, ...). Serialise if file patterns overlap (9.3).
      const agentTaskCounts = {};
      const assignedTasks = []; // tasks that will actually be launched
      const claimedFiles = []; // track files claimed so far to detect overlap (9.3)

      for (const task of batch) {
        const agent = determineAgent(task);
        const taskFiles = task.files || [];

        // 9.3: Check overlap with already-claimed files in this batch
        const overlaps = claimedFiles.some(cf => {
          const set = new Set(cf);
          return taskFiles.some(f => set.has(f));
        });
        if (overlaps) {
          console.log(`  ↩️  [${task.id}] Serialised — file pattern conflict with another task in batch`);
          continue;
        }

        agentTaskCounts[agent] = (agentTaskCounts[agent] || 0) + 1;
        const maxInst = getMaxInstances(agent);
        const instanceNum = agentTaskCounts[agent];

        // If this agent can only run one instance, skip extra tasks
        if (instanceNum > maxInst) {
          console.log(`  ⏭️  [${task.id}] Deferred — ${agent} max instances (${maxInst}) reached`);
          continue;
        }

        // Assign instance ID only when running multiple instances
        const instanceId = maxInst > 1 ? `${agent}-${instanceNum}` : agent;

        assignedTasks.push({ task, agent, instanceId });
        if (taskFiles.length > 0) claimedFiles.push(taskFiles);
      }

      console.log(`\nLaunching ${assignedTasks.length} tasks in parallel:`);
      for (const { task, agent, instanceId } of assignedTasks) {
        if (task.requiredPermission && !agentMeetsPermission(agent, task.requiredPermission)) {
          console.log(`  ⛔ [${task.id}] Skipped — ${agent} [${getAgentPermission(agent)}] lacks required permission: ${task.requiredPermission}`);
          continue;
        }
        // 9.5: budget check uses base agent name
        const budgetCheck = checkAgentBudget(agent);
        if (!budgetCheck.allowed) {
          const reason = budgetCheck.exhausted
            ? `${agent} budget-exhausted (all fallback models depleted)`
            : `${agent} over budget (${budgetCheck.used}/${budgetCheck.limit} tokens)`;
          console.log(`  ⚠️  [${task.id}] Skipped — ${reason}`);
          continue;
        }
        task.status = 'in_progress';
        task.assignee = agent;
        task.instanceId = instanceId;
        task.claimedBy = instanceId;
        task.claimedAt = new Date().toISOString();
        task.started_at = new Date().toISOString();
        saveTask(task);
        const instLabel = instanceId !== agent ? ` (instance: ${instanceId})` : '';
        console.log(`  [${task.id}] ${task.title} → ${getAgentName(agent)}${instLabel}`);
      }
      // Advisory wellness check — never blocks assignment (13.4, 13.5)
      try { runWellnessCheck(); } catch { /* wellness is advisory only */ }
    } else {
      const task = independent[0];
      const agent = determineAgent(task);
      if (task.requiredPermission && !agentMeetsPermission(agent, task.requiredPermission)) {
        console.log(`⛔ Agent ${agent} [${getAgentPermission(agent)}] lacks required permission: ${task.requiredPermission}. Skipping.`);
        break;
      }
      const budgetCheck = checkAgentBudget(agent);
      if (!budgetCheck.allowed) {
        const reason = budgetCheck.exhausted
          ? `${agent} budget-exhausted (all fallback models depleted)`
          : `${agent} over budget (${budgetCheck.used}/${budgetCheck.limit} tokens)`;
        console.log(`⚠️  ${reason}. Skipping.`);
        break;
      }
      task.status = 'in_progress';
      task.assignee = agent;
      task.claimedBy = agent;
      task.claimedAt = new Date().toISOString();
      task.started_at = new Date().toISOString();
      saveTask(task);
      console.log(`\nAssigned [${task.id}] ${task.title} → ${getAgentName(agent)}`);
      // Advisory wellness check — never blocks assignment (13.4, 13.5)
      try { runWellnessCheck(); } catch { /* wellness is advisory only */ }
    }
    break;
  }

  case 'assign': {
    const taskId = args[0];
    const task = tasks.find(t => t.id === taskId);
    if (!task) { console.error(`Task ${taskId} not found`); break; }
    const agent = determineAgent(task);
    task.assignee = agent;
    saveTask(task);
    console.log(`Assigned [${task.id}] → ${getAgentName(agent)}`);
    break;
  }

  case 'claim': {
    const taskId = args[0];
    const agentName = args[1];
    const task = tasks.find(t => t.id === taskId);
    if (!task) { console.error(`Task ${taskId} not found`); break; }
    if (!agentName) { console.error('Usage: claim <task-id> <agent>'); break; }
    if (validate) {
      try { logCapabilityUsage('schemaValidation', agentName, taskId, 'queue-drainer.mjs', 'claim'); } catch {}
      const claimData = {
        taskId: taskId,
        agentName: agentName,
        claimedAt: new Date().toISOString(),
        estimatedTokens: task.estimatedTokens || 0,
      };
      const result = await validate('task-claim', claimData);
      if (!result.valid) {
        console.warn(`⚠️  task-claim schema validation failed for [${taskId}]:`);
        for (const err of result.errors) {
          console.warn(`   ${err.field}: ${err.message}`);
        }
      }
    }
    task.claimedBy = agentName;
    task.claimedAt = new Date().toISOString();
    saveTask(task);
    console.log(`Claimed [${task.id}] for ${agentName}`);
    break;
  }

  case 'release': {
    const taskId = args[0];
    const task = tasks.find(t => t.id === taskId);
    if (!task) { console.error(`Task ${taskId} not found`); break; }
    task.claimedBy = null;
    task.claimedAt = null;
    saveTask(task);
    console.log(`Released [${task.id}]`);
    break;
  }

  case 'complete': {
    const taskId = args[0];
    const testStatus = args[1]; // 'passing' or 'failing'
    // Optional: --output <path-to-agent-output-file> for checklist parsing
    const outputIdx = args.indexOf('--output');
    const agentOutputPath = outputIdx !== -1 ? args[outputIdx + 1] : null;

    const task = tasks.find(t => t.id === taskId);
    if (!task) { console.error(`Task ${taskId} not found`); break; }

    if (testStatus !== 'passing') {
      console.error(`❌ Cannot complete ${taskId}: test_status must be 'passing' (got '${testStatus || 'none'}')`);
      console.error(`   Run tests first: ${config.testCmd}`);
      break;
    }

    // Parse capability checklist from agent output (3.1 / 3.2)
    let capabilityChecklist = null;
    if (agentOutputPath && existsSync(agentOutputPath)) {
      try {
        const agentOutput = readFileSync(agentOutputPath, 'utf8');
        capabilityChecklist = parseCapabilityChecklist(taskId, agentOutput);
        if (capabilityChecklist === null) {
          console.warn(`Warning: no capability checklist found in output for ${taskId}`);
        }
      } catch {
        console.warn(`Warning: no capability checklist found in output for ${taskId}`);
      }
    } else {
      // No output file provided — warn but do not block completion (3.2)
      console.warn(`Warning: no capability checklist found in output for ${taskId}`);
    }
    task.capabilityChecklist = capabilityChecklist;

    if (validate) {
      try { logCapabilityUsage('schemaValidation', task.claimedBy || 'system', taskId, 'queue-drainer.mjs', 'complete'); } catch {}
      const completeData = {
        taskId: taskId,
        agentName: task.claimedBy || 'unknown',
        filesChanged: task.filesChanged || [],
        testsPassed: task.testsPassed || 0,
        testsFailed: task.testsFailed || 0,
        commitHash: task.commitHash || '',
        learnings: task.learnings || [],
      };
      const result = await validate('task-complete', completeData);
      if (!result.valid) {
        console.warn(`⚠️  task-complete schema validation failed for [${taskId}]:`);
        for (const err of result.errors) {
          console.warn(`   ${err.field}: ${err.message}`);
        }
      }
    }

    // Approval gate: if task requires approval, notify human
    if (task.approvalRequired) {
      const { sendNotification } = await import('./notify.mjs');
      sendNotification(`🔔 APPROVAL REQUESTED: Task ${task.id} "${task.title}" completed with passing tests. Approve?`);
      console.log(`📋 Approval requested for [${task.id}] — check with: node agents/notify.mjs pending`);
    }

    task.status = 'completed';
    task.test_status = 'passing';
    task.completed_at = new Date().toISOString();
    saveTask(task);

    // Append to performance ledger for model-manager analysis
    try {
      const ledgerPath = config.performanceLedgerPath;
      const agentBudget = config.agentConfigs?.[task.claimedBy] || {};
      const ledgerEntry = {
        ts: task.completed_at,
        event: 'task-complete',
        agent: task.claimedBy || 'unknown',
        model: agentBudget.activeModel || agentBudget.model || 'unknown',
        provider: agentBudget.provider || 'anthropic',
        taskId: task.id,
        taskType: task.taskType || 'unknown',
        tokensUsed: task.tokensUsed || task.estimatedTokens || 0,
        success: true,
        testsPassed: testStatus === 'passing',
        duration: task.started_at ? Math.round((Date.now() - new Date(task.started_at).getTime()) / 1000) : 0,
        firstAttempt: !task.retryCount || task.retryCount === 0,
      };
      const { appendFileSync: appendLedger } = await import('fs');
      appendLedger(ledgerPath, JSON.stringify(ledgerEntry) + '\n');
    } catch { /* performance ledger is best-effort */ }

    console.log(`✅ Completed [${task.id}] ${task.title} (tests: passing)`);
    triggerNotification('deployComplete', `✅ Task ${task.id} completed: ${task.title}`);
    break;
  }

  case 'archive': {
    const completedTasks = tasks.filter(t => t.status === 'completed');
    if (completedTasks.length === 0) {
      console.log('No completed tasks to archive.');
      break;
    }
    for (const task of completedTasks) {
      fileBased.archiveTask(TASKS_DIR, COMPLETED_DIR, task);
      console.log(`  Archived ${task._file}`);
    }
    console.log(`\n📦 Archived ${completedTasks.length} completed tasks to tasks/completed/`);
    break;
  }

  case 'reset': {
    const taskId = args[0];
    const task = tasks.find(t => t.id === taskId);
    if (!task) { console.error(`Task ${taskId} not found`); break; }
    task.status = 'pending';
    task.claimedBy = null;
    task.claimedAt = null;
    delete task.assignee;
    delete task.started_at;
    delete task.completed_at;
    delete task.test_status;
    saveTask(task);
    console.log(`Reset [${task.id}] to pending`);
    break;
  }

  // 12.2: human-status — list pending human tasks
  case 'human-status': {
    const humanTasks = loadHumanTasks();
    const pending = humanTasks.filter(t => t.status !== 'completed');
    if (pending.length === 0) {
      console.log('✅ No pending human tasks.');
      break;
    }
    const now = Date.now();
    const URGENCY_ICON = { blocker: '🚨', normal: '⚠️ ', low: '💤' };
    console.log(`\n👤 Pending Human Tasks (${pending.length})`);
    console.log(`${'─'.repeat(50)}`);
    for (const ht of pending) {
      const ageDays = Math.floor((now - new Date(ht.createdAt).getTime()) / (24 * 60 * 60 * 1000));
      const ageStr = ageDays === 0 ? 'today' : `${ageDays}d old`;
      const icon = URGENCY_ICON[ht.urgency] || '⚠️ ';
      const unblocks = ht.unblocks?.length > 0 ? `\n      Unblocks: ${ht.unblocks.join(', ')}` : '';
      console.log(`  ${icon} [${ht.id}] (${ht.urgency}) ${ht.title} [${ageStr}]`);
      console.log(`      ${ht.description}${unblocks}`);
    }
    break;
  }

  // 12.2 + 12.6: human-complete <id> — mark done and unblock dependent agent tasks
  case 'human-complete': {
    const htId = args[0];
    if (!htId) { console.error('Usage: human-complete <id>'); break; }

    const humanTasks = loadHumanTasks();
    const ht = humanTasks.find(t => t.id === htId);
    if (!ht) { console.error(`Human task ${htId} not found`); break; }

    ht.status = 'completed';
    ht.completedAt = new Date().toISOString();
    saveHumanTask(ht);
    console.log(`✅ Human task ${htId} marked completed.`);

    // 12.6: auto-unblock dependent agent tasks
    if (ht.unblocks && ht.unblocks.length > 0) {
      for (const blockedId of ht.unblocks) {
        const agentTask = tasks.find(t => t.id === blockedId);
        if (agentTask && agentTask.status === 'blocked') {
          agentTask.status = 'pending';
          saveTask(agentTask);
          console.log(`  ↳ Unblocked agent task [${blockedId}] ${agentTask.title}`);
        }
      }
    }
    break;
  }

  default:
    console.log(`Usage:
  queue-drainer.mjs run              # Process next task
  queue-drainer.mjs run --parallel   # Process independent tasks in parallel
  queue-drainer.mjs status           # Show queue status
  queue-drainer.mjs assign <task-id> # Auto-assign a task
  queue-drainer.mjs claim <task-id> <agent>  # Claim a task for an agent
  queue-drainer.mjs release <task-id>        # Release a claimed task
  queue-drainer.mjs complete <task-id> passing  # Mark task done (requires passing tests)
  queue-drainer.mjs archive                  # Move completed tasks to completed/
  queue-drainer.mjs reset <task-id>  # Reset a stuck task
  queue-drainer.mjs human-status     # List pending human tasks
  queue-drainer.mjs human-complete <id>  # Mark human task done and unblock agent tasks`);
}
