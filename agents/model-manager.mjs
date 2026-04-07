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

import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
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
const INTEL_PATH = resolve(config.agentsDir, 'model-intel.json');
const PREDICTIVE_SWAP_HOURS = config.predictiveSwapHours ?? 1;

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

function loadModelIntel() {
  if (!existsSync(INTEL_PATH)) return { models: {} };
  try { return JSON.parse(readFileSync(INTEL_PATH, 'utf8')); } catch { return { models: {} }; }
}

function saveModelIntel(intel) {
  writeFileSync(INTEL_PATH, JSON.stringify(intel, null, 2));
}

/**
 * Build a cost-sorted list of all models from model-intel.json.
 * Returns array sorted cheapest-first by costPer1MInput.
 */
function buildCostOrder() {
  const intel = loadModelIntel();
  return Object.entries(intel.models || {})
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => (a.costPer1MInput || 0) - (b.costPer1MInput || 0));
}

/**
 * Health check endpoints per provider. Minimal request to test reachability.
 */
const HEALTH_ENDPOINTS = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: (key) => ({ 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    keyEnv: 'ANTHROPIC_API_KEY',
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    headers: (key) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }),
    body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    keyEnv: 'OPENAI_API_KEY',
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    method: 'POST',
    headers: (key) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }),
    body: JSON.stringify({ model: 'llama-3.1-8b-instant', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    keyEnv: 'GROQ_API_KEY',
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 1 } }),
    keyEnv: 'GEMINI_API_KEY',
    urlSuffix: (key) => `?key=${key}`,
  },
  cerebras: {
    url: 'https://api.cerebras.ai/v1/chat/completions',
    method: 'POST',
    headers: (key) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }),
    body: JSON.stringify({ model: 'llama3.1-8b', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    keyEnv: 'CEREBRAS_API_KEY',
  },
};

/**
 * Ping a provider's API to check if it's reachable and functional.
 * Returns { up: boolean, error: string|null, latencyMs: number }
 */
