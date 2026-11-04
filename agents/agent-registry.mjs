#!/usr/bin/env node
/**
 * agent-registry.mjs — emit pm/agents.json: a normalized snapshot of every
 * agent from budget.json, enriched with today's token spend from the cost
 * ledger when available. Lets the command center answer "see the agents" from
 * one file. Zero-dep, idempotent, degrades cleanly when cost data is missing.
 *
 *   node agents/agent-registry.mjs           # write pm/agents.json + print summary
 *   node agents/agent-registry.mjs org        # print org tree from front matter
 *
 * Exports (for tests): buildRegistry, buildOrgTree, readAgentOrg, printOrgTree
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

// ─── Org subcommand ───────────────────────────────────────────────

/**
 * Parse simple YAML-like front matter from a string.
 * Returns null if no front matter delimiters found.
 * Only handles flat key: value pairs and inline arrays.
 */
function parseFrontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const sep = trimmed.indexOf(':');
    if (sep < 1) continue;
    const key = trimmed.slice(0, sep).trim();
    const val = trimmed.slice(sep + 1).trim();
    if (key) fm[key] = val;
  }
  return fm;
}

/**
 * Parse front-matter value that may be an inline JSON array.
 * Returns the parsed array or wraps the raw string in an array.
 */
function parseArrayValue(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return [raw]; }
}

/**
 * Read agent org data from budget.json + per-agent AGENT.md front matter.
 * Returns array of {name, reportsTo, delegatesTo}.
 * Agents without a literal AGENT.md file or without front matter default
 * reportsTo to "board" and delegatesTo to [].
 */
export function readAgentOrg(budget = readJson(BUDGET_PATH)) {
  const agents = (budget && budget.agents) || {};
  const result = [];
  for (const [name] of Object.entries(agents)) {
    const agPath = join(PROJECT_DIR, 'agents', name, 'AGENT.md');
    let reportsTo = 'board';
    let delegatesTo = [];
    try {
      const content = fs.readFileSync(agPath, 'utf8');
      const fm = parseFrontMatter(content);
      if (fm) {
        if (fm.reportsTo && fm.reportsTo !== '') reportsTo = fm.reportsTo;
        if (fm.delegatesTo && fm.delegatesTo !== '') delegatesTo = parseArrayValue(fm.delegatesTo);
      }
    } catch { /* no AGENT.md — use defaults */ }
    result.push({ name, reportsTo, delegatesTo });
  }
  return result;
}

/**
 * Build and validate an org tree from an array of agent objects.
 *
 * @param {Array<{name:string, reportsTo:string, delegatesTo:string[]}>} agentList
 * @returns {{ tree?:object, error?:string }}
 *   On success: { tree: { name, children:[] } } where children is a recursive structure.
 *   On error: { error: "<description>" }
 */
export function buildOrgTree(agentList) {
  const names = new Set(agentList.map(a => a.name));
  names.add('board');

  // 1. Validate all reportsTo targets exist
  for (const a of agentList) {
    if (!names.has(a.reportsTo)) {
      return { error: `unknown reportsTo "${a.reportsTo}" for agent "${a.name}"` };
    }
  }

  // 2. Cycle detection: follow each agent's reportsTo chain
  const lookup = {};
  for (const a of agentList) lookup[a.name] = a;

  for (const a of agentList) {
    const seen = new Set();
    let cur = a.name;
    while (cur !== 'board') {
      if (seen.has(cur)) {
        const cycle = [...seen].join(' → ');
        return { error: `cycle detected in reportsTo: ${cycle} → ${cur}` };
      }
      seen.add(cur);
      const agent = lookup[cur];
      if (!agent) break; // shouldn't happen after step 1
      cur = agent.reportsTo;
    }
  }

  // 3. Build child index: parent name → child agent names
  const childrenOf = {};
  for (const a of agentList) {
    const p = a.reportsTo;
    if (!childrenOf[p]) childrenOf[p] = [];
    childrenOf[p].push(a.name);
  }

  // 4. Build tree recursively from board
  function subTree(nodeName) {
    const children = (childrenOf[nodeName] || []).sort();
    return {
      name: nodeName,
      children: children.map(c => subTree(c)),
    };
  }

  const tree = subTree('board');

  // 5. Attach delegation info for display
  const delMap = {};
  for (const a of agentList) {
    if (a.delegatesTo && a.delegatesTo.length > 0) {
      delMap[a.name] = a.delegatesTo;
    }
  }

  return { tree, delegationMap: delMap };
}

/**
 * Print an org tree to stdout using Unicode box-drawing characters.
 */
export function printOrgTree(tree, delegationMap = {}) {
  const lines = [];
  function walk(node, prefix, isLast) {
    const connector = isLast ? '└── ' : '├── ';
    const namePart = node.name;
    const del = delegationMap[node.name];
    const delPart = del && del.length > 0 ? ` (delegates: ${del.join(', ')})` : '';
    if (prefix === '') {
      lines.push(node.name);
    } else {
      lines.push(prefix + connector + namePart + delPart);
    }
    const children = node.children || [];
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    for (let i = 0; i < children.length; i++) {
      walk(children[i], childPrefix, i === children.length - 1);
    }
  }
  walk(tree, '', true);
  console.log(lines.join('\n'));
  return lines.join('\n');
}

// ─── CLI dispatch ─────────────────────────────────────────────────

const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;
if (__isMainModule) {
  const subcommand = process.argv[2] || '';
  if (subcommand === 'org') {
    const agents = readAgentOrg();
    if (agents.length === 0) {
      console.log('(no agents in budget.json)');
      process.exit(0);
    }
    const result = buildOrgTree(agents);
    if (result.error) {
      console.error(result.error);
      process.exit(1);
    }
    printOrgTree(result.tree, result.delegationMap);
    process.exit(0);
  }

  // Default: write pm/agents.json
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