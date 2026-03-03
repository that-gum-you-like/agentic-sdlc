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

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync } from 'fs';
import { resolve, join } from 'path';
import { execSync } from 'child_process';
import { loadConfig } from './load-config.mjs';

const config = loadConfig();
const PROJECT_DIR = config.projectDir;
const TASKS_DIR = config.tasksDir;
const COMPLETED_DIR = config.completedDir;
const AGENTS_DIR = config.agentsDir;
const BUDGET_PATH = config.budgetPath;
const COST_LOG_PATH = config.costLogPath;

const PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const STALE_CLAIM_MS = 30 * 60 * 1000; // 30 minutes

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

function loadTasks() {
  const tasks = [];
  if (!existsSync(TASKS_DIR)) return tasks;

  const files = readdirSync(TASKS_DIR).filter(f => f.endsWith('.json')).sort();
  for (const file of files) {
    const task = JSON.parse(readFileSync(join(TASKS_DIR, file), 'utf8'));
    task._file = file;
    tasks.push(task);
  }
  return tasks;
}

function loadCompletedCount() {
  if (!existsSync(COMPLETED_DIR)) return 0;
  return readdirSync(COMPLETED_DIR).filter(f => f.endsWith('.json')).length;
}

function saveTask(task) {
  writeFileSync(join(TASKS_DIR, task._file), JSON.stringify(task, null, 2));
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

  const budget = JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
  const agentBudget = budget.agents?.[agentName];
  if (!agentBudget) return { allowed: true };

  const dailyLimit = budget.conservationMode
    ? Math.floor(agentBudget.dailyTokens / 2)
    : agentBudget.dailyTokens;

  const costLog = JSON.parse(readFileSync(COST_LOG_PATH, 'utf8'));
  const today = new Date().toISOString().split('T')[0];
  const todayUsage = costLog
    .filter(e => e.agent === agentName && e.timestamp?.startsWith(today))
    .reduce((sum, e) => sum + (e.inputTokens || 0) + (e.outputTokens || 0), 0);

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

function showStatus(tasks) {
  const pending = tasks.filter(t => t.status === 'pending');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const completed = tasks.filter(t => t.status === 'completed');
  const archivedCount = loadCompletedCount();
  const independent = findIndependentTasks(tasks);

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
      const stale = isStaleClaim(t) ? ' ⚠️  STALE CLAIM' : '';
      const claimed = t.claimedBy ? ` [claimed: ${t.claimedBy}]` : '';
      const tokens = t.estimatedTokens != null ? ` ~${t.estimatedTokens.toLocaleString()} tokens` : '';
      console.log(`  [${t.id}] ${t.title} → ${getAgentName(t.assignee)}${claimed}${tokens}${stale}`);
    }
  }

  if (independent.length > 0) {
    console.log(`\n⏳ Ready to Start (by priority):`);
    for (const t of independent) {
      const agent = determineAgent(t);
      const pri = t.priority || 'MEDIUM';
      const claimed = t.claimedBy ? ` [claimed: ${t.claimedBy}]` : '';
      const tokens = t.estimatedTokens != null ? ` ~${t.estimatedTokens.toLocaleString()} tokens` : '';
      console.log(`  [${t.id}] (${pri}) ${t.title} → ${getAgentName(agent)}${claimed}${tokens}`);
    }
  }

  const groups = getParallelizable(independent);
  if (groups.length > 0 && groups[0].length > 1) {
    console.log(`\n⚡ Can parallelize: ${groups[0].length} tasks in first batch`);
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
      console.log(`\nLaunching ${batch.length} tasks in parallel:`);
      for (const task of batch) {
        const agent = determineAgent(task);
        const budgetCheck = checkAgentBudget(agent);
        if (!budgetCheck.allowed) {
          console.log(`  ⚠️  [${task.id}] Skipped — ${agent} over budget (${budgetCheck.used}/${budgetCheck.limit} tokens)`);
          continue;
        }
        task.status = 'in_progress';
        task.assignee = agent;
        task.claimedBy = agent;
        task.claimedAt = new Date().toISOString();
        task.started_at = new Date().toISOString();
        saveTask(task);
        console.log(`  [${task.id}] ${task.title} → ${getAgentName(agent)}`);
      }
    } else {
      const task = independent[0];
      const agent = determineAgent(task);
      const budgetCheck = checkAgentBudget(agent);
      if (!budgetCheck.allowed) {
        console.log(`⚠️  Agent ${agent} over budget (${budgetCheck.used}/${budgetCheck.limit} tokens). Skipping.`);
        break;
      }
      task.status = 'in_progress';
      task.assignee = agent;
      task.claimedBy = agent;
      task.claimedAt = new Date().toISOString();
      task.started_at = new Date().toISOString();
      saveTask(task);
      console.log(`\nAssigned [${task.id}] ${task.title} → ${getAgentName(agent)}`);
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
    const task = tasks.find(t => t.id === taskId);
    if (!task) { console.error(`Task ${taskId} not found`); break; }

    if (testStatus !== 'passing') {
      console.error(`❌ Cannot complete ${taskId}: test_status must be 'passing' (got '${testStatus || 'none'}')`);
      console.error(`   Run tests first: ${config.testCmd}`);
      break;
    }

    task.status = 'completed';
    task.test_status = 'passing';
    task.completed_at = new Date().toISOString();
    saveTask(task);
    console.log(`✅ Completed [${task.id}] ${task.title} (tests: passing)`);
    break;
  }

  case 'archive': {
    if (!existsSync(COMPLETED_DIR)) mkdirSync(COMPLETED_DIR, { recursive: true });
    const completedTasks = tasks.filter(t => t.status === 'completed');
    if (completedTasks.length === 0) {
      console.log('No completed tasks to archive.');
      break;
    }
    for (const task of completedTasks) {
      const src = join(TASKS_DIR, task._file);
      const dest = join(COMPLETED_DIR, task._file);
      renameSync(src, dest);
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
  queue-drainer.mjs reset <task-id>  # Reset a stuck task`);
}
