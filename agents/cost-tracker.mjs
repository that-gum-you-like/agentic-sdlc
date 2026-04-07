#!/usr/bin/env node
/**
 * Cost Tracker — Log and report token usage per task per agent.
 *
 * Usage:
 *   node agents/cost-tracker.mjs record <agent> <task-id> <input-tokens> <output-tokens>
 *   node agents/cost-tracker.mjs report          # Daily summary
 *   node agents/cost-tracker.mjs report --weekly  # Weekly summary
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from './load-config.mjs';
import { logCapabilityUsage } from './capability-logger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = loadConfig();
const COST_LOG_PATH = config.costLogPath;
const BUDGET_PATH = config.budgetPath;

export function loadLog() {
  if (!existsSync(COST_LOG_PATH)) return [];
  return JSON.parse(readFileSync(COST_LOG_PATH, 'utf8'));
}

function saveLog(log) {
  writeFileSync(COST_LOG_PATH, JSON.stringify(log, null, 2));
}

function loadBudget() {
  if (!existsSync(BUDGET_PATH)) return null;
  return JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
}

function record(agent, taskId, inputTokens, outputTokens) {
  try { logCapabilityUsage('costTracking', agent, taskId, 'cost-tracker.mjs', 'record'); } catch {}

  const parsedInput = parseInt(inputTokens, 10);
  const parsedOutput = parseInt(outputTokens, 10);
  if (isNaN(parsedInput) || isNaN(parsedOutput) || parsedInput < 0 || parsedOutput < 0) {
    console.error(`❌ Invalid token counts: input="${inputTokens}" output="${outputTokens}" — must be non-negative integers`);
    return;
  }
  const budget = loadBudget();
  const knownAgents = budget?.agents ? Object.keys(budget.agents) : [];
  if (knownAgents.length > 0 && !knownAgents.includes(agent)) {
    console.warn(`⚠️  Unknown agent "${agent}" — known agents: ${knownAgents.join(', ')}`);
  }
  const log = loadLog();
  const entry = {
    agent,
    taskId,
    inputTokens: parsedInput,
    outputTokens: parsedOutput,
    totalTokens: parsedInput + parsedOutput,
    timestamp: new Date().toISOString(),
    model: budget?.agents?.[agent]?.model || 'sonnet',
  };
  log.push(entry);
  saveLog(log);
  console.log(`📊 Recorded: ${agent} | ${taskId} | ${entry.totalTokens} tokens (${entry.model})`);
}

/**
 * Compute per-agent efficiency metrics over a rolling 5-task window.
 *
 * @param {string} agent - Agent name to compute metrics for
 * @param {object} [options] - Optional overrides for testing
 * @param {Array}  [options.logData]    - Cost log entries (skips file read)
 * @param {object} [options.budgetData] - Budget object (skips file read)
 * @returns {{ avgTokensPerTask: number, firstAttemptSuccessRate: number, comparedToTypeAvg: number }}
 */
