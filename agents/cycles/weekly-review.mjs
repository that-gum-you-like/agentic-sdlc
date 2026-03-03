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

import { readFileSync, readdirSync, existsSync } from 'fs';
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

// Main
console.log('═'.repeat(50));
console.log('  Weekly Review — ' + new Date().toISOString().split('T')[0]);
console.log('═'.repeat(50));

analyzePatterns();
consolidateMemories();
taskSummary();

console.log('\n' + '═'.repeat(50));
console.log('  Weekly review complete.');
console.log('═'.repeat(50));
