#!/usr/bin/env node
/**
 * Weekly Review — Pattern review, memory cleanup, checklist update
 *
 * 1. Pattern review: what anti-patterns recurred?
 * 2. Memory cleanup: run REM Sleep consolidation for all agents
 * 3. Checklist update: suggest new items for the reviewer's checklist
 * 4. Post summary
 *
 * Usage:
 *   node agents/cycles/weekly-review.mjs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

import { loadConfig } from '../load-config.mjs';
import { runStep } from './monthly-review.mjs';
import { upsertDashboardSection } from './daily-review.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const config = loadConfig();
const ROOT = config.projectDir;
const AGENTS_DIR = config.agentsDir;
const TASKS_DIR = config.tasksDir;

// The reviewer agent whose review records feed pattern analysis and maturation
// metrics. Review records are written by the automated review pipeline
// (pr-auto-review.mjs) under `agents/<reviewer>/reviews`, so the path must be
// derived from the reviewer's agent directory — never hard-coded to one
// project's persona name.
export const REVIEWER_AGENT = 'sdlc-reviewer';

/**
 * Resolve the reviewer's review-records directory.
 *
 * @param {string} agentsDir - absolute path to the project's `agents/` dir
 * @param {string} [reviewer=REVIEWER_AGENT] - reviewer agent directory name
 * @returns {string} `<agentsDir>/<reviewer>/reviews`
 */
export function resolveReviewsDir(agentsDir, reviewer = REVIEWER_AGENT) {
  return resolve(agentsDir, reviewer, 'reviews');
}

const REVIEWS_DIR = resolveReviewsDir(AGENTS_DIR);

const AGENTS = config.agents;

function analyzePatterns() {
  console.log('\n📊 Pattern Analysis');
  console.log('─'.repeat(40));

  // Analyze the reviewer's reviews for recurring issues
  if (!existsSync(REVIEWS_DIR)) {
    console.log('  No reviews found yet.');
    return;
  }

  const reviewFiles = readdirSync(REVIEWS_DIR).filter(f => f.endsWith('.md'));
  const issueCounts = {};

  for (const file of reviewFiles) {
    const content = readFileSync(resolve(REVIEWS_DIR, file), 'utf8');
    const issues = content.match(/\[(critical|major|minor)\]/g) || [];
    issues.forEach(issue => {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    });
  }

  console.log(`  Reviews analyzed: ${reviewFiles.length}`);
  for (const [issue, count] of Object.entries(issueCounts)) {
    console.log(`  ${issue}: ${count} occurrences`);
  }

  // Check agent failures
  console.log('\n🔴 Agent Failures This Week');
  console.log('─'.repeat(40));

  for (const agent of AGENTS) {
    const corePath = resolve(AGENTS_DIR, agent, 'memory/core.json');
    if (!existsSync(corePath)) continue;
    const core = JSON.parse(readFileSync(corePath, 'utf8'));
    if (core.failures?.length > 0) {
      console.log(`  ${agent}: ${core.failures.length} failures`);
      core.failures.forEach(f => console.log(`    - ${f.description}`));
    }
  }
}

function consolidateMemories() {
  console.log('\n🌙 REM Sleep — Consolidating Memories');
  console.log('─'.repeat(40));

  for (const agent of AGENTS) {
    try {
      const output = execSync(
        `node ${resolve(AGENTS_DIR, 'memory-manager.mjs')} consolidate ${agent}`,
        { encoding: 'utf8', cwd: ROOT }
      );
      // Just show the consolidation lines, not the full recall
      const consolidationLines = output.split('\n').filter(l => l.includes('Moved') || l.includes('Removed') || l.includes('complete'));
      if (consolidationLines.length > 0) {
        console.log(`  ${agent}:`);
        consolidationLines.forEach(l => console.log(`    ${l.trim()}`));
      } else {
        console.log(`  ${agent}: No consolidation needed`);
      }
    } catch (e) {
      console.log(`  ${agent}: Error during consolidation`);
    }
  }
}