export function computeEfficiencyMetrics(agent, { logData, budgetData } = {}) {
  const log = logData !== undefined ? logData : loadLog();
  const budget = budgetData !== undefined ? budgetData : loadBudget();

  // Determine agent type (model) from budget config
  const agentModel = budget?.agents?.[agent]?.model || null;

  // Get last 5 entries for the target agent
  const agentEntries = log.filter(e => e.agent === agent);
  const window = agentEntries.slice(-5);

  if (window.length === 0) {
    return { avgTokensPerTask: 0, firstAttemptSuccessRate: 0, comparedToTypeAvg: 1 };
  }

  // avgTokensPerTask
  const totalTokens = window.reduce((sum, e) => sum + e.totalTokens, 0);
  const avgTokensPerTask = totalTokens / window.length;

  // firstAttemptSuccessRate: tasks where taskId does NOT contain 'retry' or 'reset' suffix
  const firstAttemptCount = window.filter(e => !/[-_](retry|reset|attempt[2-9])\d*$/i.test(e.taskId)).length;
  const firstAttemptSuccessRate = (firstAttemptCount / window.length) * 100;

  // comparedToTypeAvg: ratio vs average tokens/task for all agents of the same type (model)
  let comparedToTypeAvg = 1;
  if (agentModel) {
    const sameTypeAgents = budget?.agents
      ? Object.entries(budget.agents)
          .filter(([, v]) => v.model === agentModel)
          .map(([k]) => k)
      : [];

    if (sameTypeAgents.length > 1) {
      const typeAvgs = sameTypeAgents.map(a => {
        const entries = log.filter(e => e.agent === a).slice(-5);
        if (entries.length === 0) return null;
        return entries.reduce((sum, e) => sum + e.totalTokens, 0) / entries.length;
      }).filter(v => v !== null);

      if (typeAvgs.length > 0) {
        const typeAvg = typeAvgs.reduce((s, v) => s + v, 0) / typeAvgs.length;
        comparedToTypeAvg = typeAvg > 0 ? avgTokensPerTask / typeAvg : 1;
      }
    }
  }

  return { avgTokensPerTask, firstAttemptSuccessRate, comparedToTypeAvg };
}

export function computeSessionHours(log, cutoffDate) {
  const SESSION_GAP_MS = 30 * 60 * 1000; // 30 min gap = new session
  const entries = log
    .filter(e => new Date(e.timestamp) >= cutoffDate)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  if (entries.length === 0) return 0;

  let totalMs = 0;
  let sessionStart = new Date(entries[0].timestamp);
  let sessionEnd = sessionStart;

  for (let i = 1; i < entries.length; i++) {
    const ts = new Date(entries[i].timestamp);
    if (ts - sessionEnd > SESSION_GAP_MS) {
      // Gap detected — close previous session, start new one
      totalMs += sessionEnd - sessionStart;
      sessionStart = ts;
    }
    sessionEnd = ts;
  }
  // Close final session
  totalMs += sessionEnd - sessionStart;

  // Add minimum 5 min per session (agents take time even for single entries)
  const sessionCount = entries.length > 0 ? 1 : 0;
  return (totalMs / (1000 * 60 * 60)) + (sessionCount * 5 / 60);
}

