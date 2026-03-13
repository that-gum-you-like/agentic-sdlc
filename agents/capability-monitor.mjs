#!/usr/bin/env node
/**
 * Capability Monitor — Analyzes agent capability usage, detects drift, and reports trends.
 *
 * PRIMARY source of truth: pm/capability-log.jsonl (system-instrumented, cannot be faked)
 * SECONDARY source: capabilityChecklist field in completed task JSON (agent self-report)
 *
 * Usage:
 *   node agents/capability-monitor.mjs check    # Scan recent tasks for drift
 *   node agents/capability-monitor.mjs report   # Full per-agent usage rate table
 *   node agents/capability-monitor.mjs status   # Quick health check
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { loadConfig } from './load-config.mjs';
import { triggerNotification } from './notify.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = loadConfig();

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function getMonitoringConfig() {
  return config.capabilityMonitoring || { enabled: true, driftThreshold: 3, windowSize: 10 };
}

function loadCapabilitiesConfig() {
  const capPath = resolve(config.agentsDir, 'capabilities.json');
  if (!existsSync(capPath)) return {};
  try {
    return JSON.parse(readFileSync(capPath, 'utf8'));
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// System log loader (PRIMARY source)
// ---------------------------------------------------------------------------

function loadSystemLog() {
  const logPath = config.capabilityLogPath;
  if (!existsSync(logPath)) return [];

  const lines = readFileSync(logPath, 'utf8').split('\n').filter(l => l.trim());
  const entries = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Completed task loader (SECONDARY source — agent self-report)
// ---------------------------------------------------------------------------

function loadCompletedTasks() {
  const completedDir = config.completedDir;
  if (!existsSync(completedDir)) return [];

  const files = readdirSync(completedDir).filter(f => f.endsWith('.json')).sort();
  const tasks = [];
  for (const file of files) {
    try {
      const task = JSON.parse(readFileSync(resolve(completedDir, file), 'utf8'));
      tasks.push(task);
    } catch { /* skip malformed */ }
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// Drift detection (4.2)
// PRIMARY: system log for "did it happen?"
// SECONDARY: self-report for "why not?"
// ---------------------------------------------------------------------------

