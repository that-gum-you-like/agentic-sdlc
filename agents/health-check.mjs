#!/usr/bin/env node
/**
 * Health Check — System health across queue depth, budget config, disk, and cron liveness.
 *
 * Runs a small set of best-effort checks and rolls them up into a single
 * overall status (ok|degraded|down). Intended to be run standalone or wired
 * into a cron/monitoring loop via `--notify`, which sends a one-line summary
 * through the notification layer when the system is not fully healthy.
 *
 * Usage:
 *   node ~/agentic-sdlc/agents/health-check.mjs              # Run checks, print report
 *   node ~/agentic-sdlc/agents/health-check.mjs --notify     # Also notify if not 'ok'
 */

import { readFileSync, existsSync, readdirSync, statfsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from './load-config.mjs';
import { logCapabilityUsage } from './capability-logger.mjs';

const QUEUE_DEPTH_WARN = 50;
const DISK_FREE_DEGRADED_PCT = 15;
const DISK_FREE_DOWN_PCT = 5;

const SEVERITY_RANK = { ok: 0, degraded: 1, down: 2 };

function worst(a, b) {
  return SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkQueue(config) {
  if (!existsSync(config.tasksDir)) {
    return { name: 'queue', status: 'ok', detail: 'tasks/queue not present (no queue in use)' };
  }
  const depth = readdirSync(config.tasksDir).filter(f => f.endsWith('.json')).length;
  if (depth > QUEUE_DEPTH_WARN) {
    return { name: 'queue', status: 'degraded', detail: `queue depth ${depth} exceeds ${QUEUE_DEPTH_WARN}` };
  }
  return { name: 'queue', status: 'ok', detail: `queue depth ${depth}` };
}

function checkBudget(config) {
  if (!existsSync(config.budgetPath)) {
    return { name: 'budget', status: 'down', detail: 'agents/budget.json missing' };
  }
  let budget;
  try {
    budget = JSON.parse(readFileSync(config.budgetPath, 'utf8'));
  } catch (e) {
    return { name: 'budget', status: 'down', detail: `agents/budget.json unparseable: ${e.message}` };
  }

  const agents = budget.agents || {};
  const agentNames = Object.keys(agents);
  const missingTokens = agentNames.filter(name => typeof agents[name].dailyTokens !== 'number');
  if (missingTokens.length > 0) {
    return { name: 'budget', status: 'down', detail: `missing numeric dailyTokens: ${missingTokens.join(', ')}` };
  }

  if (budget.conservationMode) {
    return { name: 'budget', status: 'degraded', detail: 'conservationMode is active' };
  }
  return { name: 'budget', status: 'ok', detail: `${agentNames.length} agent(s) configured` };
}

function checkDisk(config) {
  let stats;
  try {
    stats = statfsSync(config.projectDir);
  } catch (e) {
    return { name: 'disk', status: 'degraded', detail: `statfs unavailable: ${e.message}` };
  }
  const freePct = (stats.bfree / stats.blocks) * 100;
  const detail = `${freePct.toFixed(1)}% free`;
  if (freePct < DISK_FREE_DOWN_PCT) {
    return { name: 'disk', status: 'down', detail };
  }
  if (freePct < DISK_FREE_DEGRADED_PCT) {
    return { name: 'disk', status: 'degraded', detail };
  }
  return { name: 'disk', status: 'ok', detail };
}

function checkCron() {
  const candidates = [
    resolve(process.env.HOME || '', '.openclaw', 'openclaw.json'),
    resolve(process.env.HOME || '', '.openclaw', 'cron'),
  ];
  const found = candidates.find(p => existsSync(p));
  if (found) {
    return { name: 'cron', status: 'ok', detail: `evidence found at ${found}` };
  }
  return { name: 'cron', status: 'degraded', detail: 'no OpenClaw cron config or report found (best-effort check)' };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Run all health checks and roll them up into an overall status.
 *
 * @param {object} [opts]
 * @returns {{status: 'ok'|'degraded'|'down', checks: Array<{name: string, status: string, detail: string}>, timestamp: string}}
 */
export function runHealthCheck(opts = {}) {
  const config = loadConfig();

  const checks = [
    checkQueue(config),
    checkBudget(config),
    checkDisk(config),
    checkCron(config),
  ];

  let status = 'ok';
  for (const check of checks) {
    status = worst(status, check.status);
  }

  return { status, checks, timestamp: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
function __isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === __filename;
}

if (__isMainModule()) {
  const args = process.argv.slice(2);
  const notify = args.includes('--notify');

  const result = runHealthCheck();

  console.log(`Health: ${result.status} (${result.timestamp})`);
  for (const check of result.checks) {
    console.log(`  [${check.status}] ${check.name}: ${check.detail}`);
  }

  logCapabilityUsage('healthCheck', 'system', 'health-check', 'health-check.mjs', 'check');

  if (notify && result.status !== 'ok') {
    const { sendNotification } = await import('./notify.mjs');
    const failing = result.checks.filter(c => c.status !== 'ok').map(c => `${c.name} (${c.status})`).join(', ');
    sendNotification(`Health check: ${result.status.toUpperCase()} — ${failing}`);
  }
}
