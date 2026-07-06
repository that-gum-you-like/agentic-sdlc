#!/usr/bin/env node
/**
 * Agent Behavior Tests — Validate agent prompt quality and memory completeness.
 *
 * Checks that AGENT.md files and core memories contain required instructions
 * for known scenarios. Catches prompt regressions when agent prompts are modified.
 *
 * Also maintains per-agent BEHAVIOR BASELINES (deterministic metrics computed
 * from AGENT.md + core memory) and detects DRIFT: after a prompt change, any
 * metric moving more than 20% from its recorded baseline raises an alert —
 * the curriculum's "behavior testing + baselines + drift detection" loop.
 *
 * Usage:
 *   node agents/test-behavior.mjs             # Run all checks (exit 1 on failure)
 *   node agents/test-behavior.mjs --dry-run   # Report results without failing
 *   node agents/test-behavior.mjs --baseline  # Record current per-agent metrics as the baseline
 *   node agents/test-behavior.mjs --drift     # Compare current metrics vs baseline (exit 1 on >20% drift)
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from './load-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = loadConfig();
const AGENTS = config.agents;
const AGENTS_DIR = config.agentsDir;
const dryRun = process.argv.includes('--dry-run');
const frameworkOnly = process.argv.includes('--framework');
const projectOnly = process.argv.includes('--project');

const claudeMdPath = resolve(__dirname, '..', 'CLAUDE.md');
const claudeMd = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf8') : '';

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

// ---------------------------------------------------------------------------
// Behavior baselines + drift detection (curriculum Phase 7)
// ---------------------------------------------------------------------------
//
// Deterministic per-agent metrics from AGENT.md + core.json. No LLM involved —
// these are the countable signals whose movement flags a behavioral shift when
// a prompt is edited. Threshold: >20% relative change vs the recorded baseline.

const BASELINES_PATH = resolve(config.projectDir, 'pm', 'behavior-baselines.json');
const DRIFT_THRESHOLD = 0.20;

// Words signalling discipline vs overconfidence — counted per 100 lines.
const CAUTION_RE = /\b(never|must not|mustn't|do not|don't|always|required|forbidden|block(?:ed|s)?|verify|before committing)\b/gi;
const OPTIMISM_RE = /\b(easy|easily|simply|just|obviously|quick(?:ly)?|trivial(?:ly)?|straightforward)\b/gi;

function computeAgentMetrics(agent) {
  const md = readAgentMd(agent);
  const core = readCoreJson(agent);
  const lines = md ? md.split('\n').length : 0;
  const per100 = (n) => lines > 0 ? Math.round((n / lines) * 100 * 100) / 100 : 0;
  const versionMatch = md.match(/<!--\s*version:\s*([\d.]+)/);
  return {
    prompt_lines: lines,
    rule_count: (md.match(/^\s*[-*]\s+/gm) || []).length,
    caution_score: per100((md.match(CAUTION_RE) || []).length),
    optimism_score: per100((md.match(OPTIMISM_RE) || []).length),
    failure_memory_count: core.failures?.length || 0,
    _version: versionMatch ? versionMatch[1] : 'unversioned', // metadata, not drift-checked
  };
}

function loadBaselines() {
  if (!existsSync(BASELINES_PATH)) return null;
  try { return JSON.parse(readFileSync(BASELINES_PATH, 'utf8')); } catch { return null; }
}

function recordBaselines() {
  const baselines = { recordedAt: new Date().toISOString(), threshold: DRIFT_THRESHOLD, agents: {} };
  for (const agent of AGENTS) {
    if (!readAgentMd(agent)) continue;
    baselines.agents[agent] = computeAgentMetrics(agent);
  }
  mkdirSync(dirname(BASELINES_PATH), { recursive: true });
  writeFileSync(BASELINES_PATH, JSON.stringify(baselines, null, 2) + '\n');
  console.log(`📏 Behavior baselines recorded for ${Object.keys(baselines.agents).length} agent(s) → ${BASELINES_PATH}`);
  return baselines;
}

/**
 * Compare current metrics vs baseline. A metric drifts when it moves more
 * than DRIFT_THRESHOLD relative to baseline (or appears/disappears outright).
 * @returns {Array<{agent, metric, baseline, current, changePct}>}
 */
function detectBehaviorDrift(baselines) {
  const alerts = [];
  for (const [agent, base] of Object.entries(baselines.agents || {})) {
    if (!readAgentMd(agent)) continue; // agent removed — versioning handles that
    const cur = computeAgentMetrics(agent);
    for (const [metric, baseVal] of Object.entries(base)) {
      if (metric.startsWith('_')) continue; // metadata
      const curVal = cur[metric] ?? 0;
      let drifted = false;
      let changePct = 0;
      if (baseVal > 0) {
        changePct = Math.round(((curVal - baseVal) / baseVal) * 1000) / 10;
        drifted = Math.abs(curVal - baseVal) / baseVal > DRIFT_THRESHOLD;
      } else if (curVal > 0) {
        changePct = 100;
        drifted = curVal >= 3; // metric appeared from zero — alert on a real amount, not noise
      }
      if (drifted) alerts.push({ agent, metric, baseline: baseVal, current: curVal, changePct });
    }
  }
  return alerts;
}

