/**
 * Planning-templates validation — content checks for shared framework docs.
 * Extended by individual tasks as they add or change framework documentation.
 * Spec: openspec/changes/curriculum-v2-conformance/specs/claude-review-lane.md CV-REQ-102
 * Task: OS-curriculum-v2-conformance-111 (CV-510)
 *
 * Helper: read(relPath) reads a repo-root-relative file as UTF-8.
 * New tests go here so one shared test file validates docs content norms.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

function read(relPath) {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

// ── CV-510: RUNBOOK flagged-PR section ────────────────────────────────────

test('RUNBOOK.md references the claude-review-queue path (CV-510)', () => {
  const raw = read('docs/RUNBOOK.md');
  assert.match(raw, /pm\/claude-review-queue\.json/,
    'RUNBOOK must mention the claude review queue file path');
});

test('RUNBOOK.md references the sdlc-review-flagged skill (CV-510)', () => {
  const raw = read('docs/RUNBOOK.md');
  assert.match(raw, /sdlc-review-flagged/,
    'RUNBOOK must reference the sdlc-review-flagged skill');
});

// ── CV-209: AGENT.md.template and prompt-playbook carry Goal safety ──────

test('AGENT.md.template contains a ## Goal Safety section (CV-209)', () => {
  const raw = read('agents/templates/AGENT.md.template');
  assert.match(raw, /## Goal Safety/,
    'AGENT.md.template must have a Goal Safety section');
});

test('framework/prompt-playbook.md contains a ## Goal Safety section (CV-209)', () => {
  const raw = read('framework/prompt-playbook.md');
  assert.match(raw, /## Goal Safety/,
    'prompt-playbook.md must have a Goal Safety section');
});

// ── CV-222: Requirements Rubric in requirements-engineer.md ──────────────

test('requirements-engineer.md contains ## Requirements Rubric heading (CV-222)', () => {
  const raw = read('agents/templates/planning-agents/requirements-engineer.md');
  assert.match(raw, /## Requirements Rubric/,
    'requirements-engineer.md must have a Requirements Rubric section');
});

test('requirements-engineer.md rubric has all five row labels (CV-222)', () => {
  const raw = read('agents/templates/planning-agents/requirements-engineer.md');
  const rubricSection = raw.split(/## Requirements Rubric/)[1]?.split(/## /)[0] || '';
  const rows = ['Purpose / Scope', 'Numeric Business Goals', 'User Stories',
    'Technical Constraints', 'NFRs'];
  for (const row of rows) {
    assert.ok(rubricSection.includes(row),
      `Rubric must contain row label: "${row}"`);
  }
});

test('requirements-engineer.md defines a gap-question loop (CV-222)', () => {
  const raw = read('agents/templates/planning-agents/requirements-engineer.md');
  assert.match(raw, /Gap-Question Loop/,
    'requirements-engineer.md must have a Gap-Question Loop subsection');
});

// ── CV-223: braindump.md.template has Business Goals and Technical Constraints ─

test('braindump.md.template contains a ## Business Goals (numeric) heading (CV-223)', () => {
  const raw = read('openspec/templates/braindump.md.template');
  assert.match(raw, /## Business Goals \(numeric\)/,
    'braindump.md.template must have a Business Goals (numeric) section');
});

test('braindump.md.template contains a ## Technical Constraints heading (CV-223)', () => {
  const raw = read('openspec/templates/braindump.md.template');
  assert.match(raw, /## Technical Constraints/,
    'braindump.md.template must have a Technical Constraints section');
});

// ── CV-225: requirements-engineer.md checks persona coverage ──────────────

test('requirements-engineer.md contains a persona coverage check (CV-225)', () => {
  const raw = read('agents/templates/planning-agents/requirements-engineer.md');
  assert.match(raw, /persona coverage/,
    'requirements-engineer.md must have a persona coverage check');
});

// ── CV-224: proposal.md.template has User Stories (by persona) heading ─────

test('proposal.md.template contains a User Stories (by persona) heading (CV-224)', () => {
  const raw = read('openspec/templates/proposal.md.template');
  assert.match(raw, /## User Stories \(by persona\)/,
    'proposal.md.template must have a User Stories (by persona) heading');
});

test('proposal.md.template has rows for all five personas (CV-224)', () => {
  const raw = read('openspec/templates/proposal.md.template');
  const personas = ['New', 'Regular', 'Power', 'Admin', 'Payer'];
  for (const persona of personas) {
    const storyPattern = new RegExp(`\\|\\s*${persona}\\s*\\|`);
    assert.match(raw, storyPattern,
      `proposal.md.template must contain a table row for "${persona}" persona`);
  }
});

// ── CV-226: proposal.md.template Value Analysis has Success Metrics + Who Benefits ─

test('proposal.md.template Value Analysis has Success Metrics and Who Benefits headings (CV-226)', () => {
  const raw = read('openspec/templates/proposal.md.template');
  const valueAnalysis = raw.split(/## Value Analysis/)[1]?.split(/\n## /)[0] || '';
  assert.match(valueAnalysis, /### Success Metrics/,
    'Value Analysis must contain a Success Metrics heading');
  assert.match(valueAnalysis, /### Who Benefits/,
    'Value Analysis must contain a Who Benefits heading');
});

test('proposal.md.template Success Metrics table has metric, baseline, target, how measured (CV-226)', () => {
  const raw = read('openspec/templates/proposal.md.template');
  const valueAnalysis = raw.split(/## Value Analysis/)[1]?.split(/\n## /)[0] || '';
  const metricsSection = valueAnalysis.split(/### Success Metrics/)[1]?.split(/\n### /)[0] || '';
  const columns = ['Metric', 'Baseline', 'Target', 'How Measured'];
  for (const column of columns) {
    assert.match(metricsSection, new RegExp(column),
      `Success Metrics section must contain column: "${column}"`);
  }
});

// ── CV-228: Agent log (coffeetalk) section in SHARED_PROTOCOL.md ──────────

test('SHARED_PROTOCOL.md contains the coffeetalk agent log protocol (CV-228)', () => {
  const raw = read('agents/SHARED_PROTOCOL.md');
  assert.match(raw, /pm\/coffeetalk\.md/,
    'SHARED_PROTOCOL.md must reference pm/coffeetalk.md');
  assert.match(raw, /append-only/,
    'SHARED_PROTOCOL.md must state the log is append-only');
});

test('SHARED_PROTOCOL.md.template contains the coffeetalk agent log protocol (CV-228)', () => {
  const raw = read('agents/templates/SHARED_PROTOCOL.md.template');
  assert.match(raw, /pm\/coffeetalk\.md/,
    'SHARED_PROTOCOL.md.template must reference pm/coffeetalk.md');
  assert.match(raw, /append-only/,
    'SHARED_PROTOCOL.md.template must state the log is append-only');
});

// ── CV-229: Frontend first-step bullets ───────────────────────────────────

test('frontend-developer.md instructs searching the component library first (CV-229)', () => {
  const raw = read('agents/templates/execution-agents/frontend-developer.md');
  assert.match(raw, /component-library\/bin\/search\.mjs/,
    'frontend-developer.md must reference the component library search script');
});

test('frontend-developer.md references shadcn primitives as fallback (CV-229)', () => {
  const raw = read('agents/templates/execution-agents/frontend-developer.md');
  assert.match(raw, /shadcn/,
    'frontend-developer.md must mention shadcn primitives as the fallback');
});

test('frontend-developer.md mandates Tailwind-only styling (CV-229)', () => {
  const raw = read('agents/templates/execution-agents/frontend-developer.md');
  assert.match(raw, /Tailwind/,
    'frontend-developer.md must mandate Tailwind-only styling');
});

test('frontend-developer.md forbids raw CSS (CV-229)', () => {
  const raw = read('agents/templates/execution-agents/frontend-developer.md');
  assert.match(raw, /no raw CSS/i,
    'frontend-developer.md must forbid raw CSS');
});

// ── CV-085: project-manager.md exists and has required content ─────────────

test('project-manager.md exists and references BACKLOG.md (CV-085)', () => {
  const f = 'agents/templates/planning-agents/project-manager.md';
  assert.ok(existsSync(join(ROOT, f)), `project-manager.md must exist at ${f}`);
  const raw = read(f);
  assert.match(raw, /BACKLOG\.md/,
    'project-manager.md must reference BACKLOG.md for idea capture');
  assert.match(raw, /never one more thing/i,
    'project-manager.md must enforce the "never one more thing" rule');
});

// ── CV-232: code-reviewer.md has a Reasoning Framework section ─────────────

test('code-reviewer.md contains a Reasoning Framework section (CV-232)', () => {
  const raw = read('agents/templates/execution-agents/code-reviewer.md');
  assert.match(raw, /#{2,3} Reasoning Framework/,
    'code-reviewer.md must have a Reasoning Framework section');
});

test('code-reviewer.md Reasoning Framework has name-cite-reframe three-step structure (CV-232)', () => {
  const raw = read('agents/templates/execution-agents/code-reviewer.md');
  const section = raw.split(/#{2,3} Reasoning Framework/)[1]?.split(/\n### /)[0] || '';
  assert.match(section, /Name the distortion/i,
    'Reasoning Framework must include "name the distortion"');
  assert.match(section, /Cite evidence/i,
    'Reasoning Framework must include "cite evidence"');
  assert.match(section, /State the reframe/i,
    'Reasoning Framework must include "state the reframe"');
});

// ── CV-234: code-reviewer.md has Standardization Sweep procedure ──────────

test('code-reviewer.md contains a Standardization Sweep section (CV-234)', () => {
  const raw = read('agents/templates/execution-agents/code-reviewer.md');
  assert.match(raw, /## Standardization Sweep/,
    'code-reviewer.md must have a Standardization Sweep section');
});

test('code-reviewer.md Standardization Sweep covers naming, error pattern, types, docstrings, typecheck (CV-234)', () => {
  const raw = read('agents/templates/execution-agents/code-reviewer.md');
  const section = raw.split(/## Standardization Sweep/)[1]?.split(/\n### /)?.[0] || '';
  const items = ['Naming conventions', 'Error pattern consistency',
    'Type annotation completeness', 'Docstring coverage', 'Typecheck pass'];
  for (const item of items) {
    assert.ok(section.includes(item),
      `Standardization Sweep must contain item: "${item}"`);
  }
});

// ── CV-235: seed-tasks.json.template standardization-sweep task ──────────

test('seed-tasks.json.template parses as valid JSON and contains a Standardization sweep task (CV-235)', () => {
  const raw = read('agents/templates/seed-tasks.json.template');
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(raw); },
    'seed-tasks.json.template must be valid JSON');
  assert.ok(parsed.tasks, 'template must have a tasks array');
  const found = parsed.tasks.find(t =>
    t.title && t.title.toLowerCase().includes('standardization sweep'));
  assert.ok(found,
    'seed-tasks.json.template must contain a task whose title includes "Standardization sweep"');
});

// ── CV-236: claude-quickstart.md interactive-only / scheduler / REA ────────

test('claude-quickstart.md states /schedule and /loop are interactive-only (CV-236)', () => {
  const raw = read('docs/claude-quickstart.md');
  assert.match(raw, /interactive-only/,
    'claude-quickstart.md must state that /schedule and /loop are interactive-only');
});

test('claude-quickstart.md references scheduler-install.mjs as the autonomous equivalent (CV-236)', () => {
  const raw = read('docs/claude-quickstart.md');
  assert.match(raw, /scheduler-install\.mjs/,
    'claude-quickstart.md must reference scheduler-install.mjs as the autonomous scheduling equivalent');
});

test('claude-quickstart.md mentions REA MCP feeding browser-user-test.mjs generate (CV-236)', () => {
  const raw = read('docs/claude-quickstart.md');
  assert.match(raw, /REA/,
    'claude-quickstart.md must mention REA MCP');
  assert.match(raw, /browser-user-test\.mjs generate/,
    'claude-quickstart.md must mention browser-user-test.mjs generate as fed by REA');
});

// ── CV-238: agent-routing.md has "Disagreement is the finding" ──────────────

test('agent-routing.md contains the phrase "disagreement is the finding" (CV-238)', () => {
  const raw = read('framework/agent-routing.md');
  assert.match(raw, /disagreement is the finding/i,
    'agent-routing.md must state that when reviewers disagree, the disagreement is the finding');
});

// ── CV-221: Every template path named in planning-templates.md exists ─────

const SPEC_FILE = 'openspec/changes/curriculum-v2-conformance/specs/planning-templates.md';

// Paths referenced in the spec that are knowingly absent from disk (added by
// future tasks as they implement the corresponding CV-REQ).  Later tasks add
// to this array when they commit a file named in the spec.
const NOT_YET_CREATED = [
  'pm/coffeetalk.md',                                     // CV-REQ-083 (runtime log)
];

// Template directories where bare filenames from the spec may live.
const PREFIXES = [
  'agents/templates/planning-agents',
  'agents/templates/execution-agents',
  'agents/templates',
  'openspec/templates',
  'agents',
  'docs',
  'framework',
  'skills',
];

function resolvePath(token) {
  // Full repo-relative path (contains '/')
  if (token.includes('/')) {
    if (existsSync(join(ROOT, token))) return token;
  }
  // Bare filename — try each template prefix then repo root
  for (const pre of PREFIXES) {
    if (existsSync(join(ROOT, pre, token))) return `${pre}/${token}`;
  }
  if (existsSync(join(ROOT, token))) return token;
  return null;
}

test('every template path named in planning-templates.md exists (CV-221)', () => {
  const raw = read(SPEC_FILE);
  const tokens = [...raw.matchAll(/`([^`]+)`/g)].map(m => m[1]);

  // Keep only strings that look like file paths (have an extension or a slash)
  // and skip directory globs like `openspec/templates/*`
  const pathTokens = tokens.filter(t =>
    (t.includes('.') || t.includes('/')) &&
    !t.includes('*') &&
    !t.startsWith('PLAN') &&
    !t.startsWith('/') &&         // `/schedule`, `/loop` — Claude slash commands
    !t.includes(' ') &&           // CLI invocations like `node ~/... <keyword>`
    !t.startsWith('~') &&          // `~/agentic-sdlc` — shell path, not repo-relative
    // Parens like `agents/SHARED_PROTOCOL.md(.template)` are annotations, not
    // part of the path; we resolve the clean version below.
    true
  );

  const missing = [];
  for (const rawToken of pathTokens) {
    // Strip parenthetical annotations: (.template) → empty
    const cleaned = rawToken.replace(/\([^)]*\)/g, '').trim();
    if (NOT_YET_CREATED.includes(cleaned)) continue;
    if (NOT_YET_CREATED.includes(rawToken)) continue;
    if (resolvePath(cleaned)) continue;
    missing.push(rawToken);
  }

  assert.deepEqual(missing, [],
    `Template paths referenced in planning-templates.md that do not exist on disk:\n` +
    missing.map(p => `  ${p}`).join('\n'));
});