#!/usr/bin/env node
/**
 * Health Check — System health across queue depth, budget config, disk, cron
 * liveness, and outbound egress.
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
import { checkEgress } from './net-doctor.mjs';

const QUEUE_DEPTH_WARN = 50;
const DISK_FREE_DEGRADED_PCT = 15;
const DISK_FREE_DOWN_PCT = 5;
// Shorter than net-doctor's own 5s CLI default so the daily run stays brisk.
// The failure that matters (a black-holed connect) fails instantly anyway, so
// the tighter budget costs nothing in the case we're actually watching for.
const EGRESS_TIMEOUT_MS = 3000;

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

/**
 * Outbound egress to the LLM provider and the notification channel.
 *
 * This is the check that catches the IPv6-blackhole failure mode: when a host
 * has no IPv6 default route but resolvers still hand back AAAA records,
 * IPv6-preferring HTTP stacks fail instantly with ENETUNREACH and every layer
 * above reports it as "the provider is down". Without this check the one
 * fault that stops every autonomous cycle is the one thing health-check
 * cannot see. See agents/net-doctor.mjs.
 *
 * @param {() => Promise<{findings: Array<{id: string, severity: string, remedy: string}>}>} probe
 */
async function checkEgressHealth(probe) {
  let result;
  try {
    result = await probe();
  } catch (e) {
    // Best-effort like every other check here: a diagnostic that failed to run
    // must stay distinguishable from a network that's actually down.
    return { name: 'egress', status: 'degraded', detail: `egress probe failed to run: ${e.message}` };
  }

  const findings = Array.isArray(result?.findings) ? result.findings : [];
  const critical = findings.filter(f => f.severity === 'critical');
  if (critical.length > 0) {
    const ids = [...new Set(critical.map(f => f.id))].join(', ');
    return { name: 'egress', status: 'down', detail: `${ids} — ${critical[0].remedy}` };
  }

  const warn = findings.filter(f => f.severity === 'warn');
  if (warn.length > 0) {
    const ids = [...new Set(warn.map(f => f.id))].join(', ');
    return { name: 'egress', status: 'degraded', detail: ids };
  }

  return { name: 'egress', status: 'ok', detail: 'provider + notification hosts reachable' };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Run all health checks and roll them up into an overall status.
 *
 * Async because egress can only be measured, never inferred — there is no
 * honest synchronous way to probe the network.
 *
 * @param {object} [opts]
 * @param {() => Promise<object>} [opts.egress] override the egress probe (tests)
 * @returns {Promise<{status: 'ok'|'degraded'|'down', checks: Array<{name: string, status: string, detail: string}>, timestamp: string}>}
 */
export async function runHealthCheck(opts = {}) {
  const { egress = () => checkEgress({ timeoutMs: EGRESS_TIMEOUT_MS }) } = opts;
  const config = loadConfig();

  const checks = [
    checkQueue(config),
    checkBudget(config),
    checkDisk(config),
    checkCron(config),
    await checkEgressHealth(egress),
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

  const result = await runHealthCheck();

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
