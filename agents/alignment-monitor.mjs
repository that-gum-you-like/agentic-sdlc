#!/usr/bin/env node
/**
 * Alignment Monitor — Unified quality and process alignment checker.
 *
 * Orchestrates existing quality tools into a single alignment report.
 * Detects process drift, suggests prompt adjustments, and maintains
 * a self-improving checklist.
 *
 * Usage:
 *   node ~/agentic-sdlc/agents/alignment-monitor.mjs              # Full check + report
 *   node ~/agentic-sdlc/agents/alignment-monitor.mjs --dry-run     # Check without writing
 *   node ~/agentic-sdlc/agents/alignment-monitor.mjs --report       # Show last report
 *   node ~/agentic-sdlc/agents/alignment-monitor.mjs --checklist    # Show current checklist
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

import { loadConfig } from './load-config.mjs';
import { logCapabilityUsage } from './capability-logger.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const projectDir = config.projectDir;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const reportOnly = args.includes('--report');
const checklistOnly = args.includes('--checklist');

const REPORTS_DIR = resolve(projectDir, 'pm', 'alignment-reports');
const CHECKLIST_PATH = resolve(projectDir, 'pm', 'alignment-checklist.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function runTool(cmd) {
  try {
    return { output: execSync(cmd, { cwd: projectDir, timeout: 30000, encoding: 'utf8' }), success: true };
  } catch (e) {
    return { output: e.stdout || e.message, success: false };
  }
}

function loadChecklist() {
  if (!existsSync(CHECKLIST_PATH)) {
    return { items: [], lastUpdated: null };
  }
  return JSON.parse(readFileSync(CHECKLIST_PATH, 'utf8'));
}

function saveChecklist(checklist) {
  checklist.lastUpdated = new Date().toISOString();
  writeFileSync(CHECKLIST_PATH, JSON.stringify(checklist, null, 2));
}

// ---------------------------------------------------------------------------
// Show last report
// ---------------------------------------------------------------------------

if (reportOnly) {
  ensureDir(REPORTS_DIR);
  const reports = readdirSync(REPORTS_DIR).filter(f => f.endsWith('.md')).sort().reverse();
  if (reports.length === 0) {
    console.log('No alignment reports found. Run without --report to generate one.');
    process.exit(0);
  }
  console.log(readFileSync(resolve(REPORTS_DIR, reports[0]), 'utf8'));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Show checklist
// ---------------------------------------------------------------------------

if (checklistOnly) {
  const checklist = loadChecklist();
  if (checklist.items.length === 0) {
    console.log('Alignment checklist is empty. Run a full check to populate it.');
    process.exit(0);
  }
  console.log(`📋 Alignment Checklist (${checklist.items.length} items, last updated: ${checklist.lastUpdated})\n`);
  for (const item of checklist.items) {
    const effectiveness = item.catchCount > 0 ? ` (caught ${item.catchCount} issues)` : '';
    console.log(`  ${item.active ? '✅' : '⬜'} [${item.category}] ${item.description}${effectiveness}`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Full alignment check
// ---------------------------------------------------------------------------

console.log('🔍 Alignment Monitor — Running full check...\n');

const findings = {
  driftAlerts: [],
  promptSuggestions: [],
  checklistUpdates: [],
  toolResults: {},
  score: 100,
};

// 1. Capability drift check
console.log('  1/5 Capability drift...');
const driftResult = runTool(`node ${resolve(__dirname, 'capability-monitor.mjs')} check`);
findings.toolResults.capabilityDrift = driftResult;
if (!driftResult.success) {
  const driftLines = driftResult.output.split('\n').filter(l => /drift|creep|alert/i.test(l));
  for (const line of driftLines) {
    findings.driftAlerts.push(line.trim());
    findings.score -= 5;
  }
}

// 2. Behavior tests (prompt quality)
console.log('  2/5 Prompt quality...');
const behaviorResult = runTool(`node ${resolve(__dirname, 'test-behavior.mjs')} --dry-run`);
findings.toolResults.behaviorTests = behaviorResult;
const failedBehavior = (behaviorResult.output.match(/❌/g) || []).length;
const passedBehavior = (behaviorResult.output.match(/✅/g) || []).length;
if (failedBehavior > 0) {
  // Extract failed check descriptions
  const failedLines = behaviorResult.output.split('\n').filter(l => l.includes('❌'));
  for (const line of failedLines) {
    const desc = line.replace(/.*❌\s*/, '').trim();
    findings.driftAlerts.push(`Behavior test failed: ${desc}`);
  }
  findings.score -= failedBehavior * 2;
}

// 3. Roadmap health
console.log('  3/5 Roadmap health...');
const gardenResult = runTool(`node ${resolve(__dirname, 'garden-roadmap.mjs')} --status`);
findings.toolResults.roadmapHealth = gardenResult;

// 4. Task queue health
console.log('  4/5 Task queue...');
const queueResult = runTool(`node ${resolve(__dirname, 'queue-drainer.mjs')} status`);
findings.toolResults.queueHealth = queueResult;

// Check for stale claims
if (queueResult.output && /stale|stuck|blocked/i.test(queueResult.output)) {
  findings.driftAlerts.push('Stale or blocked tasks detected in queue');
  findings.score -= 3;
}

// 5. Check planning artifacts exist and comply
console.log('  5/5 Planning artifact compliance...');
const planFiles = ['requirements.md', 'priorities.md', 'roadmap.md', 'parallelization.md'];
const plansDir = resolve(projectDir, 'plans');