function taskSummary() {
  console.log('\n📋 Task Queue Summary');
  console.log('─'.repeat(40));

  if (!existsSync(TASKS_DIR)) {
    console.log('  No tasks found.');
    return;
  }

  const files = readdirSync(TASKS_DIR).filter(f => f.endsWith('.json'));
  let completed = 0, inProgress = 0, pending = 0;

  for (const file of files) {
    const task = JSON.parse(readFileSync(resolve(TASKS_DIR, file), 'utf8'));
    if (task.status === 'completed') completed++;
    else if (task.status === 'in_progress') inProgress++;
    else pending++;
  }

  console.log(`  Completed: ${completed}`);
  console.log(`  In Progress: ${inProgress}`);
  console.log(`  Pending: ${pending}`);
  console.log(`  Total: ${files.length}`);
  console.log(`  Velocity: ${completed} tasks/week`);
}

/**
 * Compute per-agent maturation metrics for the current ISO week and write
 * them to each agent's core.json under maturation.metrics[isoWeek].
 *
 * Metrics collected:
 *   - correctionsReceived: count of entries tagged [correction] in recent + medium-term
 *   - selfCorrections:     count of entries tagged [self-correction] in recent + medium-term
 *   - reviewSeverity:      { critical, major, minor } counts from the reviewer's reviews
 */
function computeMaturationMetrics() {
  console.log('\n🎓 Agent Maturation Metrics');
  console.log('─'.repeat(40));

  // Determine ISO week string, e.g. "2026-W11"
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const weekNum = Math.ceil(((now - jan4) / 86400000 + jan4.getDay() + 1) / 7);
  const isoWeek = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

  // Pre-scan the reviewer's reviews for severity counts per author
  const severityByAgent = {};
  if (existsSync(REVIEWS_DIR)) {
    const reviewFiles = readdirSync(REVIEWS_DIR).filter(f => f.endsWith('.md'));
    for (const file of reviewFiles) {
      const content = readFileSync(resolve(REVIEWS_DIR, file), 'utf8');
      // Try to attribute to an agent via filename convention: <date>-<agent>-*.md
      const agentMatch = file.match(/^\d{4}-\d{2}-\d{2}-([a-z]+)/);
      const reviewAgent = agentMatch ? agentMatch[1] : null;
      if (!reviewAgent || !AGENTS.includes(reviewAgent)) continue;
      if (!severityByAgent[reviewAgent]) {
        severityByAgent[reviewAgent] = { critical: 0, major: 0, minor: 0 };
      }
      const issues = content.match(/\[(critical|major|minor)\]/gi) || [];
      issues.forEach(tag => {
        const key = tag.replace(/\[|\]/g, '').toLowerCase();
        severityByAgent[reviewAgent][key] = (severityByAgent[reviewAgent][key] || 0) + 1;
      });
    }
  }

  for (const agent of AGENTS) {
    const corePath = resolve(AGENTS_DIR, agent, 'memory/core.json');
    if (!existsSync(corePath)) {
      console.log(`  ${agent}: no core.json — skipped`);
      continue;
    }

    const core = JSON.parse(readFileSync(corePath, 'utf8'));

    // Count correction entries across recent + medium-term memory
    let correctionsReceived = 0;
    let selfCorrections = 0;
    for (const layer of ['recent', 'medium-term']) {
      const memPath = resolve(AGENTS_DIR, agent, `memory/${layer}.json`);
      if (!existsSync(memPath)) continue;
      const mem = JSON.parse(readFileSync(memPath, 'utf8'));
      for (const entry of mem.entries || []) {
        const text = (entry.content || '').toLowerCase();
        if (text.includes('[correction]') || text.includes('correction:')) {
          correctionsReceived++;
        }
        if (text.includes('[self-correction]') || text.includes('self-correction:')) {
          selfCorrections++;
        }
      }
    }

    const reviewSeverity = severityByAgent[agent] || { critical: 0, major: 0, minor: 0 };

    // Write metrics into core.json
    core.maturation = core.maturation || { level: 0, weekStarted: '', milestonesHit: [], metrics: {} };
    core.maturation.metrics = core.maturation.metrics || {};
    core.maturation.metrics[isoWeek] = { correctionsReceived, selfCorrections, reviewSeverity };

    writeFileSync(corePath, JSON.stringify(core, null, 2));
    console.log(`  ${agent} [${isoWeek}]: corrections=${correctionsReceived}, self-corrections=${selfCorrections}, severity=${JSON.stringify(reviewSeverity)}`);
  }
}

/**
 * buildWeeklySteps — Return the ordered list of weekly review steps.
 *
 * Each entry has { label, script, args } compatible with monthly-review's runStep.
 * When dryRun is true each step gets --dry-run appended to its args.
 *
 * @param {{dryRun?: boolean}} opts
 * @returns {{label: string, script: string, args: string[]}[]}
 */