function runDriftCheck() {
  const baselines = loadBaselines();
  if (!baselines) {
    console.log('📏 No behavior baseline recorded yet — run: node agents/test-behavior.mjs --baseline');
    return { alerts: [], hadBaseline: false };
  }
  const alerts = detectBehaviorDrift(baselines);
  if (alerts.length === 0) {
    console.log(`📏 Behavior drift: none (all agent metrics within ±${DRIFT_THRESHOLD * 100}% of the ${baselines.recordedAt} baseline)`);
  } else {
    console.log(`\n⚠️  BEHAVIOR DRIFT — ${alerts.length} metric(s) moved >${DRIFT_THRESHOLD * 100}% since the ${baselines.recordedAt} baseline:`);
    for (const a of alerts) {
      console.log(`  ${a.agent}.${a.metric}: ${a.baseline} → ${a.current} (${a.changePct > 0 ? '+' : ''}${a.changePct}%)`);
    }
    console.log('  If intentional (prompt evolution), re-record: node agents/test-behavior.mjs --baseline');
  }
  return { alerts, hadBaseline: true };
}

// --- Baseline/drift CLI modes run INSTEAD of the check suite ---
if (process.argv.includes('--baseline')) {
  recordBaselines();
  process.exit(0);
}
if (process.argv.includes('--drift')) {
  const { alerts } = runDriftCheck();
  process.exit(alerts.length > 0 && !dryRun ? 1 : 0);
}

// Resolve a framework persona (LinguaFlow's IT-Crowd names) to THIS project's
// actual agent — by persona name if present, else by the generic role name —
// so behavior tests are portable across projects that don't use the personas.
// Returns null when the project has no agent for that role (the check is skipped,
// not failed). Backward-compatible: when roy/moss/jen/douglas exist, returns them.
const PERSONA_CANDIDATES = {
  roy: ['roy', 'backend'],
  moss: ['moss', 'ai', 'ai-engineer'],
  jen: ['jen', 'frontend'],
  richmond: ['richmond', 'reviewer'],
  douglas: ['douglas', 'documentarian', 'docs'],
};
function resolveAgent(persona) {
  for (const cand of (PERSONA_CANDIDATES[persona] || [persona])) {
    if (AGENTS.includes(cand) || existsSync(resolve(AGENTS_DIR, cand, 'AGENT.md'))) return cand;
  }
  return null;
}
function checkAgentContent(persona, description, predicate) {
  const a = resolveAgent(persona);
  if (!a) { console.log(`  ⏭️  ${description} (no ${persona}-role agent in this project — skipped)`); return; }
  check(description, predicate(readAgentMd(a)));
}

// Tests
console.log('🧪 Agent Behavior Tests');
if (frameworkOnly) console.log('  Mode: --framework (framework tests only)');
if (projectOnly) console.log('  Mode: --project (project tests only)');
console.log('═'.repeat(50));

// ---------------------------------------------------------------------------
// Project-specific tests (agent content, domain patterns, memory content)
// ---------------------------------------------------------------------------

