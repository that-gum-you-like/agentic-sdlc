#!/usr/bin/env node
/**
 * Paperclip Sync — Push SDLC agent config to Paperclip.
 *
 * The Agentic SDLC is the source of truth for:
 *   - Agent roster (project.json, domains.json)
 *   - Model assignment (budget.json)
 *   - Daily token budgets (budget.json)
 *   - System prompts (agents/<name>/AGENT.md)
 *   - Domain routing (domains.json)
 *
 * Paperclip is the execution platform that runs agents according to the SDLC.
 * This script ensures Paperclip mirrors the SDLC config.
 *
 * Usage:
 *   node ~/agentic-sdlc/agents/paperclip-sync.mjs              # Push SDLC → Paperclip
 *   node ~/agentic-sdlc/agents/paperclip-sync.mjs --dry-run     # Preview changes
 *   node ~/agentic-sdlc/agents/paperclip-sync.mjs --status      # Compare SDLC vs Paperclip
 *   node ~/agentic-sdlc/agents/paperclip-sync.mjs --pull-spent  # Update budget.json with Paperclip spend data
 *
 * Reads .paperclip.env from the project directory for credentials.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { loadConfig } from './load-config.mjs';

const config = loadConfig();

// --- Paperclip credentials ---

function loadPaperclipEnv() {
  const envPath = resolve(config.projectDir, '.paperclip.env');
  const creds = {
    apiUrl: process.env.PAPERCLIP_API_URL || '',
    companyId: process.env.PAPERCLIP_COMPANY_ID || '',
    apiKey: process.env.PAPERCLIP_API_KEY || '',
  };

  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^export\s+(\w+)='([^']*)'/);
      if (!m) continue;
      if (m[1] === 'PAPERCLIP_API_URL') creds.apiUrl = m[2];
      if (m[1] === 'PAPERCLIP_COMPANY_ID') creds.companyId = m[2];
      if (m[1] === 'PAPERCLIP_API_KEY') creds.apiKey = m[2];
    }
  }

  return creds;
}

// --- Model mappings ---

const MODEL_FULL = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
};

const MODEL_SHORT = {
  'claude-opus-4-6': 'opus',
  'claude-sonnet-4-6': 'sonnet',
  'claude-haiku-4-5-20251001': 'haiku',
};

function fullModel(short) { return MODEL_FULL[short] || short; }
function shortModel(full) { return MODEL_SHORT[full] || full; }

// --- SDLC slug → Paperclip urlKey mapping ---

const SLUG_TO_URLKEY = {
  roy: 'roy-trenneman',
  moss: 'maurice-moss',
  jen: 'jen-barber',
  richmond: 'richmond-avenal',
  denholm: 'denholm-reynholm',
  douglas: 'douglas-reynholm',
  'bill-crouse': 'bill-crouse',
  judy: 'judy',
  barbara: 'barbara',
  april: 'april',
  cto: 'cto',
  'quality-monitor': 'quality-monitor',
  bryce: 'bryce-board',
};

function urlKeyToSlug(urlKey) {
  for (const [slug, uk] of Object.entries(SLUG_TO_URLKEY)) {
    if (uk === urlKey) return slug;
  }
  return urlKey;
}

// --- SDLC role → Paperclip role mapping ---

const ROLE_MAP = {
  'Backend Developer': 'engineer',
  'AI Pipeline Engineer': 'engineer',
  'Frontend/Mobile Developer': 'engineer',
  'Frontend Developer': 'engineer',
  'Code Reviewer': 'qa',
  'Release Manager': 'devops',
  'Documentarian': 'researcher',
  'Requirements Engineer': 'researcher',
  'Business Value Analyst': 'researcher',
  'Technical Product Manager': 'pm',
  'Parallelization Analyst': 'researcher',
  'Quality Alignment Monitor': 'researcher',
  'Release Manager & CTO': 'cto',
  'CEO & Board Operator': 'ceo',
  'General': 'general',
};

// --- Token budget → monthly cents conversion ---

const COST_PER_MILLION_TOKENS = { opus: 45, sonnet: 9, haiku: 0.75 };

function dailyTokensToMonthlyCents(dailyTokens, model) {
  const costPerM = COST_PER_MILLION_TOKENS[model] || 9;
  const dailyDollars = (dailyTokens / 1_000_000) * costPerM;
  return Math.round(dailyDollars * 30 * 100);
}

// --- Max turns by model tier ---

function maxTurns(model) {
  if (model === 'opus') return 300;
  if (model === 'sonnet') return 300;
  return 100; // haiku
}

// --- Load SDLC config ---

function loadSdlcAgents() {
  const budgetPath = config.budgetPath;
  const domainsPath = resolve(config.agentsDir, 'domains.json');

  let budget = { agents: {} };
  if (existsSync(budgetPath)) {
    budget = JSON.parse(readFileSync(budgetPath, 'utf8'));
  }

  let domains = {};
  if (existsSync(domainsPath)) {
    domains = JSON.parse(readFileSync(domainsPath, 'utf8'));
  }

  // Merge budget + domains into unified agent list
  const allSlugs = new Set([
    ...Object.keys(budget.agents || {}),
    ...Object.keys(domains),
  ]);

  const agents = {};
  for (const slug of allSlugs) {
    const b = budget.agents?.[slug] || {};
    const d = domains[slug] || {};
    const agentMdPath = resolve(config.agentsDir, slug, 'AGENT.md');

    agents[slug] = {
      slug,
      name: d.name || slug,
      role: d.role || 'General',
      model: b.model || 'sonnet',
      dailyTokens: b.dailyTokens || 100000,
      permissions: b.permissions || 'full-edit',
      maxInstances: b.maxInstances || 1,
      hasAgentMd: existsSync(agentMdPath),
      agentMdPath: agentMdPath,
      patterns: d.patterns || [],
    };
  }

  return { agents, conservationMode: budget.conservationMode || false };
}

// --- Fetch Paperclip agents ---

async function fetchPaperclipAgents(creds) {
  const url = `${creds.apiUrl}/api/companies/${creds.companyId}/agents`;
  const headers = { 'Content-Type': 'application/json' };
  if (creds.apiKey) headers['Authorization'] = `Bearer ${creds.apiKey}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Paperclip API ${res.status}: ${await res.text()}`);
  return res.json();
}

// --- Update Paperclip agent ---

async function patchAgent(creds, agentId, patch) {
  const url = `${creds.apiUrl}/api/agents/${agentId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PATCH ${agentId} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function setInstructionsPath(creds, agentId, path) {
  const url = `${creds.apiUrl}/api/agents/${agentId}/instructions-path`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    // Process adapters don't support instructionsFilePath — skip silently
    const text = await res.text();
    if (text.includes('No default instructions path key')) return null;
    throw new Error(`SET instructions ${agentId} failed: ${res.status} ${text}`);
  }
  return res.json();
}

// --- Diff: SDLC vs Paperclip ---

function computeDiff(sdlcAgents, paperclipAgents) {
  const pcBySlug = {};
  for (const pc of paperclipAgents) {
    pcBySlug[urlKeyToSlug(pc.urlKey)] = pc;
  }

  const changes = [];

  for (const [slug, sdlc] of Object.entries(sdlcAgents)) {
    const pc = pcBySlug[slug];
    if (!pc) {
      changes.push({ type: 'missing', slug, sdlc, message: `${slug}: exists in SDLC but not in Paperclip` });
      continue;
    }

    const pcModel = shortModel(pc.adapterConfig?.model || '');
    const pcRole = pc.role;
    const expectedRole = ROLE_MAP[sdlc.role] || 'general';
    const expectedMonthlyCents = dailyTokensToMonthlyCents(sdlc.dailyTokens, sdlc.model);
    const pcInstr = pc.adapterConfig?.instructionsFilePath || '';
    const expectedInstr = sdlc.hasAgentMd ? sdlc.agentMdPath : '';

    // Skip process adapters — they run scripts, not LLMs
    if (pc.adapterType === 'process') continue;

    const diffs = [];

    if (pcModel !== sdlc.model) {
      diffs.push(`model: ${pcModel} → ${sdlc.model}`);
    }
    if (pcRole !== expectedRole) {
      diffs.push(`role: ${pcRole} → ${expectedRole}`);
    }
    if ((pc.adapterConfig?.timeoutSec || 0) === 0) {
      diffs.push(`timeoutSec: 0 → 900 (CRITICAL: 0 causes process loss)`);
    }
    if (pc.adapterConfig?.maxTurnsPerRun !== maxTurns(sdlc.model)) {
      diffs.push(`maxTurnsPerRun: ${pc.adapterConfig?.maxTurnsPerRun} → ${maxTurns(sdlc.model)}`);
    }
    // Don't sync dollar budgets — Paperclip's budgetMonthlyCents is a Paperclip-specific
    // concept (cost in dollars). SDLC's dailyTokens is a token-based concept.
    // These are managed independently.
    if (sdlc.hasAgentMd && pcInstr !== expectedInstr) {
      diffs.push(`instructions: ${pcInstr ? 'wrong path' : 'NOT SET'} → ${expectedInstr.replace(config.projectDir + '/', '')}`);
    }

    if (diffs.length > 0) {
      changes.push({ type: 'drift', slug, sdlc, pc, diffs, message: `${slug}: ${diffs.join(', ')}` });
    }
  }

  // Agents in Paperclip but not SDLC (informational only)
  for (const pc of paperclipAgents) {
    const slug = urlKeyToSlug(pc.urlKey);
    if (!sdlcAgents[slug]) {
      changes.push({ type: 'extra', slug, pc, message: `${slug}: in Paperclip but not in SDLC budget/domains` });
    }
  }

  return changes;
}

// --- Apply changes ---

async function applyChanges(creds, changes, sdlcAgents) {
  let applied = 0;

  for (const change of changes) {
    if (change.type === 'missing') {
      console.log(`  SKIP ${change.slug}: not in Paperclip (create via Paperclip UI or API)`);
      continue;
    }
    if (change.type === 'extra') {
      console.log(`  INFO ${change.slug}: in Paperclip only (not in SDLC)`);
      continue;
    }

    // type === 'drift'
    const { slug, sdlc, pc } = change;
    const patch = {};

    // Model, maxTurns, timeoutSec
    const needsModelUpdate = shortModel(pc.adapterConfig?.model) !== sdlc.model;
    const needsTimeoutFix = (pc.adapterConfig?.timeoutSec || 0) === 0;
    const needsMaxTurnsFix = pc.adapterConfig?.maxTurnsPerRun !== maxTurns(sdlc.model);
    if (needsModelUpdate || needsTimeoutFix || needsMaxTurnsFix) {
      const newConfig = {
        ...pc.adapterConfig,
        model: fullModel(sdlc.model),
        maxTurnsPerRun: maxTurns(sdlc.model),
        timeoutSec: pc.adapterConfig?.timeoutSec || 900,
        graceSec: pc.adapterConfig?.graceSec || 15,
      };
      if (needsTimeoutFix) newConfig.timeoutSec = 900;
      patch.adapterConfig = newConfig;
    }

    // Role
    const expectedRole = ROLE_MAP[sdlc.role] || 'general';
    if (pc.role !== expectedRole) {
      patch.role = expectedRole;
    }

    if (Object.keys(patch).length > 0) {
      await patchAgent(creds, pc.id, patch);
      console.log(`  UPDATED ${slug}: ${change.diffs.filter(d => !d.startsWith('instructions')).join(', ') || 'config'}`);
      applied++;
    }

    // Instructions path (separate endpoint)
    if (sdlc.hasAgentMd) {
      const pcInstr = pc.adapterConfig?.instructionsFilePath || '';
      if (pcInstr !== sdlc.agentMdPath) {
        const result = await setInstructionsPath(creds, pc.id, sdlc.agentMdPath);
        if (result) {
          console.log(`  UPDATED ${slug}: instructions → agents/${slug}/AGENT.md`);
          applied++;
        }
      }
    }
  }

  return applied;
}

// --- Pull spend data from Paperclip into budget.json ---

async function pullSpend(creds) {
  const paperclipAgents = await fetchPaperclipAgents(creds);
  const budgetPath = config.budgetPath;

  if (!existsSync(budgetPath)) {
    console.error('No budget.json found');
    process.exit(1);
  }

  const budget = JSON.parse(readFileSync(budgetPath, 'utf8'));

  for (const pc of paperclipAgents) {
    const slug = urlKeyToSlug(pc.urlKey);
    if (budget.agents?.[slug]) {
      budget.agents[slug].spentMonthlyCents = pc.spentMonthlyCents || 0;
      budget.agents[slug].paperclipStatus = pc.status;
    }
  }

  budget._lastSpendSync = new Date().toISOString();
  writeFileSync(budgetPath, JSON.stringify(budget, null, 2) + '\n');
  console.log(`Updated spend data for ${Object.keys(budget.agents).length} agents in budget.json`);
}

// --- Status display ---

function showStatus(sdlcAgents, paperclipAgents, changes) {
  console.log(`\n  SDLC → Paperclip Sync Status\n`);

  const pcBySlug = {};
  for (const pc of paperclipAgents) {
    pcBySlug[urlKeyToSlug(pc.urlKey)] = pc;
  }

  console.log(`  ${'Agent'.padEnd(18)} ${'SDLC Model'.padEnd(12)} ${'PC Model'.padEnd(12)} ${'SDLC Tokens'.padStart(12)} ${'Instructions'.padEnd(12)} ${'Status'}`);
  console.log(`  ${'─'.repeat(85)}`);

  for (const [slug, sdlc] of Object.entries(sdlcAgents)) {
    const pc = pcBySlug[slug];
    const pcModel = pc ? shortModel(pc.adapterConfig?.model || '') : '—';
    const modelMatch = pcModel === sdlc.model ? '✓' : '✗ ' + pcModel;
    const instrSet = pc?.adapterConfig?.instructionsFilePath ? '✓' : '✗';
    const status = !pc ? 'MISSING' : (pcModel === sdlc.model ? 'synced' : 'DRIFT');
    console.log(`  ${slug.padEnd(18)} ${sdlc.model.padEnd(12)} ${modelMatch.padEnd(12)} ${sdlc.dailyTokens.toLocaleString().padStart(12)} ${instrSet.padEnd(12)} ${status}`);
  }

  const driftCount = changes.filter(c => c.type === 'drift').length;
  const missingCount = changes.filter(c => c.type === 'missing').length;
  const extraCount = changes.filter(c => c.type === 'extra').length;

  console.log(`\n  Summary: ${driftCount} drifted, ${missingCount} missing, ${extraCount} extra`);

  if (driftCount > 0) {
    console.log(`\n  Drift details:`);
    for (const c of changes.filter(c => c.type === 'drift')) {
      console.log(`    ${c.slug}: ${c.diffs.join(', ')}`);
    }
  }

  console.log('');
}

// --- CLI ---

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const statusOnly = args.includes('--status');
const pullSpendOnly = args.includes('--pull-spent');

try {
  const creds = loadPaperclipEnv();

  if (!creds.apiUrl || !creds.companyId) {
    console.error('Missing Paperclip credentials. Set .paperclip.env or PAPERCLIP_* env vars.');
    process.exit(1);
  }

  if (pullSpendOnly) {
    await pullSpend(creds);
    process.exit(0);
  }

  const { agents: sdlcAgents } = loadSdlcAgents();
  const paperclipAgents = await fetchPaperclipAgents(creds);
  const changes = computeDiff(sdlcAgents, paperclipAgents);

  if (statusOnly) {
    showStatus(sdlcAgents, paperclipAgents, changes);
    process.exit(0);
  }

  if (changes.length === 0) {
    console.log('Paperclip is in sync with SDLC. No changes needed.');
    process.exit(0);
  }

  if (dryRun) {
    console.log('Dry run — would apply:\n');
    for (const c of changes) console.log(`  ${c.message}`);
    process.exit(0);
  }

  console.log(`Syncing SDLC → Paperclip (${changes.filter(c => c.type === 'drift').length} changes):\n`);
  const applied = await applyChanges(creds, changes, sdlcAgents);
  console.log(`\nDone. ${applied} updates applied.`);

} catch (err) {
  console.error(`Paperclip sync failed: ${err.message}`);
  process.exit(1);
}
