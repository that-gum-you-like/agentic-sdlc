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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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