async function pingProvider(provider) {
  const ep = HEALTH_ENDPOINTS[provider];
  if (!ep) return { up: false, error: 'unknown provider', latencyMs: 0 };

  const apiKey = process.env[ep.keyEnv];
  if (!apiKey) return { up: false, error: `${ep.keyEnv} not set`, latencyMs: 0 };

  const start = Date.now();
  try {
    let url = ep.url;
    if (ep.urlSuffix) url += ep.urlSuffix(apiKey);

    const res = await fetch(url, {
      method: ep.method,
      headers: ep.headers(apiKey),
      body: ep.body,
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Date.now() - start;

    // 200 = success, 429 = rate limited (provider is up, just busy), 402 = billing (up but account issue)
    if (res.ok || res.status === 429) {
      return { up: true, error: null, latencyMs };
    }
    if (res.status === 402 || res.status === 403) {
      return { up: true, error: `billing/auth issue (${res.status})`, latencyMs };
    }
    return { up: false, error: `HTTP ${res.status}`, latencyMs };
  } catch (err) {
    return { up: false, error: err.message, latencyMs: Date.now() - start };
  }
}

/**
 * Run health checks on all providers used by configured agents.
 * Updates providerHealth in model-intel.json.
 * Returns map of provider → health status.
 */
async function checkAllProviderHealth() {
  const intel = loadModelIntel();
  const budget = loadBudget();
  const health = intel.providerHealth || {};

  // Determine which providers are actually configured
  const usedProviders = new Set();
  for (const agentCfg of Object.values(budget.agents || {})) {
    if (agentCfg.provider) usedProviders.add(agentCfg.provider);
    // Also check fallback chain models for their providers
    for (const model of (agentCfg.fallbackChain || [])) {
      const modelInfo = intel.models?.[model];
      if (modelInfo?.provider) usedProviders.add(modelInfo.provider);
    }
  }

  // Always check free-tier providers (they're universal fallbacks)
  usedProviders.add('groq');
  usedProviders.add('gemini');
  usedProviders.add('cerebras');

  const results = {};
  const now = new Date().toISOString();

  // Ping all providers in parallel
  const pings = [...usedProviders].map(async (provider) => {
    const result = await pingProvider(provider);
    const prev = health[provider] || { status: 'unknown', consecutiveFailures: 0 };

    if (result.up) {
      const wasDown = prev.status === 'down';
      results[provider] = { status: 'up', lastChecked: now, consecutiveFailures: 0, latencyMs: result.latencyMs };
      if (wasDown) {
        appendLedger({ event: 'provider-recovered', provider, latencyMs: result.latencyMs });
        triggerNotification('budgetAlert', `Provider recovered: ${provider} is back online (${result.latencyMs}ms)`);
        console.log(`  🟢 ${provider}: RECOVERED (was down, now up in ${result.latencyMs}ms)`);
      } else {
        console.log(`  🟢 ${provider}: up (${result.latencyMs}ms)`);
      }
    } else {
      const failures = (prev.consecutiveFailures || 0) + 1;
      results[provider] = { status: failures >= 2 ? 'down' : 'degraded', lastChecked: now, consecutiveFailures: failures, error: result.error };

      if (failures >= 2) {
        console.log(`  🔴 ${provider}: DOWN (${failures} consecutive failures: ${result.error})`);
        appendLedger({ event: 'provider-down', provider, consecutiveFailures: failures, error: result.error });
      } else {
        console.log(`  🟡 ${provider}: degraded (${result.error})`);
      }
    }
  });

  await Promise.all(pings);

  // Save health state
  intel.providerHealth = results;
  saveModelIntel(intel);

  return results;
}

/**
 * Find a healthy model from a fallback chain, skipping models whose provider is down.
 */
function findHealthyFallback(fallbackChain, currentModel, providerHealth) {
  const intel = loadModelIntel();
  const currentIdx = fallbackChain.indexOf(currentModel);

  for (let i = currentIdx + 1; i < fallbackChain.length; i++) {
    const model = fallbackChain[i];
    const modelInfo = intel.models?.[model];
    const provider = modelInfo?.provider;
    if (provider && providerHealth[provider]?.status !== 'down') {
      return model;
    }
  }
  return null; // All fallbacks are on down providers
}

/**
 * Detect and auto-reset stale tasks (in_progress > 30 min).
 */
function resetStaleTasks() {
  const tasksDir = config.tasksDir;
  if (!existsSync(tasksDir)) return 0;

  const files = readdirSync(tasksDir).filter(f => f.endsWith('.json'));
  const now = Date.now();
  let resetCount = 0;

  for (const file of files) {
    try {
      const taskPath = resolve(tasksDir, file);
      const task = JSON.parse(readFileSync(taskPath, 'utf8'));

      if (task.status !== 'in_progress') continue;

      const startedAt = task.started_at || task.claimedAt;
      if (!startedAt) continue;

      const elapsed = now - new Date(startedAt).getTime();
      const STALE_MS = 30 * 60 * 1000; // 30 minutes

      if (elapsed > STALE_MS) {
        const agent = task.assignee || task.claimedBy || 'unknown';
        console.log(`  🔄 Resetting stale task [${task.id}] — stuck with ${agent} for ${Math.round(elapsed / 60000)}min`);

        task.status = 'pending';
        task.assignee = null;
        task.claimedBy = null;
        task.claimedAt = null;
        delete task.started_at;
        delete task.instanceId;

        writeFileSync(taskPath, JSON.stringify(task, null, 2));
        appendLedger({ event: 'stale-task-reset', taskId: task.id, previousAgent: agent, staleMinutes: Math.round(elapsed / 60000) });
        triggerNotification('blocker', `Stale task reset: [${task.id}] ${task.title} — was stuck with ${agent} for ${Math.round(elapsed / 60000)}min`);
        resetCount++;
      }
    } catch { /* skip malformed */ }
  }

  if (resetCount > 0) {
    console.log(`  Reset ${resetCount} stale task(s)`);
  }
  return resetCount;
}

/**
 * Estimate burn rate (tokens/hour) for an agent from recent cost-log.
 * Looks at the last `windowHours` of data.
 */
function estimateBurnRate(agentName, windowHours = 2) {
  const costLog = loadCostLog();
  const now = Date.now();
  const windowMs = windowHours * 60 * 60 * 1000;
  const cutoff = new Date(now - windowMs).toISOString();

  const recentEntries = (Array.isArray(costLog) ? costLog : [])
    .filter(e => e.agent === agentName && e.timestamp > cutoff);

  if (recentEntries.length === 0) return 0;

  const totalTokens = recentEntries.reduce(
    (sum, e) => sum + (e.inputTokens || 0) + (e.outputTokens || 0), 0
  );

  // Find actual time span of entries
  const timestamps = recentEntries.map(e => new Date(e.timestamp).getTime()).sort();
  const spanMs = timestamps[timestamps.length - 1] - timestamps[0];
  if (spanMs <= 0) return totalTokens; // All in same instant — return total as hourly rate

  const spanHours = spanMs / (60 * 60 * 1000);
  return Math.round(totalTokens / spanHours);
}

// --- check: Monitor utilization, health, and swap models ---

async function check() {
  console.log('Model Manager — Health & Utilization Check');
  console.log('═'.repeat(50));

  // Phase 1: Provider health checks
  console.log('\n📡 Provider Health:');
  const providerHealth = await checkAllProviderHealth();

  // Phase 2: Auto-reset stale tasks
  console.log('\n🔄 Stale Task Detection:');
  const staleCount = resetStaleTasks();
  if (staleCount === 0) console.log('  No stale tasks');

  // Phase 3: Provider-down swaps (swap agents off down providers)
  const budget = loadBudget();
  const agents = budget.agents || {};
  let swapCount = 0;
  const intel = loadModelIntel();

  for (const [name, agentCfg] of Object.entries(agents)) {
    const model = agentCfg.activeModel || agentCfg.model || 'unknown';
    const modelInfo = intel.models?.[model];
    const provider = modelInfo?.provider || agentCfg.provider;

    if (provider && providerHealth[provider]?.status === 'down') {
      // Provider is down — find a healthy fallback
      const chain = agentCfg.fallbackChain || [];
      const healthyModel = findHealthyFallback(chain, model, providerHealth);

      if (healthyModel) {
        agents[name].activeModel = healthyModel;
        const newProvider = intel.models?.[healthyModel]?.provider || 'unknown';
        console.log(`\n  🚨 ${name}: ${provider} DOWN — SWAP ${model} → ${healthyModel} (${newProvider})`);
        appendLedger({ event: 'provider-down-swap', agent: name, fromModel: model, toModel: healthyModel, downProvider: provider, newProvider });
        triggerNotification('highSeverityFailure',
          `Provider ${provider} is DOWN. ${name} swapped from ${model} to ${healthyModel} (${newProvider}). Work continues on fallback.`
        );
        swapCount++;
      } else {
        agents[name].activeModel = 'budget-exhausted';
        console.log(`\n  💀 ${name}: ${provider} DOWN — NO HEALTHY FALLBACK AVAILABLE`);
        appendLedger({ event: 'all-fallbacks-down', agent: name, model, downProvider: provider });
        triggerNotification('highSeverityFailure',
          `CRITICAL: Provider ${provider} is DOWN and ${name} has no healthy fallback. Agent is fully blocked. Add a cross-provider fallback chain or wait for recovery.`
        );
      }
      continue; // Skip budget check for this agent — provider is down
    }
  }

  if (swapCount > 0) {
    saveBudget(budget);
    console.log(`\n${swapCount} provider-down swap(s) applied`);
  }

  // Phase 4: Budget utilization checks (only for agents on healthy providers)
  console.log('\n📊 Budget Utilization:');
  const costLog = loadCostLog();
  swapCount = 0;

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
    } else if (pct >= 80) {
      // Predictive swap: estimate burn rate and project depletion
      const burnRate = estimateBurnRate(name);
      const remainingTokens = dailyTokens - usedTokens;
      const hoursToDepletion = burnRate > 0 ? remainingTokens / burnRate : Infinity;

      if (hoursToDepletion <= PREDICTIVE_SWAP_HOURS && burnRate > 0) {
        // Pre-emptive swap to avoid downtime
        const chain = agentCfg.fallbackChain || [agentCfg.model];
        const currentIdx = chain.indexOf(model);
        const nextModel = currentIdx >= 0 && currentIdx < chain.length - 1
          ? chain[currentIdx + 1]
          : null;

        if (nextModel) {
          agents[name].activeModel = nextModel;
          console.log(`  🔮 ${name}: ${pct}% — PREDICTIVE SWAP ${model} → ${nextModel} (depletes in ~${hoursToDepletion.toFixed(1)}h at ${burnRate.toLocaleString()} tok/hr)`);
          appendLedger({
            event: 'predictive-swap',
            agent: name,
            fromModel: model,
            toModel: nextModel,
            utilizationPct: pct,
            burnRate,
            projectedDepletionHours: Math.round(hoursToDepletion * 10) / 10,
          });
          triggerNotification('budgetAlert',
            `Predictive swap: ${name} moved ${model} → ${nextModel} (projected depletion in ${hoursToDepletion.toFixed(1)}h)`
          );
          swapCount++;
        } else if (pct >= 90) {
          console.log(`  ⚡ ${name}: ${pct}% — depletes in ~${hoursToDepletion.toFixed(1)}h, NO fallback remaining`);
          appendLedger({ event: 'budget-warning', agent: name, model, utilizationPct: pct, severity: 'critical', burnRate, projectedDepletionHours: Math.round(hoursToDepletion * 10) / 10 });
          triggerNotification('budgetAlert',
            `CRITICAL: ${name} at ${pct}% with no fallback. Depletes in ~${hoursToDepletion.toFixed(1)}h.`
          );
        } else {
          console.log(`  📊 ${name}: ${pct}% — warning, depletes in ~${hoursToDepletion.toFixed(1)}h (model: ${model})`);
          appendLedger({ event: 'budget-warning', agent: name, model, utilizationPct: pct, severity: 'medium', burnRate });
        }
      } else if (pct >= 90) {
        console.log(`  ⚡ ${name}: ${pct}% — pre-swap alert (model: ${model})`);
        appendLedger({ event: 'budget-warning', agent: name, model, utilizationPct: pct, severity: 'high' });
        triggerNotification('budgetAlert',
          `${name} at ${pct}% daily budget on ${model}. Fallback will engage at 100%.`
        );
      } else {
        console.log(`  📊 ${name}: ${pct}% — warning (model: ${model})`);
        appendLedger({ event: 'budget-warning', agent: name, model, utilizationPct: pct, severity: 'medium' });
      }
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

  // Dynamic cost order from model-intel.json (cheapest first)
  const costOrder = buildCostOrder();
  const costOrderIds = costOrder.map(m => m.id);
  const intel = loadModelIntel();

  let hasRecs = false;
  const budget = loadBudget();

  for (const g of Object.values(groups)) {
    const successRate = g.tasks ? (g.successes / g.tasks) : 0;
    const confidence = g.tasks >= 10 ? 'high' : g.tasks >= 5 ? 'medium' : 'low';

    if (successRate >= 0.9 && g.tasks >= 10) {
      // Agent succeeding — check if a cheaper model could work
      const preferred = budget.agents?.[g.agent]?.model;
      const currentCost = intel.models?.[g.model]?.costPer1MInput || 0;
      const preferredCost = intel.models?.[preferred]?.costPer1MInput || 0;

      if (currentCost < preferredCost) {
        const savings = Math.round((1 - currentCost / preferredCost) * 100);
        console.log(`  📉 ${g.agent}: Consider downgrading from ${preferred} to ${g.model} (${savings}% cheaper)`);
        console.log(`     Evidence: ${Math.round(successRate * 100)}% success over ${g.tasks} tasks (confidence: ${confidence})`);
        hasRecs = true;
      }

      // Cross-provider suggestion: find even cheaper models with acceptable quality
      const currentModel = intel.models?.[g.model];
      if (currentModel) {
        for (const cheaper of costOrder) {
          if (cheaper.id === g.model) break; // Already at this cost level or cheaper
          if (cheaper.costPer1MInput >= currentCost) continue;
          // Check if quality ratings are at least 3 for coding
          if ((cheaper.strengths?.coding || 0) >= 3) {
            const xSavings = Math.round((1 - cheaper.costPer1MInput / currentCost) * 100);
            if (xSavings >= 30) { // Only suggest if meaningful savings
              console.log(`  💡 ${g.agent}: Cross-provider option — ${cheaper.id} (${cheaper.provider}) is ${xSavings}% cheaper`);
              console.log(`     Note: Quality rating ${cheaper.strengths.coding}/5 for coding. Test before committing.`);
              hasRecs = true;
              break; // Only suggest the best alternative
            }
          }
        }
      }
    }

    if (successRate < 0.7 && g.tasks >= 5) {
      // Agent struggling — suggest upgrade
      const currentIdx = costOrderIds.indexOf(g.model);
      // Find next more expensive model
      const upgrades = costOrder.slice(currentIdx + 1).filter(m => (m.strengths?.coding || 0) >= 4);
      const upgrade = upgrades[0]; // Cheapest model that's better quality
      if (upgrade) {
        console.log(`  📈 ${g.agent}: Consider upgrading from ${g.model} to ${upgrade.id} (${upgrade.provider})`);
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

// --- models: Display all known models ---

function models() {
  const intel = loadModelIntel();
  const sorted = Object.entries(intel.models || {})
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => (a.costPer1MInput || 0) - (b.costPer1MInput || 0));

  console.log('Model Manager — Known Models');
  console.log('═'.repeat(90));
  console.log(pad('Model', 28) + pad('Provider', 10) + pad('$/1M In', 10) + pad('$/1M Out', 10) + pad('Context', 9) + pad('Latency', 8) + pad('Code', 6) + pad('Arch', 6));
  console.log('─'.repeat(90));

  for (const m of sorted) {
    console.log(
      pad(m.id, 28) +
      pad(m.provider, 10) +
      pad(`$${m.costPer1MInput?.toFixed(2) || '?'}`, 10) +
      pad(`$${m.costPer1MOutput?.toFixed(2) || '?'}`, 10) +
      pad(`${(m.contextWindow / 1000).toFixed(0)}K`, 9) +
      pad(m.latencyTier || '?', 8) +
      pad(`${m.strengths?.coding || '?'}/5`, 6) +
      pad(`${m.strengths?.architecture || '?'}/5`, 6)
    );
  }

  console.log(`\nSource: ${INTEL_PATH}`);
  console.log(`Last updated: ${intel._meta?.lastUpdated || 'unknown'}`);
  console.log(`Update with: node model-manager.mjs research\n`);
}

// --- suggest: Recommend best model for a task type ---

function suggest(taskType) {
  const validTypes = ['coding', 'review', 'documentation', 'architecture', 'research'];
  if (!taskType || !validTypes.includes(taskType)) {
    console.log(`Usage: node model-manager.mjs suggest <task-type>`);
    console.log(`Types: ${validTypes.join(', ')}`);
    return null;
  }

  const intel = loadModelIntel();
  const budget = loadBudget();

  // Get all configured providers from budget.json agents
  const configuredProviders = new Set();
  for (const agentCfg of Object.values(budget.agents || {})) {
    if (agentCfg.provider) configuredProviders.add(agentCfg.provider);
  }
  // Also accept all providers if none configured
  if (configuredProviders.size === 0) {
    configuredProviders.add('anthropic');
    configuredProviders.add('openai');
    configuredProviders.add('groq');
  }

  // Score models: quality × cost-efficiency
  const candidates = Object.entries(intel.models || {})
    .filter(([, m]) => configuredProviders.has(m.provider))
    .map(([id, m]) => {
      const qualityScore = m.strengths?.[taskType] || 1;
      const costPerM = m.costPer1MInput || 0.01; // avoid div by zero
      // Value = quality^2 / cost (favor quality, penalize cost)
      const value = (qualityScore * qualityScore) / costPerM;
      return { id, ...m, qualityScore, value };
    })
    .sort((a, b) => b.value - a.value);

  console.log(`\nBest models for "${taskType}" tasks (configured providers: ${[...configuredProviders].join(', ')}):`);
  console.log('─'.repeat(70));

  const top3 = candidates.slice(0, 3);
  for (let i = 0; i < top3.length; i++) {
    const m = top3[i];
    const medal = ['🥇', '🥈', '🥉'][i];
    console.log(`  ${medal} ${m.id} (${m.provider}) — quality ${m.qualityScore}/5, $${m.costPer1MInput?.toFixed(2)}/1M input`);
    if (m.bestFor?.length) console.log(`     Best for: ${m.bestFor.join(', ')}`);
  }
  console.log('');

  return top3[0]?.id || null;
}

// --- research: Fetch latest pricing and update model-intel.json ---

async function research() {
  console.log('Model Manager — Research');
  console.log('═'.repeat(50));
  console.log('Fetching latest model pricing and capabilities...\n');

  const intel = loadModelIntel();
  const pricingUrls = {
    anthropic: 'https://docs.anthropic.com/en/docs/about-claude/models',
    openai: 'https://openai.com/api/pricing/',
    groq: 'https://groq.com/pricing/',
  };

  let updated = false;

  for (const [provider, url] of Object.entries(pricingUrls)) {
    console.log(`  📡 Fetching ${provider} pricing from ${url}...`);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AgenticSDLC-ModelManager/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        console.log(`     ⚠️  HTTP ${res.status} — skipping`);
        continue;
      }

      const html = await res.text();

      // Extract pricing data based on provider-specific patterns
      if (provider === 'anthropic') {
        // Look for Claude model pricing patterns
        const priceMatch = html.match(/claude[^"]*?(?:opus|sonnet|haiku)[^"]*?/gi);
        if (priceMatch) {
          console.log(`     Found ${priceMatch.length} model references`);
        } else {
          console.log(`     No structured pricing found — page may require JS rendering`);
        }
      } else if (provider === 'openai') {
        const priceMatch = html.match(/gpt-4[^"]*|o1[^"]*|o3[^"]*/gi);
        if (priceMatch) {
          console.log(`     Found ${[...new Set(priceMatch)].length} model references`);
        } else {
          console.log(`     No structured pricing found — page may require JS rendering`);
        }
      } else {
        console.log(`     Page fetched (${html.length} bytes) — manual review recommended`);
      }

      // Note: Full HTML parsing of pricing pages is fragile and provider-specific.
      // For now, we log what we find and recommend manual updates for accurate pricing.
      // Future: structured API endpoints (e.g., OpenAI /v1/models) for reliable data.

    } catch (err) {
      console.log(`     ❌ Failed: ${err.message}`);
    }
  }

  // Try structured API endpoints where available
  console.log('\n  📡 Checking OpenAI /v1/models API...');
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        const gptModels = data.data?.filter(m => m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3')) || [];
        console.log(`     Found ${gptModels.length} GPT/o-series models available on your account`);

        // Check for new models not in our intel
        for (const m of gptModels) {
          if (!intel.models[m.id]) {
            console.log(`     🆕 New model detected: ${m.id} — add to model-intel.json manually`);
            updated = true;
          }
        }
      }
    } else {
      console.log('     Skipped (OPENAI_API_KEY not set)');
    }
  } catch (err) {
    console.log(`     ❌ Failed: ${err.message}`);
  }

  // Update timestamp
  intel._meta = intel._meta || {};
  intel._meta.lastUpdated = new Date().toISOString().split('T')[0];
  saveModelIntel(intel);

  console.log(`\n  Updated lastUpdated timestamp in model-intel.json`);
  if (!updated) {
    console.log('  No automatic pricing updates applied — review pricing pages manually for changes.');
  }
  console.log('  Edit agents/model-intel.json directly to update costs and ratings.\n');
}

// --- Exports ---

export { check, report, recommend, reset, models, suggest, research, buildCostOrder, loadModelIntel, estimateBurnRate };

// --- CLI ---

const __filename_mm = fileURLToPath(import.meta.url);
const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename_mm;

if (!__isMainModule) {
  // Imported as module — don't run CLI
} else {

const cmd = process.argv[2];

switch (cmd) {
  case 'check':
    await check();
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
  case 'models':
    models();
    break;
  case 'suggest':
    suggest(process.argv[3]);
    break;
  case 'research':
    await research();
    break;
  default:
    console.log(`Usage: node model-manager.mjs <command>

Commands:
  check              Monitor utilization, swap models if needed (runs on cron)
  report             Aggregated performance stats by agent × model
  recommend          Data-driven model assignment recommendations
  models             Display all known models with costs and ratings
  suggest <type>     Recommend best model for a task type (coding/review/documentation/architecture/research)
  research           Fetch latest pricing info and check for new models
  reset              Clear all activeModel overrides (daily budget reset)`);
    process.exit(1);
}

} // end __isMainModule