async function report(weekly) {
  const log = loadLog();
  const budget = loadBudget();
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const cutoffDate = new Date(now);
  if (weekly) {
    cutoffDate.setDate(cutoffDate.getDate() - 7);
  } else {
    cutoffDate.setHours(0, 0, 0, 0);
  }

  const filtered = log.filter(e => new Date(e.timestamp) >= cutoffDate);

  const period = weekly ? 'Weekly' : 'Daily';
  console.log(`\n📊 ${period} Cost Report (${weekly ? '7 days' : today})`);
  console.log('═'.repeat(50));

  if (filtered.length === 0) {
    console.log('  No usage recorded for this period.');
    console.log('═'.repeat(50));
    return;
  }

  // Per-agent breakdown
  const byAgent = {};
  for (const entry of filtered) {
    if (!byAgent[entry.agent]) {
      byAgent[entry.agent] = { total: 0, input: 0, output: 0, tasks: 0 };
    }
    byAgent[entry.agent].total += entry.totalTokens;
    byAgent[entry.agent].input += entry.inputTokens;
    byAgent[entry.agent].output += entry.outputTokens;
    byAgent[entry.agent].tasks++;
  }

  const totalTokens = filtered.reduce((sum, e) => sum + e.totalTokens, 0);

  console.log(`\n  Total: ${totalTokens.toLocaleString()} tokens across ${filtered.length} entries`);
  console.log(`\n  Per Agent:`);
  console.log(`  ${'─'.repeat(46)}`);

  for (const [agent, stats] of Object.entries(byAgent).sort((a, b) => b[1].total - a[1].total)) {
    const agentBudget = budget?.agents?.[agent];
    const dailyLimit = agentBudget
      ? (budget.conservationMode ? Math.floor(agentBudget.dailyTokens / 2) : agentBudget.dailyTokens)
      : null;
    const periodLimit = weekly && dailyLimit ? dailyLimit * 7 : dailyLimit;
    const budgetStr = periodLimit ? ` / ${periodLimit.toLocaleString()} ${weekly ? 'weekly' : 'daily'}` : '';
    const pct = periodLimit ? ` (${Math.round(stats.total / periodLimit * 100)}%)` : '';

    console.log(`  ${agent.padEnd(12)} ${stats.total.toLocaleString().padStart(8)} tokens${budgetStr}${pct} | ${stats.tasks} tasks`);

    // Budget exhaustion alert — when model-manager is not configured, cost-tracker sends alerts
    if (periodLimit && stats.total / periodLimit >= 0.9) {
      const utilPct = Math.round(stats.total / periodLimit * 100);
      try {
        const mmPath = new URL('./model-manager.mjs', import.meta.url).pathname;
        const { existsSync: fsExists } = await import('fs');
        if (!fsExists(mmPath)) {
          const { triggerNotification: notify } = await import('./notify.mjs');
          notify('budgetAlert', `⚠ ${agent} at ${utilPct}% daily budget. No model-manager configured — manual intervention may be needed.`);
        }
      } catch { /* notify not available */ }
    }

    try {
      const eff = computeEfficiencyMetrics(agent);
      const avgK = (eff.avgTokensPerTask / 1000).toFixed(1);
      const fsr = Math.round(eff.firstAttemptSuccessRate);
      const vsType = Math.round(eff.comparedToTypeAvg * 100);
      console.log(`  ${''.padEnd(12)} efficiency: ${avgK}K tok/task | ${fsr}% first-attempt | ${vsType}% vs type avg`);
    } catch {
      // cost data unavailable — skip efficiency line
    }
  }

  // Top tasks by cost
  const byTask = {};
  for (const entry of filtered) {
    const key = `${entry.taskId}`;
    if (!byTask[key]) byTask[key] = { total: 0, agent: entry.agent };
    byTask[key].total += entry.totalTokens;
  }

  const topTasks = Object.entries(byTask).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  if (topTasks.length > 0) {
    console.log(`\n  Top Tasks by Cost:`);
    for (const [taskId, stats] of topTasks) {
      console.log(`    ${taskId.padEnd(10)} ${stats.total.toLocaleString().padStart(8)} tokens (${stats.agent})`);
    }
  }

  // Session hours
  const sessionHours = computeSessionHours(log, cutoffDate);
  if (weekly) {
    console.log(`\n  Human session hours this week: ${sessionHours.toFixed(1)}h`);
  } else {
    console.log(`\n  Session Hours: ${sessionHours.toFixed(1)}h`);
  }

  // Wellness check
  const projectConfig = config;
  const wellness = projectConfig?.humanWellness;
  if (wellness?.enabled && !weekly) {
    const dailyMax = wellness.dailyMaxHours || 10;
    if (sessionHours > dailyMax) {
      console.log(`  ⚠️  WELLNESS: ${sessionHours.toFixed(1)}h exceeds daily max of ${dailyMax}h`);
    }
  }

  if (budget?.conservationMode) {
    console.log('\n  ⚠️  CONSERVATION MODE ACTIVE — all budgets halved');
  }

  console.log('═'.repeat(50));
}

// CLI
const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;

if (__isMainModule) {
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'record':
    if (args.length < 4) {
      console.error('Usage: cost-tracker.mjs record <agent> <task-id> <input-tokens> <output-tokens>');
      break;
    }
    record(args[0], args[1], args[2], args[3]);
    break;

  case 'report':
    await report(args.includes('--weekly'));
    break;

  default:
    console.log(`Usage:
  cost-tracker.mjs record <agent> <task-id> <input-tokens> <output-tokens>
  cost-tracker.mjs report            # Daily summary
  cost-tracker.mjs report --weekly   # Weekly summary`);
}
} // end __isMainModule
