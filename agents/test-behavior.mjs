#!/usr/bin/env node
/**
 * Agent Behavior Tests — Validate agent prompt quality and memory completeness.
 *
 * Checks that AGENT.md files and core memories contain required instructions
 * for known scenarios. Catches prompt regressions when agent prompts are modified.
 *
 * Usage:
 *   node agents/test-behavior.mjs            # Run all checks (exit 1 on failure)
 *   node agents/test-behavior.mjs --dry-run  # Report results without failing
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from './load-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = loadConfig();
const AGENTS = config.agents;
const AGENTS_DIR = config.agentsDir;
const dryRun = process.argv.includes('--dry-run');

let passed = 0;
let failed = 0;

function check(description, condition) {
  if (condition) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.log(`  ❌ ${description}`);
    failed++;
  }
}

function readAgentMd(agent) {
  const path = resolve(AGENTS_DIR, agent, 'AGENT.md');
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

function readCoreJson(agent) {
  const path = resolve(AGENTS_DIR, agent, 'memory', 'core.json');
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readChecklist() {
  // Search for checklist in any agent directory that has one
  for (const agent of AGENTS) {
    const path = resolve(AGENTS_DIR, agent, 'checklist.md');
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  return '';
}

// Tests
console.log('🧪 Agent Behavior Tests');
console.log('═'.repeat(50));

// Roy-specific checks
console.log('\n📋 Roy (Backend):');
const royMd = readAgentMd('roy');
check('AGENT.md mentions { data, error } pattern', /\{\s*data.*error\s*\}|data,\s*error/.test(royMd));
check('AGENT.md mentions small file limits', /\b150\s*lines|small files|exceeds.*150/i.test(royMd));
check('AGENT.md mentions memory read instructions', /memory|recall|read.*memory/i.test(royMd));

// Moss-specific checks
console.log('\n📋 Moss (AI Pipeline):');
const mossMd = readAgentMd('moss');
check('AGENT.md mentions token limits or context window', /token|context.*window|limit/i.test(mossMd));
check('AGENT.md mentions memory read instructions', /memory|recall|read.*memory/i.test(mossMd));

// Jen-specific checks
console.log('\n📋 Jen (Frontend):');
const jenMd = readAgentMd('jen');
check('AGENT.md mentions loading/error states', /loading.*state|error.*state|loading.*error/i.test(jenMd));
check('AGENT.md mentions accessibility', /accessibility|a11y|accessible/i.test(jenMd));
check('AGENT.md mentions memory read instructions', /memory|recall|read.*memory/i.test(jenMd));

// All agents: version headers
console.log('\n📋 All Agents — Version Headers:');
for (const agent of AGENTS) {
  const md = readAgentMd(agent);
  check(`${agent} has version header`, /<!--\s*version:/.test(md));
}

// All agents: failure memories
console.log('\n📋 All Agents — Failure Memories:');
for (const agent of AGENTS) {
  const core = readCoreJson(agent);
  check(`${agent} has at least 1 failure memory`, (core.failures?.length || 0) >= 1);
}

// All agents: memory read instructions
console.log('\n📋 All Agents — Memory Protocol:');
for (const agent of AGENTS) {
  const md = readAgentMd(agent);
  check(`${agent} AGENT.md mentions memory protocol`, /memory|recall|core\.json/i.test(md));
}

// Handoff template: agents that submit to #reviews must reference handoff-template.md
console.log('\n📋 Handoff Template Reference:');
const REVIEW_SUBMITTERS = ['roy', 'moss', 'jen', 'douglas'];
for (const agent of REVIEW_SUBMITTERS) {
  const md = readAgentMd(agent);
  const mentionsReviews = /#reviews/i.test(md);
  const mentionsHandoffTemplate = /handoff-template\.md/i.test(md);
  check(
    `${agent} references handoff-template.md (submits to #reviews)`,
    mentionsReviews && mentionsHandoffTemplate
  );
}

// Richmond checklist coverage
console.log('\n📋 Richmond Checklist Coverage:');
const checklist = readChecklist();
check('Checklist mentions any types', /\bany\b.*type|no.*\bany\b/i.test(checklist));
check('Checklist mentions console.log', /console\.log/i.test(checklist));
check('Checklist mentions file size', /\b150\b.*line|\b200\b.*line|file\s*size/i.test(checklist));
check('Checklist mentions { data, error }', /data.*error|return.*pattern/i.test(checklist));

// Summary
console.log(`\n${'═'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0 && !dryRun) {
  process.exit(1);
}
