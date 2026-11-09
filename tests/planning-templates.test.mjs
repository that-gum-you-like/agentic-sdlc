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

// ── CV-221: Every template path named in planning-templates.md exists ─────

const SPEC_FILE = 'openspec/changes/curriculum-v2-conformance/specs/planning-templates.md';

// Paths referenced in the spec that are knowingly absent from disk (added by
// future tasks as they implement the corresponding CV-REQ).  Later tasks add
// to this array when they commit a file named in the spec.
const NOT_YET_CREATED = [
  'agents/templates/planning-agents/project-manager.md', // CV-REQ-085
  'agents/templates/execution-agents/git-expert.md',     // CV-REQ-089
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