if (existsSync(plansDir)) {
  for (const file of planFiles) {
    const filePath = resolve(plansDir, file);
    if (!existsSync(filePath)) continue; // Not required to exist

    const content = readFileSync(filePath, 'utf8');

    if (file === 'requirements.md') {
      // Check REQ-xxx format
      const reqCount = (content.match(/###\s*REQ-\d{3}/g) || []).length;
      if (reqCount === 0 && content.length > 100) {
        findings.driftAlerts.push('plans/requirements.md exists but has no REQ-xxx numbered requirements');
        findings.score -= 5;
        findings.promptSuggestions.push({
          target: 'Requirements Engineer',
          issue: 'Requirements not in REQ-xxx format',
          suggestion: 'Ensure all requirements use ### REQ-NNN: [Name] format with Statement, AC, Dependencies, Complexity, Value fields',
        });
      }

      // Check for acceptance criteria
      const acCount = (content.match(/Acceptance Criteria:/gi) || []).length;
      if (reqCount > 0 && acCount < reqCount) {
        findings.driftAlerts.push(`${reqCount - acCount} requirements missing Acceptance Criteria`);
        findings.score -= 3;
      }
    }

    if (file === 'roadmap.md') {
      // Check for phase structure
      const hasPhases = /##\s*Phase\s*\d/i.test(content);
      const hasDemoSentence = /Demo Sentence/i.test(content);
      if (!hasPhases) {
        findings.driftAlerts.push('plans/roadmap.md has no phase structure');
        findings.score -= 5;
      }
      if (!hasDemoSentence && hasPhases) {
        findings.promptSuggestions.push({
          target: 'Technical Product Manager',
          issue: 'Roadmap phases missing demo sentences',
          suggestion: 'Add "Demo Sentence: Users can [specific capability]" to each phase',
        });
        findings.score -= 2;
      }
    }
  }
}

// 6. Self-improving checklist — check existing items
const checklist = loadChecklist();
for (const item of checklist.items) {
  if (!item.active) continue;

  // Run the check pattern if it's a regex-based check
  if (item.checkPattern && item.checkPath) {
    const checkPath = resolve(projectDir, item.checkPath);
    if (existsSync(checkPath)) {
      const content = readFileSync(checkPath, 'utf8');
      const regex = new RegExp(item.checkPattern, item.checkFlags || 'i');
      if (regex.test(content)) {
        item.catchCount = (item.catchCount || 0) + 1;
        findings.driftAlerts.push(`Checklist item caught: ${item.description}`);
        findings.score -= 2;
      }
    }
  }
}

// Clamp score
findings.score = Math.max(0, Math.min(100, findings.score));

// ---------------------------------------------------------------------------
// Generate report
// ---------------------------------------------------------------------------

let report = `# Alignment Report — ${today()}\n\n`;
report += `## Overall Score: ${findings.score}/100\n\n`;

if (findings.driftAlerts.length > 0) {
  report += `## Drift Alerts (${findings.driftAlerts.length})\n\n`;
  for (const alert of findings.driftAlerts) {
    report += `- ${alert}\n`;
  }
  report += '\n';
} else {
  report += '## Drift Alerts\n\nNone detected. All agents aligned.\n\n';
}

if (findings.promptSuggestions.length > 0) {
  report += `## Prompt Adjustment Suggestions (${findings.promptSuggestions.length})\n\n`;
  for (const sug of findings.promptSuggestions) {
    report += `### ${sug.target}\n`;
    report += `**Issue:** ${sug.issue}\n`;
    report += `**Suggested:** ${sug.suggestion}\n\n`;
  }
} else {
  report += '## Prompt Adjustment Suggestions\n\nNo adjustments needed.\n\n';
}

report += `## Tool Results Summary\n\n`;
report += `| Tool | Status |\n|------|--------|\n`;
report += `| Capability drift | ${findings.toolResults.capabilityDrift?.success ? 'Clean' : 'Issues found'} |\n`;
report += `| Behavior tests | ${passedBehavior} passed, ${failedBehavior} failed |\n`;
report += `| Roadmap health | ${findings.toolResults.roadmapHealth?.success ? 'OK' : 'Check needed'} |\n`;
report += `| Task queue | ${findings.toolResults.queueHealth?.success ? 'OK' : 'Issues'} |\n`;
report += `| Planning artifacts | Checked |\n\n`;

report += `## Checklist (${checklist.items.length} items)\n\n`;
const activeItems = checklist.items.filter(i => i.active);
if (activeItems.length > 0) {
  for (const item of activeItems) {
    report += `- [${item.category}] ${item.description} (caught ${item.catchCount || 0} issues)\n`;
  }
} else {
  report += 'No custom checklist items yet. Items will be added as patterns are detected.\n';
}

report += `\n---\nGenerated by alignment-monitor.mjs at ${new Date().toISOString()}\n`;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

console.log(`\n${'═'.repeat(50)}`);
console.log(`Alignment Score: ${findings.score}/100`);
console.log(`Drift Alerts: ${findings.driftAlerts.length}`);
console.log(`Prompt Suggestions: ${findings.promptSuggestions.length}`);
console.log(`Checklist Items: ${checklist.items.length}`);
console.log('═'.repeat(50));

if (dryRun) {
  console.log('\n--- Report Preview ---');
  console.log(report);
  console.log('(Dry run — not saved)');
} else {
  ensureDir(REPORTS_DIR);
  const reportPath = resolve(REPORTS_DIR, `alignment-${today()}.md`);
  writeFileSync(reportPath, report);
  console.log(`\n📄 Report saved to pm/alignment-reports/alignment-${today()}.md`);

  // Save updated checklist
  saveChecklist(checklist);

  logCapabilityUsage({
    capability: 'alignmentMonitor',
    agent: 'system',
    taskId: 'alignment-check',
    details: { score: findings.score, alerts: findings.driftAlerts.length, suggestions: findings.promptSuggestions.length },
  });
}
