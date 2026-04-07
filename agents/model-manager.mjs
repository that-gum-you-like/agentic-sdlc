#!/usr/bin/env node
/**
 * Model Manager — Token budget monitoring, model swaps, and performance tracking.
 *
 * Usage:
 *   node model-manager.mjs check                # Monitor utilization, swap if needed
 *   node model-manager.mjs report               # Aggregated performance stats
 *   node model-manager.mjs recommend            # Data-driven model recommendations
 *   node model-manager.mjs reset                # Clear all activeModel overrides (daily reset)
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { loadConfig } from './load-config.mjs';

let triggerNotification;
try {
  const notify = await import('./notify.mjs');
  triggerNotification = notify.triggerNotification;
} catch {
  triggerNotification = () => {};
}

const config = loadConfig();
const BUDGET_PATH = config.budgetPath;
const COST_LOG_PATH = config.costLogPath;
const LEDGER_PATH = config.performanceLedgerPath;

// --- Helpers ---

function loadBudget() {
  if (!existsSync(BUDGET_PATH)) return { conservationMode: false, agents: {} };
  return JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
}

function saveBudget(budget) {
  writeFileSync(BUDGET_PATH, JSON.stringify(budget, null, 2));
}

function appendLedger(entry) {
  appendFileSync(LEDGER_PATH, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

function readLedger() {
  if (!existsSync(LEDGER_PATH)) return [];
  return readFileSync(LEDGER_PATH, 'utf8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      try { return JSON.parse(line); }
      catch { return null; }
    })
    .filter(Boolean);
}

function loadCostLog() {
  if (!existsSync(COST_LOG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(COST_LOG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

// --- check: Monitor utilization and swap models ---

function check() {
  const budget = loadBudget();
  const costLog = loadCostLog();
  const agents = budget.agents || {};
  let swapCount = 0;

  console.log('Model Manager — Utilization Check');
  console.log('═'.repeat(50));

  for (const [name, agentCfg] of Object.entries(agents)) {
    const dailyTokens = agentCfg.dailyTokens || 100000;
    const usedTokens = costLog[name]?.dailyTokens || 0;
    const pct = Math.round((usedTokens / dailyTokens) * 100);
    const model = agentCfg.activeModel || agentCfg.model || 'unknown';

    if (pct >= 100) {
      // Exhausted — attempt fallback swap
      const chain = agentCfg.fallbackChain || [agentCfg.model];
      const currentIdx = chain.indexOf(model);
      const nextModel = currentIdx >= 0 && currentIdx < chain.length - 1
        ? chain[currentIdx + 1]
        : null;

      if (nextModel) {
        agents[name].activeModel = nextModel;
        console.log(`  ⚠️  ${name}: ${pct}% — SWAP ${model} → ${nextModel}`);
        appendLedger({
          event: 'model-swap',
          agent: name,
          fromModel: model,
          toModel: nextModel,
          reason: 'budget-exhausted',
          utilizationPct: pct,
        });
        triggerNotification('budgetAlert',
          `Model swap: ${name} moved from ${model} to ${nextModel} (${pct}% budget used)`
        );
        swapCount++;
      } else {
        agents[name].activeModel = 'budget-exhausted';
        console.log(`  🚨 ${name}: ${pct}% — NO FALLBACK REMAINING`);
        appendLedger({
          event: 'budget-exhausted',
          agent: name,
          model,
          utilizationPct: pct,
        });
        triggerNotification('highSeverityFailure',
          `CRITICAL: ${name} exhausted all fallback models at ${pct}% utilization. No tasks will be assigned until budget resets.`
        );
      }
    } else if (pct >= 90) {
      console.log(`  ⚡ ${name}: ${pct}% — pre-swap alert (model: ${model})`);
      appendLedger({ event: 'budget-warning', agent: name, model, utilizationPct: pct, severity: 'high' });
      triggerNotification('budgetAlert',
        `${name} at ${pct}% daily budget on ${model}. Fallback will engage at 100%.`
      );
    } else if (pct >= 80) {
      console.log(`  📊 ${name}: ${pct}% — warning (model: ${model})`);
      appendLedger({ event: 'budget-warning', agent: name, model, utilizationPct: pct, severity: 'medium' });
    } else {
      console.log(`  ✅ ${name}: ${pct}% (model: ${model})`);
    }
  }

  if (swapCount > 0) {
    saveBudget(budget);
    console.log(`\n${swapCount} model swap(s) written to budget.json`);
  }

  console.log('');
}

// --- report: Aggregated performance stats ---

function report() {
  const entries = readLedger().filter(e => e.event === 'task-complete');

  if (entries.length === 0) {
    console.log('No task completion data in performance ledger yet.');
    return;
  }

  // Group by agent × model
  const groups = {};
  for (const e of entries) {
    const key = `${e.agent}|${e.model}`;
    if (!groups[key]) groups[key] = { agent: e.agent, model: e.model, tasks: 0, successes: 0, totalTokens: 0, firstAttempts: 0, durations: [] };
    groups[key].tasks++;
    if (e.success) groups[key].successes++;
    groups[key].totalTokens += e.tokensUsed || 0;
    if (e.firstAttempt) groups[key].firstAttempts++;
    if (e.duration) groups[key].durations.push(e.duration);
  }

  console.log('Model Manager — Performance Report');
  console.log('═'.repeat(70));
  console.log(pad('Agent', 15) + pad('Model', 25) + pad('Tasks', 7) + pad('Success', 9) + pad('Avg Tok', 9) + pad('1st Att', 8));
  console.log('─'.repeat(70));

  for (const g of Object.values(groups).sort((a, b) => a.agent.localeCompare(b.agent))) {
    const successRate = g.tasks ? Math.round((g.successes / g.tasks) * 100) : 0;
    const avgTokens = g.tasks ? Math.round(g.totalTokens / g.tasks) : 0;
    const firstRate = g.tasks ? Math.round((g.firstAttempts / g.tasks) * 100) : 0;
    console.log(pad(g.agent, 15) + pad(g.model, 25) + pad(String(g.tasks), 7) + pad(`${successRate}%`, 9) + pad(String(avgTokens), 9) + pad(`${firstRate}%`, 8));
  }

  console.log('');
}

function pad(str, len) {
  return str.padEnd(len);
}

// --- recommend: Data-driven model recommendations ---

function recommend() {
  const entries = readLedger().filter(e => e.event === 'task-complete');

  if (entries.length < 5) {
    console.log('Insufficient data for recommendations (need 5+ completed tasks).');
    return;
  }

  // Group by agent × model
  const groups = {};
  for (const e of entries) {
    const key = `${e.agent}|${e.model}`;
    if (!groups[key]) groups[key] = { agent: e.agent, model: e.model, tasks: 0, successes: 0 };
    groups[key].tasks++;
    if (e.success) groups[key].successes++;
  }

  console.log('Model Manager — Recommendations');
  console.log('═'.repeat(60));

  const MODEL_COST_ORDER = [
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-haiku-4-5',
    'claude-haiku-4-5-20251001',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
  ];

  let hasRecs = false;

  // Check for agents succeeding on cheaper models
  for (const g of Object.values(groups)) {
    const successRate = g.tasks ? (g.successes / g.tasks) : 0;
    const confidence = g.tasks >= 10 ? 'high' : g.tasks >= 5 ? 'medium' : 'low';

    if (successRate >= 0.9 && g.tasks >= 10) {
      // Check if this is already a cheaper model than their preferred
      const budget = loadBudget();
      const preferred = budget.agents?.[g.agent]?.model;
      const preferredIdx = MODEL_COST_ORDER.indexOf(preferred);
      const currentIdx = MODEL_COST_ORDER.indexOf(g.model);

      if (currentIdx > preferredIdx && preferredIdx >= 0) {
        console.log(`  📉 ${g.agent}: Consider downgrading preferred model from ${preferred} to ${g.model}`);
        console.log(`     Evidence: ${Math.round(successRate * 100)}% success over ${g.tasks} tasks (confidence: ${confidence})`);
        hasRecs = true;
      }
    }

    if (successRate < 0.7 && g.tasks >= 5) {
      const currentIdx = MODEL_COST_ORDER.indexOf(g.model);
      const upgrade = currentIdx > 0 ? MODEL_COST_ORDER[currentIdx - 1] : null;
      if (upgrade) {
        console.log(`  📈 ${g.agent}: Consider upgrading from ${g.model} to ${upgrade}`);
        console.log(`     Evidence: ${Math.round(successRate * 100)}% success over ${g.tasks} tasks (confidence: ${confidence})`);
        hasRecs = true;
      }
    }
  }

  if (!hasRecs) {
    console.log('  No recommendations at this time. Current assignments look appropriate.');
  }

  console.log('');
}

// --- reset: Clear all activeModel overrides ---

function reset() {
  const budget = loadBudget();
  let resetCount = 0;

  for (const [name, agentCfg] of Object.entries(budget.agents || {})) {
    if (agentCfg.activeModel) {
      const previousModel = agentCfg.activeModel;
      agentCfg.activeModel = null;
      resetCount++;
      appendLedger({ event: 'daily-reset', agent: name, previousActiveModel: previousModel });
    }
  }

  if (resetCount > 0) {
    saveBudget(budget);
    console.log(`Daily reset: cleared activeModel for ${resetCount} agent(s).`);
  } else {
    console.log('Daily reset: no active model overrides to clear.');
  }
}

// --- CLI ---

const cmd = process.argv[2];

switch (cmd) {
  case 'check':
    check();
    break;
  case 'report':
    report();
    break;
  case 'recommend':
    recommend();
    break;
  case 'reset':
    reset();
    break;
  default:
    console.log(`Usage: node model-manager.mjs <command>

Commands:
  check      Monitor utilization, swap models if needed
  report     Aggregated performance stats by agent × model
  recommend  Data-driven model assignment recommendations
  reset      Clear all activeModel overrides (daily budget reset)`);
    process.exit(1);
}