if (!frameworkOnly) {

// Backend-role checks (persona: roy)
console.log('\n📋 Backend-role agent (roy):');
checkAgentContent('roy', 'AGENT.md mentions { data, error } pattern', md => /\{\s*data.*error\s*\}|data,\s*error/.test(md));
checkAgentContent('roy', 'AGENT.md mentions small file limits', md => /\b150\s*lines|small files|exceeds.*150/i.test(md));
checkAgentContent('roy', 'AGENT.md mentions memory read instructions', md => /memory|recall|read.*memory/i.test(md));

// AI-role checks (persona: moss)
console.log('\n📋 AI-role agent (moss):');
checkAgentContent('moss', 'AGENT.md mentions token limits or context window', md => /token|context.*window|limit/i.test(md));
checkAgentContent('moss', 'AGENT.md mentions memory read instructions', md => /memory|recall|read.*memory/i.test(md));

// Frontend-role checks (persona: jen)
console.log('\n📋 Frontend-role agent (jen):');
checkAgentContent('jen', 'AGENT.md mentions loading/error states', md => /loading.*state|error.*state|loading.*error/i.test(md));
checkAgentContent('jen', 'AGENT.md mentions accessibility', md => /accessibility|a11y|accessible/i.test(md));
checkAgentContent('jen', 'AGENT.md mentions memory read instructions', md => /memory|recall|read.*memory/i.test(md));

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
for (const persona of REVIEW_SUBMITTERS) {
  const agent = resolveAgent(persona);
  if (!agent) { console.log(`  ⏭️  ${persona} references handoff-template.md (no ${persona}-role agent here — skipped)`); continue; }
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

} // end !frameworkOnly

// ---------------------------------------------------------------------------
// Framework tests (template quality, scripts, CLAUDE.md, adapters)
// ---------------------------------------------------------------------------

if (!projectOnly) {

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

} // end !projectOnly (framework tests)

// ---------------------------------------------------------------------------
// Project-specific tests (continued): maturation, model-manager
// ---------------------------------------------------------------------------

if (!frameworkOnly) {

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

} // end !frameworkOnly (project tests, continued)

// ---------------------------------------------------------------------------
// Framework tests (continued): execution templates, adapter layer
// ---------------------------------------------------------------------------

if (!projectOnly) {

// Execution Agent Templates — verify all 15 exist with valid frontmatter
console.log('\n📋 Execution Agent Templates:');
const execDir = resolve(__dirname, 'templates', 'execution-agents');
const expectedTemplates = [
  'cto-orchestrator', 'code-reviewer', 'release-manager', 'backend-developer',
  'frontend-developer', 'ai-engineer', 'documentarian', 'security-engineer',
  'qa-engineer', 'integration-tester', 'ethics-advisor', 'architect',
  'dependency-auditor', 'performance-sentinel', 'research-agent',
  'platform-maturity-sentinel',
];
for (const tmpl of expectedTemplates) {
  const tmplPath = resolve(execDir, `${tmpl}.md`);
  const tmplExists = existsSync(tmplPath);
  check(`${tmpl}.md exists`, tmplExists);
  if (tmplExists) {
    const content = readFileSync(tmplPath, 'utf8');
    check(`${tmpl}.md has YAML frontmatter`, content.startsWith('---'));
    check(`${tmpl}.md defines role_keywords`, /role_keywords:/.test(content));
  }
}
// CTO is a replacement template, all others are addenda
const ctoContent = existsSync(resolve(execDir, 'cto-orchestrator.md'))
  ? readFileSync(resolve(execDir, 'cto-orchestrator.md'), 'utf8') : '';
check('cto-orchestrator is replacement type', /template_type:\s*"?replacement/i.test(ctoContent));
const backendContent = existsSync(resolve(execDir, 'backend-developer.md'))
  ? readFileSync(resolve(execDir, 'backend-developer.md'), 'utf8') : '';
check('backend-developer is addendum type', /template_type:\s*"?addendum/i.test(backendContent));
check('CLAUDE.md documents execution agent templates', /Execution Agent Templates/i.test(claudeMd));

// Adapter layer existence checks
console.log('\n📋 Adapter Layer:');
check('load-adapter.mjs exists', existsSync(resolve(__dirname, 'adapters', 'load-adapter.mjs')));
check('file-based orchestration adapter exists', existsSync(resolve(__dirname, 'adapters', 'orchestration', 'file-based.mjs')));
check('anthropic LLM adapter exists', existsSync(resolve(__dirname, 'adapters', 'llm', 'anthropic.mjs')));
check('CLAUDE.md documents adapter configuration', /Adapter Configuration/i.test(claudeMd));
check('CLAUDE.md documents model-manager', /model-manager/i.test(claudeMd));

} // end !projectOnly (framework tests, continued)

// ---------------------------------------------------------------------------
// Behavior drift vs recorded baseline (project mode; curriculum Phase 7)
// ---------------------------------------------------------------------------

if (!frameworkOnly) {
  console.log('\n📋 Behavior Baselines & Drift:');
  const baselines = loadBaselines();
  if (!baselines) {
    console.log('  ⏭️  no baseline recorded yet (record one: node agents/test-behavior.mjs --baseline)');
  } else {
    const driftAlerts = detectBehaviorDrift(baselines);
    check(`no agent metric drifted >${DRIFT_THRESHOLD * 100}% vs the ${baselines.recordedAt} baseline`, driftAlerts.length === 0);
    for (const a of driftAlerts) {
      console.log(`     ↳ ${a.agent}.${a.metric}: ${a.baseline} → ${a.current} (${a.changePct > 0 ? '+' : ''}${a.changePct}%)`);
    }
  }
}

// Summary — print FIRST so the result is visible without scrolling
const summaryLine = `Results: ${passed} passed, ${failed} failed`;
console.log(`\n${'═'.repeat(50)}`);
console.log(summaryLine);
if (failed > 0) {
  console.log('\nFailing checks are marked with ❌ above.');
}

if (failed > 0 && !dryRun) {
  process.exit(1);
}