function detectDrift(capabilitiesConfig, systemLog, completedTasks, monConfig) {
  const { driftThreshold, windowSize } = monConfig;
  const alerts = [];

  // Group system log entries by agent+taskId
  const systemLogByAgentTask = {};
  for (const entry of systemLog) {
    const key = `${entry.agent}::${entry.taskId}`;
    if (!systemLogByAgentTask[key]) systemLogByAgentTask[key] = [];
    systemLogByAgentTask[key].push(entry);
  }

  // Get unique agents from capabilities config + completed tasks
  const agentNames = new Set([
    ...Object.keys(capabilitiesConfig),
    ...completedTasks.map(t => t.claimedBy || t.assignee).filter(Boolean),
  ]);

  for (const agent of agentNames) {
    const agentConfig = capabilitiesConfig[agent] || { required: [], conditional: {}, notExpected: [] };
    const required = agentConfig.required || [];
    const conditional = agentConfig.conditional || {};
    const notExpected = agentConfig.notExpected || [];

    // Get last windowSize completed tasks for this agent
    const agentTasks = completedTasks
      .filter(t => (t.claimedBy === agent || t.assignee === agent) && t.status === 'completed')
      .sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0))
      .slice(0, windowSize);

    if (agentTasks.length === 0) continue;

    // Check required capabilities for consecutive skips (using system log as primary)
    for (const cap of required) {
      let consecutiveSkips = 0;

      for (const task of agentTasks) {
        const logKey = `${agent}::${task.id}`;
        const sysEntries = systemLogByAgentTask[logKey] || [];
        const usedInSysLog = sysEntries.some(e => e.capability === cap);

        if (usedInSysLog) {
          break; // used — reset streak
        }

        // Not in system log — check self-report for skipReason
        const checklist = task.capabilityChecklist;
        const selfReport = checklist?.capabilities?.[cap];
        const hasSkipReason = selfReport?.skipReason && selfReport.skipReason.trim();

        if (hasSkipReason) {
          // Legitimate skip — don't count as drift
          break;
        }

        consecutiveSkips++;
      }

      if (consecutiveSkips >= driftThreshold) {
        const msg = `Capability drift alert: ${agent} has skipped '${cap}' for ${consecutiveSkips} consecutive tasks without justification`;
        alerts.push({ type: 'drift', agent, capability: cap, consecutiveSkips, message: msg });
        triggerNotification('capabilityDrift', `⚠️ CAPABILITY DRIFT: ${msg}`);
      }
    }

    // Scope creep detection (4.3): notExpected capability marked as used
    for (const task of agentTasks) {
      const checklist = task.capabilityChecklist;
      if (!checklist?.capabilities) continue;

      for (const cap of notExpected) {
        const selfReport = checklist.capabilities[cap];
        if (selfReport?.used === true) {
          const msg = `Scope creep warning: ${agent} used '${cap}' on task ${task.id} which is not expected for this agent`;
          alerts.push({ type: 'scopeCreep', agent, capability: cap, taskId: task.id, message: msg });
        }
      }
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Discrepancy detection (4.2b)
// Agent claims used=true but system log has no matching entry
// ---------------------------------------------------------------------------

function detectDiscrepancies(systemLog, completedTasks) {
  const discrepancies = [];

  // Group system log entries by agent+taskId+capability
  const sysLogSet = new Set();
  for (const entry of systemLog) {
    sysLogSet.add(`${entry.agent}::${entry.taskId}::${entry.capability}`);
  }

  for (const task of completedTasks) {
    const agent = task.claimedBy || task.assignee;
    if (!agent) continue;

    const checklist = task.capabilityChecklist;
    if (!checklist?.capabilities) continue;

    for (const [cap, report] of Object.entries(checklist.capabilities)) {
      if (report?.used === true) {
        const key = `${agent}::${task.id}::${cap}`;
        if (!sysLogSet.has(key)) {
          discrepancies.push({
            agent,
            taskId: task.id,
            capability: cap,
            message: `Agent ${agent} claimed ${cap} but no system log entry found for ${task.id}`,
          });
        }
      }
    }
  }

  return discrepancies;
}

// ---------------------------------------------------------------------------
// Usage aggregation (4.4)
// Per-agent, per-capability usage rate over the window
// ---------------------------------------------------------------------------

function computeUsageRates(capabilitiesConfig, systemLog, completedTasks, windowSize) {
  const rates = {};

  // Get unique agents
  const agentNames = new Set([
    ...Object.keys(capabilitiesConfig),
    ...completedTasks.map(t => t.claimedBy || t.assignee).filter(Boolean),
  ]);

  // Group system log by agent+taskId
  const sysLogByAgentTask = {};
  for (const entry of systemLog) {
    const key = `${entry.agent}::${entry.taskId}`;
    if (!sysLogByAgentTask[key]) sysLogByAgentTask[key] = new Set();
    sysLogByAgentTask[key].add(entry.capability);
  }

  for (const agent of agentNames) {
    const agentTasks = completedTasks
      .filter(t => (t.claimedBy === agent || t.assignee === agent) && t.status === 'completed')
      .sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0))
      .slice(0, windowSize);

    if (agentTasks.length === 0) continue;

    rates[agent] = {};

    // Collect all capabilities seen for this agent (from config + system log)
    const agentConfig = capabilitiesConfig[agent] || {};
    const capsToTrack = new Set([
      ...(agentConfig.required || []),
      ...Object.keys(agentConfig.conditional || {}),
    ]);

    // Also include any capabilities seen in system log for this agent's tasks
    for (const task of agentTasks) {
      const key = `${agent}::${task.id}`;
      const sysSet = sysLogByAgentTask[key] || new Set();
      for (const cap of sysSet) capsToTrack.add(cap);
    }

    for (const cap of capsToTrack) {
      let usedCount = 0;
      for (const task of agentTasks) {
        const key = `${agent}::${task.id}`;
        const sysSet = sysLogByAgentTask[key] || new Set();
        if (sysSet.has(cap)) usedCount++;
      }
      rates[agent][cap] = {
        used: usedCount,
        total: agentTasks.length,
        rate: agentTasks.length > 0 ? Math.round((usedCount / agentTasks.length) * 100) : 0,
      };
    }
  }

  return rates;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdCheck() {
  const monConfig = getMonitoringConfig();

  if (!monConfig.enabled) {
    console.log('Capability monitoring is disabled (capabilityMonitoring.enabled=false in project.json)');
    process.exit(0);
  }

  const capabilitiesConfig = loadCapabilitiesConfig();
  const systemLog = loadSystemLog();
  const completedTasks = loadCompletedTasks();

  const driftAlerts = detectDrift(capabilitiesConfig, systemLog, completedTasks, monConfig);
  const discrepancies = detectDiscrepancies(systemLog, completedTasks);

  const total = driftAlerts.length + discrepancies.length;

  if (total === 0) {
    console.log('Agent Capability Health: All agents nominal. No drift alerts.');
    return { driftAlerts: [], discrepancies: [] };
  }

  if (driftAlerts.length > 0) {
    console.log('\nDrift Alerts:');
    for (const a of driftAlerts) {
      if (a.type === 'drift') {
        console.log(`  DRIFT ALERT — ${a.agent}: ${a.capability} skipped ${a.consecutiveSkips}x consecutive`);
      } else if (a.type === 'scopeCreep') {
        console.log(`  SCOPE CREEP — ${a.agent}: used '${a.capability}' on ${a.taskId} (not expected)`);
      }
    }
  }

  if (discrepancies.length > 0) {
    console.log('\nDiscrepancies (agent claimed used but no system log entry):');
    for (const d of discrepancies) {
      console.log(`  ${d.agent} / ${d.taskId} / ${d.capability}`);
    }
  }

  return { driftAlerts, discrepancies };
}