export function buildWeeklySteps({ dryRun = false } = {}) {
  const steps = [
    { label: 'Pattern hunt', script: 'pattern-hunt.mjs', args: [] },
    { label: 'REM sleep similarity', script: 'rem-sleep.mjs', args: ['--similarity'] },
    { label: 'Behavior drift', script: 'test-behavior.mjs', args: ['--drift'] },
  ];
  if (dryRun) {
    for (const step of steps) {
      step.args = [...step.args, '--dry-run'];
    }
  }
  return steps;
}

/**
 * runWeeklySteps — Execute an ordered list of weekly review steps.
 *
 * Each step is run via the provided runner (default: runStep from monthly-review.mjs).
 * A failing step does NOT stop subsequent steps.
 * Prints "<label>: PASS|FAIL" for each step result.
 *
 * @param {{label: string, script: string, args: string[]}[]} steps
 * @param {Function} [runner=runStep] - (label, script, args) => {{label, ok}}
 * @returns {{label: string, ok: boolean}[]}
 */
export function runWeeklySteps(steps, runner = runStep) {
  const results = [];
  for (const step of steps) {
    const result = runner(step.label, step.script, step.args);
    results.push(result);
    const status = result.ok ? 'PASS' : 'FAIL';
    console.log(`${step.label}: ${status}`);
  }
  return results;
}

/**
 * Pure function: compute how many days to drain pending tokens at the given daily budget.
 *
 * @param {{estimatedTokens?: number}[]} tasks - task objects from the queue
 * @param {number|undefined|null} budget - daily token budget (a positive number)
 * @returns {string} "N days" or "n/a" when budget is missing, zero, or invalid
 */
export function capacityForecast(tasks, budget) {
  if (!budget || typeof budget !== 'number' || budget <= 0) return 'n/a';
  const total = tasks.reduce((sum, t) => sum + (typeof t.estimatedTokens === 'number' ? t.estimatedTokens : 0), 0);
  const days = Math.ceil(total / budget);
  if (!Number.isFinite(days) || days < 0) return 'n/a';
  return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Pure function: report tasks needing grooming attention.
 *
 * Returns four lists: tasks missing estimatedTokens, missing acceptance_criteria,
 * missing priority, and unclaimed for more than 30 days.
 * Each list is an array of task identifiers (id or title).
 * Empty arrays mean no tasks have that issue.
 *
 * @param {{id?: string, title?: string, estimatedTokens?: number, acceptance_criteria?: unknown, priority?: string, claimedBy?: string|null, createdAt?: string}[]} tasks
 * @param {Date} [now] - reference date for "unclaimed over 30 days" check (defaults to new Date())
 * @returns {{ missingEstimatedTokens: string[], missingAcceptanceCriteria: string[], missingPriority: string[], unclaimedOver30Days: string[] }}
 */
export function groomingReport(tasks, now = new Date()) {
  /** @type {string[]} */
  const missingEstimatedTokens = [];
  /** @type {string[]} */
  const missingAcceptanceCriteria = [];
  /** @type {string[]} */
  const missingPriority = [];
  /** @type {string[]} */
  const unclaimedOver30Days = [];

  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  for (const task of tasks) {
    const label = task.id || task.title || '';

    // Missing estimatedTokens: undefined, null, or non-number
    if (task.estimatedTokens === undefined || task.estimatedTokens === null || typeof task.estimatedTokens !== 'number') {
      missingEstimatedTokens.push(label);
    }

    // Missing acceptance_criteria: undefined, null, empty string, or empty array
    if (!task.acceptance_criteria || (Array.isArray(task.acceptance_criteria) && task.acceptance_criteria.length === 0)) {
      missingAcceptanceCriteria.push(label);
    }

    // Missing priority: undefined, null, or empty string
    if (!task.priority) {
      missingPriority.push(label);
    }

    // Unclaimed over 30 days
    if (!task.claimedBy && task.createdAt) {
      const age = now.getTime() - new Date(task.createdAt).getTime();
      if (age > thirtyDaysMs) {
        unclaimedOver30Days.push(label);
      }
    }
  }

  return { missingEstimatedTokens, missingAcceptanceCriteria, missingPriority, unclaimedOver30Days };
}

/**
 * Pure function: compute PR rejection rate from pr-auto-review.log JSON lines.
 *
 * Filters to entries within the last 28 days (relative to `now`), deduplicates
 * by (pr, sha) keeping the latest entry per pair, then computes:
 *   rate = (gate-failed + llm-rejected) / (merged + gate-failed + llm-rejected)
 *
 * @param {string[]} logLines - array of JSON strings from pm/pr-auto-review.log
 * @param {Date} now - reference date for the 28-day window
 * @returns {{ rate: number|null, rejected: number, merged: number }}
 *   rate is null when the denominator (rejected + merged) is zero
 */
export function computePrRejectRate(logLines, now) {
  const cutoff = now.getTime() - 28 * 24 * 60 * 60 * 1000;

  // Dedupe by pr+sha, keeping the latest entry per pair
  /** @type {Record<string, {action: string}>} */
  const entries = {};

  for (const line of logLines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry || typeof entry.ts !== 'string' || entry.pr == null || !entry.sha || !entry.action) continue;

    const ts = new Date(entry.ts).getTime();
    if (isNaN(ts) || ts < cutoff) continue;

    const key = `${entry.pr}|${entry.sha}`;
    entries[key] = { action: entry.action };
  }

  let rejected = 0;
  let merged = 0;

  for (const key of Object.keys(entries)) {
    const { action } = entries[key];
    if (action === 'gate-failed' || action === 'llm-rejected') {
      rejected++;
    } else if (action === 'merged') {
      merged++;
    }
  }

  const denominator = rejected + merged;
  return {
    rate: denominator > 0 ? rejected / denominator : null,
    rejected,
    merged,
  };
}

