/**
 * pattern-hunt categorisation + recurrence (CV-321 follow-through, 2026-11-09).
 * The issue strings below are verbatim drain-PR rejections from pm/pr-auto-review.log.
 *
 * Run: node --test agents/__tests__/pattern-hunt-categories.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { categorizeIssue, parseReview, groupByCategory, findRecurringPatterns } from '../pattern-hunt.mjs';

test('importing pattern-hunt has no CLI side effects (rule 9)', () => {
  assert.equal(typeof categorizeIssue, 'function');
});

test('real drain-PR rejections land in named categories', () => {
  const cases = {
    'scope-creep': ['Scope creep: added unrelated file tasks/queue/FIX-133.json', 'Unrelated change to heartbeat.mjs timeout value not mentioned in task scope'],
    'test-weakening': ['Test file was completely rewritten instead of adding new tests', 'Removed all existing test functionality for schema validation and capture logic', 'Tests no longer validate the core inbox capture functionality'],
    'regex-fragility': ['regex pattern incorrectly matches content across multiple sections', 'Test for \'what-if-not-built\' uses overly broad regex that could match unintended content'],
    'stray-artifacts': ['package-lock.json and node_modules files incorrectly included in PR'],
    'review-infra': ['No diff content provided for review', 'Cannot verify changes without seeing the actual code modifications'],
    'missing-tests': ["Missing test for 'Who Benefits' requirement"],
  };
  for (const [category, texts] of Object.entries(cases)) {
    for (const t of texts) assert.equal(categorizeIssue(`[major] ${t}`).category, category, t);
  }
});

const review = (n, issues) => ({ commitHash: `c${n}`, title: `PR ${n}`, reviewedAt: null, issues: issues.map(raw => ({ raw, severity: 'major', ...categorizeIssue(raw) })) });

test('a category in 3 different reviews is recurring', () => {
  const reviews = [1, 2, 3].map(n => review(n, [`[major] Scope creep in PR ${n}`]));
  assert.deepEqual(findRecurringPatterns(groupByCategory(reviews)).map(p => p.category), ['scope-creep']);
});

test('unclassified issues and reviewer-infra failures never form a pattern (no junk checklist items)', () => {
  const reviews = [1, 2, 3].map(n => review(n, [`[major] something unique number ${n}`, '[major] No diff content provided for review']));
  assert.deepEqual(findRecurringPatterns(groupByCategory(reviews)), []);
});

test('parseReview reads a record written by any reviewer name, not only "Richmond Avenal"', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'ph-')), '70.md');
  writeFileSync(f, '## Review: PR #70 — x\n\n**Commit:** abc1234\n**Verdict:** REJECT\n\n### Issues Found\n\n1. [major] Scope creep: y\n\n_Reviewed by sdlc-reviewer at 2026-11-09T00:00:00Z_\n');
  const r = parseReview(f);
  assert.equal(r.reviewedAt, '2026-11-09T00:00:00Z');
  assert.deepEqual(r.issues.map(i => [i.severity, i.category]), [['major', 'scope-creep']]);
});
