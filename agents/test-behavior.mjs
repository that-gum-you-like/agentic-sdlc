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

// Template & Framework Guide Integrity
console.log('\n📋 Template & Framework Guide Integrity:');
const frameworkDir = resolve(config.frameworkDir || resolve(__dirname, '..', 'framework'));
const templatesDir = resolve(__dirname, '..', 'openspec', 'templates');

// Required templates exist and contain key structural elements
const requiredTemplates = {
  'spec.md.template': [/REQ-\d{3}/, /Statement:/, /Acceptance Criteria:/, /Complexity:/, /Value:/, /WHEN/, /THEN/],
  'roadmap.md.template': [/Phase/, /Demo Sentence:/, /Success Criteria:/, /Handoff/, /Work Stream/, /Dependency Graph/],
  'tasks.md.template': [/Agent:/, /Parallel:/, /Work Stream Summary/, /Complexity:/],
  'braindump.md.template': [/Raw Ideas/, /Features/, /Constraints/, /Target Users/],
  'proposal.md.template': [/Value Analysis/, /Benefits/, /Costs/],
  'design.md.template': [/Goals/, /Non-Goals/, /Components/, /Data Flow/],
};

for (const [template, patterns] of Object.entries(requiredTemplates)) {
  const tPath = resolve(templatesDir, template);
  if (!existsSync(tPath)) {
    check(`${template} exists`, false);
    continue;
  }
  const content = readFileSync(tPath, 'utf8');
  for (const pattern of patterns) {
    check(`${template} contains ${pattern.source}`, pattern.test(content));
  }
}

// Required framework guides exist and contain key concepts
const requiredGuides = {
  'requirements-guide.md': [/REQ-\d{3}/, /Actor/, /Action/, /Condition/, /Constraint/, /Acceptance Criteria/, /Anti-Pattern/, /Granularity/],
  'parallelization-guide.md': [/Dependency Graph/, /Interface Contract/, /Work Stream/, /Critical Path/, /Decision Matrix/],
  'agent-lifecycle.md': [/Create/, /Specialize/, /Terminate/, /CTO/, /Never One More Thing/, /Roadmap Discipline/],
};

for (const [guide, patterns] of Object.entries(requiredGuides)) {
  const gPath = resolve(frameworkDir, guide);
  if (!existsSync(gPath)) {
    check(`framework/${guide} exists`, false);
    continue;
  }
  const content = readFileSync(gPath, 'utf8');
  for (const pattern of patterns) {
    check(`framework/${guide} contains ${pattern.source}`, pattern.test(content));
  }
}

// Planning Agent Templates
console.log('\n📋 Planning Agent Templates:');
const planningDir = resolve(__dirname, 'templates', 'planning-agents');
const planningTemplates = {
  'requirements-engineer.md': [/Requirements Engineer/, /REQ-\d{3}/, /Five Components/, /Actor/, /Acceptance Criteria/, /Quality Checklist/, /Anti-Pattern/, /Granularity/],
  'value-analyst.md': [/Business Value Analyst/, /Business Value.*1-10/, /Complexity.*1-10/, /Priority Matrix/, /Cost of Not Building/, /Features to Cut/],
  'product-manager.md': [/Technical Product Manager/, /Phase/, /Demo Sentence/, /Success Criteria/, /Handoff/, /Never One More Thing/, /Scope Control/],
  'parallelization-analyst.md': [/Parallelization Analyst/, /Dependency Graph/, /Interface Contract/, /Critical Path/, /Work Stream/, /Decision Matrix/, /Bottleneck/],
};

for (const [template, patterns] of Object.entries(planningTemplates)) {
  const tPath = resolve(planningDir, template);
  if (!existsSync(tPath)) {
    check(`planning-agents/${template} exists`, false);
    continue;
  }
  const content = readFileSync(tPath, 'utf8');
  for (const pattern of patterns) {
    check(`planning-agents/${template} contains ${pattern.source}`, pattern.test(content));
  }
}

// Quality Alignment Monitor
console.log('\n📋 Quality Alignment Monitor:');
const qaPath = resolve(planningDir, 'quality-alignment.md');
if (!existsSync(qaPath)) {
  check('planning-agents/quality-alignment.md exists', false);
} else {
  const qaContent = readFileSync(qaPath, 'utf8');
  check('quality-alignment.md contains Quality Alignment Monitor', /Quality Alignment Monitor/.test(qaContent));
  check('quality-alignment.md contains Process Monitoring', /Process Monitoring/.test(qaContent));
  check('quality-alignment.md contains Alignment Detection', /Alignment Detection/.test(qaContent));
  check('quality-alignment.md contains Prompt Adjustment', /Prompt Adjustment/.test(qaContent));
  check('quality-alignment.md contains Self-Improving Checklist', /Self-Improving Checklist/.test(qaContent));
  check('quality-alignment.md contains Scheduling', /Scheduling|cron/.test(qaContent));
}
const alignMonPath = resolve(__dirname, 'alignment-monitor.mjs');
check('alignment-monitor.mjs exists', existsSync(alignMonPath));