function cmdReport() {
  const monConfig = getMonitoringConfig();

  if (!monConfig.enabled) {
    console.log('Capability monitoring is disabled.');
    process.exit(0);
  }

  const capabilitiesConfig = loadCapabilitiesConfig();
  const systemLog = loadSystemLog();
  const completedTasks = loadCompletedTasks();

  const rates = computeUsageRates(capabilitiesConfig, systemLog, completedTasks, monConfig.windowSize);

  if (Object.keys(rates).length === 0) {
    console.log('No completed tasks found. No usage data available.');
    return rates;
  }

  console.log(`\nCapability Usage Report (last ${monConfig.windowSize} tasks per agent)\n`);

  for (const [agent, caps] of Object.entries(rates)) {
    console.log(`${agent}:`);

    // Sort: required first, then by cap name
    const agentConfig = capabilitiesConfig[agent] || {};
    const required = agentConfig.required || [];

    const sorted = Object.entries(caps).sort(([a], [b]) => {
      const aReq = required.includes(a) ? 0 : 1;
      const bReq = required.includes(b) ? 0 : 1;
      if (aReq !== bReq) return aReq - bReq;
      return a.localeCompare(b);
    });

    // Table header
    const colW = 22;
    console.log(`  ${'Capability'.padEnd(colW)} ${'Used'.padStart(6)} ${'Total'.padStart(6)} ${'Rate'.padStart(6)}`);
    console.log(`  ${'─'.repeat(colW)} ${'─'.repeat(6)} ${'─'.repeat(6)} ${'─'.repeat(6)}`);

    for (const [cap, data] of sorted) {
      const reqMark = required.includes(cap) ? '*' : ' ';
      const rateStr = `${data.rate}%`;
      console.log(`  ${(cap + reqMark).padEnd(colW)} ${String(data.used).padStart(6)} ${String(data.total).padStart(6)} ${rateStr.padStart(6)}`);
    }
    console.log('  (* = required)');
    console.log('');
  }

  // Also run drift check and show alerts at the bottom
  const driftAlerts = detectDrift(capabilitiesConfig, systemLog, completedTasks, monConfig);
  if (driftAlerts.length > 0) {
    console.log('Active Alerts:');
    for (const a of driftAlerts) {
      console.log(`  ${a.message}`);
    }
  }

  return rates;
}

function cmdStatus() {
  const monConfig = getMonitoringConfig();
  const systemLog = loadSystemLog();
  const completedTasks = loadCompletedTasks();

  console.log('Capability Monitor Status');
  console.log('─'.repeat(40));
  console.log(`  Enabled:         ${monConfig.enabled}`);
  console.log(`  Drift threshold: ${monConfig.driftThreshold} consecutive skips`);
  console.log(`  Window size:     ${monConfig.windowSize} tasks`);
  console.log(`  System log:      ${systemLog.length} entries`);
  console.log(`  Completed tasks: ${completedTasks.length}`);

  const withChecklist = completedTasks.filter(t => t.capabilityChecklist !== null && t.capabilityChecklist !== undefined).length;
  const checklistRate = completedTasks.length > 0
    ? Math.round((withChecklist / completedTasks.length) * 100)
    : 0;
  console.log(`  Checklist rate:  ${withChecklist}/${completedTasks.length} tasks (${checklistRate}%)`);

  if (!monConfig.enabled) {
    console.log('\n  Monitoring is disabled.');
    return;
  }

  const capabilitiesConfig = loadCapabilitiesConfig();
  const driftAlerts = detectDrift(capabilitiesConfig, systemLog, completedTasks, monConfig);
  const scopeCreepAlerts = driftAlerts.filter(a => a.type === 'scopeCreep');
  const driftOnlyAlerts = driftAlerts.filter(a => a.type === 'drift');

  console.log(`\n  Drift alerts:    ${driftOnlyAlerts.length}`);
  console.log(`  Scope creep:     ${scopeCreepAlerts.length}`);

  if (driftAlerts.length === 0) {
    console.log('\n  All agents nominal.');
  } else {
    console.log('\n  Run "check" for details.');
  }
}

// ---------------------------------------------------------------------------
// Exports (for integration with daily/weekly cycles and tests)
// ---------------------------------------------------------------------------

export {
  loadSystemLog,
  loadCompletedTasks,
  loadCapabilitiesConfig,
  detectDrift,
  detectDiscrepancies,
  computeUsageRates,
  getMonitoringConfig,
};

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const [,, cmd] = process.argv;

switch (cmd) {
  case 'check':
    cmdCheck();
    break;
  case 'report':
    cmdReport();
    break;
  case 'status':
    cmdStatus();
    break;
  default:
    console.log(`Capability Monitor

Usage:
  capability-monitor.mjs check    # Scan recent tasks for drift alerts
  capability-monitor.mjs report   # Full per-agent capability usage rate table
  capability-monitor.mjs status   # Quick health check

Configuration (project.json):
  capabilityMonitoring.enabled        — enable/disable (default: true)
  capabilityMonitoring.driftThreshold — consecutive skips before alerting (default: 3)
  capabilityMonitoring.windowSize     — tasks to analyze per agent (default: 10)

Per-agent expected capabilities: agents/capabilities.json`);
}