/**
 * Pure function: map maturation level to its PR reject rate target.
 *
 * @param {number} level - maturation level (0-6)
 * @returns {number|null} target reject rate (0-1), or null for unknown levels
 */
export function prRejectTarget(level) {
  if (level === 0 || level === 1) return 0.30;
  if (level === 2 || level === 3) return 0.10;
  if (level === 4) return 0.01;
  if (level === 5 || level === 6) return 0.001;
  return null;
}

async function main() {
  console.log('═'.repeat(50));
  console.log('  Weekly Review — ' + new Date().toISOString().split('T')[0]);
  console.log('═'.repeat(50));

  analyzePatterns();
  consolidateMemories();
  taskSummary();
  computeMaturationMetrics();

  // Capability Usage Trends (5.2)
  try {
    const { generateCapabilityReport } = await import('../capability-monitor.mjs');
    const report = await generateCapabilityReport();
    if (report && report.rows && report.rows.length > 0) {
      console.log('\n📋 Capability Usage Trends');
      console.log('─'.repeat(40));
      console.log('  Agent          | Capability       | Usage Rate');
      console.log('  ' + '─'.repeat(50));
      for (const row of report.rows) {
        const agent = (row.agent || '').padEnd(14);
        const cap = (row.capability || '').padEnd(16);
        const rate = typeof row.usageRate === 'number' ? `${Math.round(row.usageRate * 100)}%` : 'n/a';
        console.log(`  ${agent} | ${cap} | ${rate}`);
      }
    } else {
      console.log('\n📋 Capability Usage Trends: No data available yet.');
    }
  } catch {
    // capability-monitor not yet installed — skip silently
  }

  // Record cycle history
  {
    const pmDir = resolve(ROOT, 'pm');
    if (!existsSync(pmDir)) mkdirSync(pmDir, { recursive: true });
    const historyPath = resolve(pmDir, 'cycle-history.json');
    let history = [];
    if (existsSync(historyPath)) {
      try { history = JSON.parse(readFileSync(historyPath, 'utf8')); } catch { history = []; }
    }
    const files = existsSync(TASKS_DIR) ? readdirSync(TASKS_DIR).filter(f => f.endsWith('.json')) : [];
    let completed = 0, pending = 0;
    for (const file of files) {
      const task = JSON.parse(readFileSync(resolve(TASKS_DIR, file), 'utf8'));
      if (task.status === 'completed') completed++;
      else if (task.status === 'pending') pending++;
    }
    history.push({
      type: 'weekly-review',
      timestamp: new Date().toISOString(),
      success: true,
      stats: { completed, pending, agentsConsolidated: AGENTS.length },
    });
    writeFileSync(historyPath, JSON.stringify(history, null, 2));
  }

  // Capacity forecast — upsert dashboard section (CV-REQ-017 / CV-122)
  {
    const pendingTasks = [];
    if (existsSync(TASKS_DIR)) {
      for (const file of readdirSync(TASKS_DIR).filter(f => f.endsWith('.json'))) {
        try {
          const t = JSON.parse(readFileSync(resolve(TASKS_DIR, file), 'utf8'));
          if (t.status === 'pending') pendingTasks.push(t);
        } catch { /* skip malformed task files */ }
      }
    }
    // Derive daily budget from all agents' dailyTokens
    let dailyBudget = 0;
    for (const agentCfg of Object.values(config.agentConfigs)) {
      if (typeof agentCfg.dailyTokens === 'number') {
        dailyBudget += agentCfg.dailyTokens;
      }
    }
    const forecast = capacityForecast(pendingTasks, dailyBudget > 0 ? dailyBudget : null);
    upsertDashboardSection('Capacity forecast', `Backlog drains in ${forecast}.`, config.dashboardPath);
  }

  // Grooming report — upsert dashboard section (CV-REQ-018 / CV-123)
  {
    const allTasks = [];
    if (existsSync(TASKS_DIR)) {
      for (const file of readdirSync(TASKS_DIR).filter(f => f.endsWith('.json'))) {
        try {
          allTasks.push(JSON.parse(readFileSync(resolve(TASKS_DIR, file), 'utf8')));
        } catch { /* skip malformed task files */ }
      }
    }
    const report = groomingReport(allTasks);
    const parts = [];
    parts.push('Missing estimatedTokens:');
    parts.push(report.missingEstimatedTokens.length > 0 ? report.missingEstimatedTokens.map(id => `- ${id}`).join('\n') : 'none');
    parts.push('');
    parts.push('Missing acceptance_criteria:');
    parts.push(report.missingAcceptanceCriteria.length > 0 ? report.missingAcceptanceCriteria.map(id => `- ${id}`).join('\n') : 'none');
    parts.push('');
    parts.push('Missing priority:');
    parts.push(report.missingPriority.length > 0 ? report.missingPriority.map(id => `- ${id}`).join('\n') : 'none');
    parts.push('');
    parts.push('Unclaimed over 30 days:');
    parts.push(report.unclaimedOver30Days.length > 0 ? report.unclaimedOver30Days.map(id => `- ${id}`).join('\n') : 'none');
    upsertDashboardSection('Grooming', parts.join('\n'), config.dashboardPath);
  }

  // PR reject rate vs maturity target (CV-REQ-019 / CV-124)
  {
    const logPath = resolve(ROOT, 'pm', 'pr-auto-review.log');
    if (existsSync(logPath)) {
      const lines = readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
      const rateResult = computePrRejectRate(lines, new Date());

      // Derive framework maturity level as the max level across all agents
      let frameworkLevel = 0;
      for (const agent of AGENTS) {
        const corePath = resolve(AGENTS_DIR, agent, 'memory/core.json');
        if (existsSync(corePath)) {
          try {
            const core = JSON.parse(readFileSync(corePath, 'utf8'));
            const lvl = core.maturation?.level;
            if (typeof lvl === 'number' && lvl > frameworkLevel) {
              frameworkLevel = lvl;
            }
          } catch { /* skip malformed core */ }
        }
      }
      const target = prRejectTarget(frameworkLevel);
      const rateStr = rateResult.rate !== null ? `${(rateResult.rate * 100).toFixed(1)}%` : 'n/a';
      const targetStr = target !== null ? `${(target * 100).toFixed(1)}%` : 'n/a';

      console.log('\n🔬 PR Reject Rate vs Maturity Target');
      console.log('─'.repeat(40));
      console.log(`  Rate:   ${rateStr} (${rateResult.rejected} rejected / ${rateResult.merged + rateResult.rejected} total)`);
      console.log(`  Target: ${targetStr} (level ${frameworkLevel})`);
    }
  }

  // Run weekly review steps after all existing sections
  console.log('\n🔄 Weekly Review Steps');
  console.log('═'.repeat(50));
  const stepResults = runWeeklySteps(buildWeeklySteps());
  const passed = stepResults.filter(r => r.ok).length;
  const failed = stepResults.length - passed;
  console.log(`\n  Results: ${passed} passed, ${failed} failed`);

  console.log('\n' + '═'.repeat(50));
  console.log('  Weekly review complete.');
  console.log('═'.repeat(50));
}

// --- CLI ---
const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;

if (__isMainModule) {
  await main();
}
