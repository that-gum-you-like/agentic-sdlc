#!/usr/bin/env node
/**
 * agent-registry.mjs — emit pm/agents.json: a normalized snapshot of every
 * agent from budget.json, enriched with today's token spend from the cost
 * ledger when available. Lets the command center answer "see the agents" from
 * one file. Zero-dep, idempotent, degrades cleanly when cost data is missing.
 *
 *   node agents/agent-registry.mjs           # write pm/agents.json + print summary
 *
 * Exports (for tests): buildRegistry
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_DIR = process.env.SDLC_PROJECT_DIR || resolve(dirname(__filename), '..');
const BUDGET_PATH = join(PROJECT_DIR, 'agents', 'budget.json');
const PM_DIR = join(PROJECT_DIR, 'pm');
const OUT_PATH = join(PM_DIR, 'agents.json');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/** Today's spend per agent, best-effort from any known cost ledger. Never throws. */
function spendByAgent() {
  for (const p of [join(PM_DIR, 'cost-log.json'), join(PROJECT_DIR, 'agents', 'cost-log.json')]) {
    const ledger = readJson(p);
    if (ledger && ledger.agents) {
      const out = {};
      for (const [name, v] of Object.entries(ledger.agents)) out[name] = Number(v.dailyTokens) || 0;
      return out;
    }
  }
  return {};
}

export function buildRegistry(budget = readJson(BUDGET_PATH), spend = spendByAgent()) {
  const agents = (budget && budget.agents) || {};
  return {
    generatedAt: null, // stamped by caller; kept null here so tests are deterministic
    emergencyFallbackModel: budget && budget.emergencyFallbackModel || null,
    agents: Object.entries(agents).map(([name, a]) => ({
      name,
      model: a.model || null,
      provider: a.provider || null,
      permissions: a.permissions || 'full-edit',
      dailyTokens: a.dailyTokens || 0,
      maxInstances: a.maxInstances || 1,
      activeModel: a.activeModel || null,
      fallbackChain: a.fallbackChain || [],
      spentToday: spend[name] || 0,
    })),
  };
}

const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;
if (__isMainModule) {
  try {
    const reg = buildRegistry();
    reg.generatedAt = new Date().toISOString();
    fs.mkdirSync(PM_DIR, { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(reg, null, 2) + '\n');
    console.log(`✅ wrote ${reg.agents.length} agents → pm/agents.json`);
    for (const a of reg.agents) console.log(`   ${a.name} → ${a.model} (${a.permissions}, ${a.dailyTokens} tok/day)`);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