// CLAUDE.md references new artifacts
console.log('\n📋 CLAUDE.md — New Artifact References:');
const claudeMdPath = resolve(__dirname, '..', 'CLAUDE.md');
const claudeMd = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf8') : '';
check('CLAUDE.md references REQ-xxx format', /REQ-xxx|REQ-\d{3}/i.test(claudeMd));
check('CLAUDE.md references roadmap template', /roadmap\.md\.template|roadmap/i.test(claudeMd));
check('CLAUDE.md references braindump template', /braindump/i.test(claudeMd));
check('CLAUDE.md references requirements guide', /requirements-guide/i.test(claudeMd));
check('CLAUDE.md references parallelization guide', /parallelization-guide/i.test(claudeMd));
check('CLAUDE.md references agent lifecycle guide', /agent-lifecycle/i.test(claudeMd));
check('CLAUDE.md has roadmap discipline section', /Roadmap Discipline/i.test(claudeMd));
check('CLAUDE.md has "never one more thing" rule', /never.*one.*more.*thing|scope.*creep/i.test(claudeMd));
check('CLAUDE.md references planning agents', /Planning Agents|Requirements Engineer|Value Analyst|Product Manager|Parallelization Analyst/i.test(claudeMd));
check('CLAUDE.md documents planning pipeline', /Brain dump.*Requirements.*Priorities.*Roadmap.*Parallelization/i.test(claudeMd));
check('CLAUDE.md documents plans/ directory', /plans\/.*directory|plans\/requirements|plans\/roadmap/i.test(claudeMd));
check('CLAUDE.md documents autonomous launcher', /autonomous-launcher/i.test(claudeMd));
check('CLAUDE.md documents dev log convention', /devlog|dev log/i.test(claudeMd));
check('CLAUDE.md documents roadmap gardening', /garden-roadmap|roadmap garden/i.test(claudeMd));
check('CLAUDE.md documents prompt playbook', /prompt-playbook|prompt playbook/i.test(claudeMd));
check('CLAUDE.md documents agent routing', /agent-routing|agent routing/i.test(claudeMd));
check('CLAUDE.md documents alignment monitor', /alignment-monitor|alignment monitor/i.test(claudeMd));

// Framework production docs
console.log('\n📋 Production Workflow Docs:');
const requiredProductionDocs = {
  'prompt-playbook.md': [/Planning Phase/, /Execution Phase/, /Autonomous Operation/, /Anti-Pattern/],
  'agent-routing.md': [/Planning Phase Agents/, /Execution Phase Agents/, /Trigger Condition/, /Decision Flowchart/],
};
for (const [doc, patterns] of Object.entries(requiredProductionDocs)) {
  const dPath = resolve(frameworkDir, doc);
  if (!existsSync(dPath)) {
    check(`framework/${doc} exists`, false);
    continue;
  }
  const content = readFileSync(dPath, 'utf8');
  for (const pattern of patterns) {
    check(`framework/${doc} contains ${pattern.source}`, pattern.test(content));
  }
}

// Autonomous launcher
const launcherPath = resolve(__dirname, 'autonomous-launcher.sh');
check('autonomous-launcher.sh exists', existsSync(launcherPath));

// Garden roadmap
const gardenPath = resolve(__dirname, 'garden-roadmap.mjs');
check('garden-roadmap.mjs exists', existsSync(gardenPath));

// Maturation regression check
// Fails if an agent's correction rate increased for 2+ consecutive weeks
// after 2+ consecutive weeks of decline (regression after improvement).
console.log('\n📋 All Agents — Maturation Regression:');
for (const agent of AGENTS) {
  const core = readCoreJson(agent);
  const metrics = core.maturation?.metrics;
  if (!metrics) {
    // No metrics yet — skip (not a regression)
    check(`${agent} maturation: no regression detected`, true);
    continue;
  }

  const weeks = Object.keys(metrics).sort();
  if (weeks.length < 4) {
    // Not enough data to detect decline-then-spike
    check(`${agent} maturation: insufficient data for regression check`, true);
    continue;
  }

  // Look for a pattern of 2+ declining weeks followed by 2+ increasing weeks
  const rates = weeks.map(w => metrics[w].correctionsReceived || 0);
  let regressionFound = false;

  for (let i = 0; i <= rates.length - 4; i++) {
    const declineStreak = rates[i] > rates[i + 1] && rates[i + 1] > rates[i + 2];
    const spikeStreak = rates[i + 2] < rates[i + 3];
    if (declineStreak && spikeStreak) {
      regressionFound = true;
      break;
    }
  }

  check(
    `${agent} maturation: no regression after improvement (${weeks.length} weeks of data)`,
    !regressionFound
  );
}

// Model Manager Prompt Quality (if model-manager agent exists)
const mmAgentMd = resolve(AGENTS_DIR, 'model-manager', 'AGENT.md');
if (existsSync(mmAgentMd)) {
  console.log('\n📋 Model Manager — Prompt Quality:');
  const mmMd = readFileSync(mmAgentMd, 'utf8');
  check('model-manager: defines token monitoring domain', /token.*budget|budget.*monitor|utilization/i.test(mmMd));
  check('model-manager: prohibits code execution', /NOT.*write code|NOT.*execute task|NOT.*code change|does not write code/i.test(mmMd));
  check('model-manager: mentions performance ledger', /performance.*ledger|model-performance/i.test(mmMd));
  check('model-manager: mentions fallback chain', /fallback/i.test(mmMd));
  check('model-manager: mentions daily reset', /daily.*reset|reset.*daily/i.test(mmMd));
  check('model-manager: mentions notifications', /notif/i.test(mmMd));
}

// Adapter layer existence checks
console.log('\n📋 Adapter Layer:');
check('load-adapter.mjs exists', existsSync(resolve(__dirname, 'adapters', 'load-adapter.mjs')));
check('file-based orchestration adapter exists', existsSync(resolve(__dirname, 'adapters', 'orchestration', 'file-based.mjs')));
check('anthropic LLM adapter exists', existsSync(resolve(__dirname, 'adapters', 'llm', 'anthropic.mjs')));
check('CLAUDE.md documents adapter configuration', /Adapter Configuration/i.test(claudeMd));
check('CLAUDE.md documents model-manager', /model-manager/i.test(claudeMd));

// Summary
console.log(`\n${'═'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0 && !dryRun) {
  process.exit(1);
}
