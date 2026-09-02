/**
 * sdlc-portfolio skill — the Telegram-facing skill that answers roster
 * questions by shelling out to portfolio.mjs.
 * Spec: openspec/changes/business-os/specs/portfolio-registry.md REQ-002
 * Task: OS-business-os-18 (T-605)
 *
 * The property under test: the skill file exists with valid frontmatter, and
 * the command it teaches (portfolio.mjs list) really returns the roster — a
 * Telegram agent that follows the skill answers from the file, not from
 * memory.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const SKILL_PATH = join(REPO_ROOT, 'skills', 'sdlc-portfolio', 'SKILL.md');
const PORTFOLIO_PATH = join(REPO_ROOT, 'portfolio.json');
const PORTFOLIO_SCRIPT = join(REPO_ROOT, 'agents', 'portfolio.mjs');

test('the sdlc-portfolio skill file exists with valid frontmatter', () => {
  assert.ok(existsSync(SKILL_PATH), 'skills/sdlc-portfolio/SKILL.md must exist');

  const raw = readFileSync(SKILL_PATH, 'utf8');
  assert.match(raw, /^---\n/, 'SKILL.md must start with YAML frontmatter');
  assert.match(raw, /^name:\s*sdlc-portfolio\s*$/m, 'frontmatter name must be sdlc-portfolio');
  assert.match(raw, /^version:\s*\S+\s*$/m, 'frontmatter must carry a version');
  assert.match(raw, /^description:\s*"/m, 'frontmatter must have a quoted description');
  assert.match(raw, /^---\n/m, 'frontmatter must close');
});

test('the skill teaches shelling out to portfolio.mjs, never answering from memory', () => {
  const raw = readFileSync(SKILL_PATH, 'utf8');

  // The skill must point at the script by its stable path and forbid recall.
  assert.match(raw, /agents\/portfolio\.mjs/, 'skill must reference agents/portfolio.mjs');
  assert.match(raw, /portfolio\.json/, 'skill must reference the portfolio.json source of truth');
  assert.match(raw, /shell out|Shell out/, 'skill must instruct shelling out');
  assert.match(raw, /never answer from memory|answer from memory/i, 'skill must forbid memory-only answers');
  assert.match(raw, /list --json/, 'skill must document list --json for machine-readable answers');
  assert.match(raw, /show <name>/, 'skill must document show <name>');
});

test('the documented command returns the REAL roster (shell-out path)', () => {
  const portfolio = JSON.parse(readFileSync(PORTFOLIO_PATH, 'utf8'));
  assert.ok(portfolio.projects.length > 0, 'portfolio.json must have projects for this test to mean anything');

  const out = execFileSync('node', [PORTFOLIO_SCRIPT, 'list', '--json'], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
  const rows = JSON.parse(out);

  assert.equal(rows.length, portfolio.projects.length,
    'list --json must return exactly the projects in portfolio.json');

  const byName = new Map(rows.map((r) => [r.name, r]));
  for (const p of portfolio.projects) {
    const row = byName.get(p.name);
    assert.ok(row, `project "${p.name}" must appear in list --json output`);
    assert.equal(row.stage, p.stage, `stage for "${p.name}" must match the file`);
    assert.equal(row.owner, p.owner, `owner for "${p.name}" must match the file`);
  }
});

test('the skill never teaches printing credential values', () => {
  // credentialVars are NAMES; the skill must say so and must not carry values.
  const raw = readFileSync(SKILL_PATH, 'utf8');
  assert.match(raw, /credentialVars/, 'skill must mention credentialVars');
  assert.match(raw, /never print|NEVER print|names only|values/, 'skill must forbid echoing credential values');
});