#!/usr/bin/env node
/**
 * Weekly Review — Pattern review, memory cleanup, checklist update
 *
 * 1. Pattern review: what anti-patterns recurred?
 * 2. Memory cleanup: run REM Sleep consolidation for all agents
 * 3. Checklist update: suggest new items for Richmond's checklist
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const config = loadConfig();
const ROOT = config.projectDir;
const AGENTS_DIR = config.agentsDir;
const REVIEWS_DIR = resolve(AGENTS_DIR, 'richmond/reviews');
const TASKS_DIR = config.tasksDir;

const AGENTS = config.agents;

function analyzePatterns() {
  console.log('\n📊 Pattern Analysis');
  console.log('─'.repeat(40));

  // Analyze Richmond's reviews for recurring issues
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
 *   - reviewSeverity:      { critical, major, minor } counts from Richmond's reviews
 */
function computeMaturationMetrics() {
  console.log('\n🎓 Agent Maturation Metrics');
  console.log('─'.repeat(40));

  // Determine ISO week string, e.g. "2026-W11"
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const weekNum = Math.ceil(((now - jan4) / 86400000 + jan4.getDay() + 1) / 7);
  const isoWeek = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

  // Pre-scan Richmond's reviews for severity counts per author
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

// Main
console.log('═'.repeat(50));
console.log('  Weekly Review — ' + new Date().toISOString().split('T')[0]);
console.log('═'.repeat(50));

analyzePatterns();
consolidateMemories();
taskSummary();
computeMaturationMetrics();

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

console.log('\n' + '═'.repeat(50));
console.log('  Weekly review complete.');
console.log('═'.repeat(50));
