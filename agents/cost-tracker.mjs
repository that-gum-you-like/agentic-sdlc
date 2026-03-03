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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COST_LOG_PATH = resolve(__dirname, 'cost-log.json');
const BUDGET_PATH = resolve(__dirname, 'budget.json');

function loadLog() {
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

function report(weekly) {
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

  if (budget?.conservationMode) {
    console.log('\n  ⚠️  CONSERVATION MODE ACTIVE — all budgets halved');
  }

  console.log('═'.repeat(50));
}

// CLI
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
    report(args.includes('--weekly'));
    break;

  default:
    console.log(`Usage:
  cost-tracker.mjs record <agent> <task-id> <input-tokens> <output-tokens>
  cost-tracker.mjs report            # Daily summary
  cost-tracker.mjs report --weekly   # Weekly summary`);
}
