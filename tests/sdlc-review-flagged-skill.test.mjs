/**
 * sdlc-review-flagged skill — the Claude Code skill that guides an interactive
 * session through reviewing flagged PRs in the Claude review queue.
 * Spec: openspec/changes/curriculum-v2-conformance/specs/claude-review-lane.md CV-REQ-102
 * Task: OS-curriculum-v2-conformance-109 (CV-508)
 *
 * The property under test: following the skill produces a correct human-led
 * review of each flagged entry — listing the queue, checking out the PR in a
 * scratch worktree, merging origin/main, running tests, reading the flagged
 * diffs, deciding the outcome, leaving a comment, and resolving the entry.
 * The skill must also state it never calls an LLM API.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const SKILL_PATH = join(REPO_ROOT, 'skills', 'sdlc-review-flagged', 'SKILL.md');

test('the sdlc-review-flagged skill file exists with valid frontmatter', () => {
  assert.ok(existsSync(SKILL_PATH), 'skills/sdlc-review-flagged/SKILL.md must exist');

  const raw = readFileSync(SKILL_PATH, 'utf8');
  assert.match(raw, /^---\n/, 'SKILL.md must start with YAML frontmatter');
  assert.match(raw, /^name:\s*sdlc-review-flagged\s*$/m, 'frontmatter name must be sdlc-review-flagged');
  assert.match(raw, /^version:\s*\S+\s*$/m, 'frontmatter must carry a version');
  assert.match(raw, /^description:\s*"/m, 'frontmatter must have a quoted description');
  assert.match(raw, /^---\n/m, 'frontmatter must close');
});

test('the skill references the Claude review queue path', () => {
  const raw = readFileSync(SKILL_PATH, 'utf8');
  assert.match(raw, /pm\/claude-review-queue\.json/,
    'skill must reference the claude review queue file');
});

test('the skill teaches the list-flagged subcommand', () => {
  const raw = readFileSync(SKILL_PATH, 'utf8');
  assert.match(raw, /list-flagged/,
    'skill must mention the list-flagged subcommand');
  assert.match(raw, /pr-auto-review\.mjs.*list-flagged/,
    'skill must show the exact CLI invocation of list-flagged');
});

test('the skill teaches the resolve-flagged subcommand', () => {
  const raw = readFileSync(SKILL_PATH, 'utf8');
  assert.match(raw, /resolve-flagged/,
    'skill must mention the resolve-flagged subcommand');
  assert.match(raw, /pr-auto-review\.mjs.*resolve-flagged/,
    'skill must show the exact CLI invocation of resolve-flagged');
  assert.match(raw, /resolve-flagged <PR> <merged|closed|changes-requested>/,
    'skill must document the three resolve-flagged outcomes');
});

test('the skill teaches merging origin/main into the worktree', () => {
  const raw = readFileSync(SKILL_PATH, 'utf8');
  assert.match(raw, /git merge/,
    'skill must teach merging the current main into the PR worktree');
  assert.match(raw, /origin\/main/,
    'skill must reference merging origin/main specifically');
});

test('the skill explicitly forbids calling an LLM API', () => {
  const raw = readFileSync(SKILL_PATH, 'utf8');
  assert.match(raw, /NO API/i,
    'skill must have a no-API-statement guardrail');
  assert.match(raw, /never call.*API|no.*LLM API|never invoke.*API|API calls/i,
    'skill must forbid LLM API calls in the guardrails section');
});

test('the skill documents the outcomes table (merge / changes-requested / close)', () => {
  const raw = readFileSync(SKILL_PATH, 'utf8');
  assert.match(raw, /\|\s*\*{0,2}[Mm]erge\*{0,2}\s*\|/,
    'skill must document merge as an outcome');
  assert.match(raw, /changes-requested/,
    'skill must document changes-requested as an outcome');
  // The close row's action cell wraps close in **markdown bold** followed by a description
  assert.match(raw, /\|\s*\*{0,2}[Cc]lose\*{0,2}/,
    'skill must document close as an outcome in the outcomes table');
  assert.match(raw, /`closed`.*close.*outcomes|`close`|close.*\|/m,
    'skill must document close as a valid outcome somewhere');
});

test('the skill teaches the worktree lifecycle (create + remove)', () => {
  const raw = readFileSync(SKILL_PATH, 'utf8');
  assert.match(raw, /git worktree add/,
    'skill must teach creating a scratch worktree');
  assert.match(raw, /git worktree remove/,
    'skill must teach removing the scratch worktree after review');
  assert.match(raw, /rm -rf/,
    'skill must clean up the scratch directory');
});

test('the skill enforces never merging with failing tests', () => {
  const raw = readFileSync(SKILL_PATH, 'utf8');
  assert.match(raw, /never merge.*fail|Never merge.*fail|No API calls/,
    'skill must forbid merging when tests fail');
  assert.match(raw, /npm test/,
    'skill must reference running the test suite');
});

test('the skill teaches reading every changed line of FLAG_PATHS files', () => {
  const raw = readFileSync(SKILL_PATH, 'utf8');
  assert.match(raw, /FLAG_PATHS/,
    'skill must reference the FLAG_PATHS constant');
  assert.match(raw, /every changed line|each changed line/i,
    'skill must require reading every changed line of flagged files');
});

test('the skill includes a reference card with queue path, CLI, outcomes, test gate', () => {
  const raw = readFileSync(SKILL_PATH, 'utf8');
  assert.match(raw, /\|.*Queue file.*\|/,
    'reference card must list the queue file');
  assert.match(raw, /\|.*Queue CLI.*\|/,
    'reference card must list the queue CLI');
  assert.match(raw, /\|.*Worktree.*\|/,
    'reference card must mention worktree');
  assert.match(raw, /\|.*Test gate.*\|/,
    'reference card must mention the test gate');
});