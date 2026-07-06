#!/usr/bin/env node
/**
 * Tests for pr-auto-review.mjs — the automated review-merge pipeline for
 * autonomous drain PRs. Pure functions + structural guards only: no network,
 * no gh, no git, no LLM. Importing the module must be side-effect-free
 * (guarded by __isMainModule).
 *
 * Run: node tests/pr-auto-review.test.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  scanScope,
  taskIdFromBranch,
  buildReviewPrompt,
  parseVerdict,
  runAutoReview,
  MAX_AUTO_MERGES,
  FLAG_PATHS,
  DIFF_CHAR_LIMIT,
} from '../agents/pr-auto-review.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'agents/pr-auto-review.mjs'), 'utf8');

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try { fn(); console.log('OK'); passed++; }
  catch (err) { console.log('FAIL'); failures.push({ name, err: err.message }); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

console.log('pr-auto-review tests');

// --- exports + side-effect-free import ---------------------------------------

test('module exports the pipeline surface without CLI side effects', () => {
  assert(typeof scanScope === 'function', 'scanScope missing');
  assert(typeof taskIdFromBranch === 'function', 'taskIdFromBranch missing');
  assert(typeof buildReviewPrompt === 'function', 'buildReviewPrompt missing');
  assert(typeof parseVerdict === 'function', 'parseVerdict missing');
  assert(typeof runAutoReview === 'function', 'runAutoReview missing');
  assert(/if \(__isMainModule\(\)\)/.test(source), 'CLI must be __isMainModule-guarded');
});

// --- scope / safety scan (REQ-002) -------------------------------------------

test('scanScope hard-rejects secret and deploy paths', () => {
  for (const p of ['.env', '.env.production', 'config/.env', 'secrets/api.txt',
    'agents/credentials.json', 'deploy/key.pem', 'ops/id_rsa', '.github/workflows/deploy-prod.yml']) {
    const r = scanScope([p]);
    assert(r.rejects.length === 1 && !r.ok, `should reject ${p}, got ${JSON.stringify(r)}`);
  }
});

test('scanScope hard-rejects paths escaping the repo', () => {
  for (const p of ['../outside.txt', 'a/../../etc/passwd', '/etc/passwd']) {
    const r = scanScope([p]);
    assert(r.rejects.length >= 1, `should reject escaping path ${p}`);
  }
});

test('scanScope flags the guardrail surface (never auto-merged)', () => {
  for (const p of ['agents/hermes-drain.sh', 'agents/drain-prompt.md', 'agents/pr-auto-review.mjs',
    'agents/budget.json', '.github/workflows/test.yml', 'agents/scheduler-install.mjs']) {
    const r = scanScope([p]);
    assert(r.flags.includes(p) && !r.ok, `should flag ${p}, got ${JSON.stringify(r)}`);
  }
});

test('scanScope passes ordinary code paths', () => {
  const r = scanScope(['agents/rag-indexer.mjs', 'tests/deploy-rollback.test.mjs',
    'docs/appendix/adapters.md', 'openspec/changes/x/proposal.md', 'environment.md']);
  assert(r.ok && r.rejects.length === 0 && r.flags.length === 0, `expected clean, got ${JSON.stringify(r)}`);
});

test('the guardrail flag list covers drain, pipeline, budget, scheduler', () => {
  for (const must of ['agents/hermes-drain.sh', 'agents/drain-prompt.md',
    'agents/pr-auto-review.mjs', 'agents/budget.json', 'agents/scheduler-install.mjs']) {
    assert(FLAG_PATHS.includes(must), `${must} missing from FLAG_PATHS`);
  }
});

// --- branch → task id ---------------------------------------------------------

test('taskIdFromBranch extracts queue task ids', () => {
  assert(taskIdFromBranch('agent/drain/H-001') === 'H-001', 'plain id');
  assert(taskIdFromBranch('agent/drain/H-003-20260706') === 'H-003', 'timestamp suffix');
  assert(taskIdFromBranch('agent/drain/TASK-42') === 'TASK-42', 'other prefixes');
  assert(taskIdFromBranch('feature/auto-review-merge') === null, 'non-drain branch');
  assert(taskIdFromBranch('') === null && taskIdFromBranch(undefined) === null, 'empty/undefined');
});

// --- LLM verdict parsing (REQ-003: garbage is never approval) ------------------

test('parseVerdict accepts strict and fenced JSON', () => {
  const a = parseVerdict('{"verdict":"approve","reasons":["in scope","tests added"]}');
  assert(a?.verdict === 'approve' && a.reasons.length === 2, 'strict JSON');
  const b = parseVerdict('Here is my review:\n```json\n{"verdict":"reject","reasons":["scope creep"]}\n```');
  assert(b?.verdict === 'reject' && b.reasons[0] === 'scope creep', 'fenced JSON');
});

test('parseVerdict returns null for garbage, prose, or bad verdicts', () => {
  for (const bad of [null, undefined, '', 'LGTM!', '{"verdict":"maybe"}', '{"reasons":["x"]}', '{not json']) {
    assert(parseVerdict(bad) === null, `should be null for ${JSON.stringify(bad)}`);
  }
});

// --- review prompt (REQ-003) ---------------------------------------------------

test('buildReviewPrompt embeds task, PR, checklist, and diff', () => {
  const p = buildReviewPrompt({
    task: { id: 'H-002', title: 'Remove OpenAI' },
    title: 'feat: do H-002', body: 'does the thing',
    diff: 'diff --git a/x b/x\n+1',
  });
  assert(p.includes('"id": "H-002"'), 'task JSON present');
  assert(p.includes('feat: do H-002') && p.includes('does the thing'), 'PR title/body present');
  assert(/no OpenAI/i.test(p), 'privacy checklist present');
  assert(/weakening of tests/i.test(p), 'guard-weakening checklist present');
  assert(p.includes('diff --git a/x b/x'), 'diff present');
  assert(p.includes('"verdict"'), 'requests strict JSON verdict');
});

test('buildReviewPrompt truncates oversized diffs and tolerates a missing task', () => {
  const p = buildReviewPrompt({ task: null, title: 't', body: '', diff: 'x'.repeat(DIFF_CHAR_LIMIT + 500) });
  assert(p.includes('[diff truncated]'), 'must truncate');
  assert(/no matching queue task/.test(p), 'missing-task fallback');
});

// --- structural guards (REQ-001, REQ-004) --------------------------------------

test('hard gate runs npm test + four-layer-validate in a detached temp worktree', () => {
  assert(/worktree', 'add', '--detach'/.test(source), 'must use a detached temp worktree');
  assert(/\['test'\]/.test(source), 'must run npm test in the gate');
  assert(/four-layer-validate\.mjs/.test(source), 'must run four-layer-validate in the gate');
  assert(/worktree', 'remove', '--force'/.test(source), 'must clean the worktree up');
});

test('merge path is squash + delete-branch, rate-limited, and logged', () => {
  assert(/'--squash', '--delete-branch'/.test(source), 'must squash-merge and delete the branch');
  assert(MAX_AUTO_MERGES >= 1 && MAX_AUTO_MERGES <= 5, `sane merge rate limit, got ${MAX_AUTO_MERGES}`);
  assert(/pr-auto-review\.log/.test(source), 'must log decisions to pm/pr-auto-review.log');
  assert(/\.sdlc-autonomous\.lock\.d/.test(source), 'must hold the SHARED single-flight mkdir mutex (mutually exclusive with the drain)');
  assert(/sha:\$\{headSha\}/.test(source), 'comments must embed the reviewed head SHA (no spam)');
});

test('soft failures never auto-close and LLM cannot bypass the gates', () => {
  assert(!/pr', 'close'/.test(source) && !/'close',/.test(source), 'pipeline must never close PRs');
  const gateIdx = source.indexOf('const gate = hardGate(');
  const llmIdx = source.indexOf('await llmReview(');
  assert(gateIdx > 0 && llmIdx > gateIdx, 'LLM review must run after the hard gate');
  assert(/treated as NOT approved|treated as not approved/i.test(source), 'LLM errors must not approve');
});

test('no OpenAI usage in the pipeline (privacy)', () => {
  assert(!/api\.openai\.com/.test(source), 'must not call the OpenAI API');
  assert(!/loadLlmAdapter\([^)]*['"]openai['"]/.test(source), 'must not select the openai adapter');
  assert(/['"]openrouter['"]/.test(source), 'must use the openrouter adapter');
});

// --- main-tree isolation (production-safety of the autonomous loop) -----------

test('all review-side git mutation happens in the dedicated clone, never the main tree', () => {
  assert(/\.sdlc-review-clone/.test(source), 'must use the dedicated review clone');
  assert(/completeTaskInClone/.test(source), 'task completion must run in the clone');
  assert(!/completeTaskOnMain\(/.test(source), 'the main-tree completion path must be gone');
  // Every git push must be from the clone (the only push call site).
  const pushes = source.match(/'push'/g) || [];
  assert(pushes.length === 1, `exactly one push call site expected, got ${pushes.length}`);
  assert(/\['-C', clone, 'push', 'origin', 'main'\]/.test(source), 'the push must target origin main FROM the clone');
  assert(!/'push',\s*'--force'|'--force',\s*'push'|force-with-lease/.test(source), 'never force-push');
  // No pull/commit/checkout against the caller's repoDir working tree.
  assert(!/\['-C', repoDir, 'pull'/.test(source), 'must not pull in the main tree');
  assert(!/\['-C', repoDir, 'commit'/.test(source), 'must not commit in the main tree');
  assert(!/\['-C', repoDir, 'checkout'/.test(source), 'must not switch branches in the main tree');
  assert(!/\['-C', repoDir, 'worktree'/.test(source), 'hard-gate worktrees must come from the clone, not the main repo');
  assert(!/\['-C', repoDir, 'fetch'/.test(source), 'must not fetch into the main repo (FETCH_HEAD races)');
  // The clone refresh must FORCE the checkout — leftover dirty state from an
  // interrupted run must never brick the refresh (drain-clone regression, 2026-07-06).
  assert(/'checkout', '-q', '-f', '-B', 'main', 'origin\/main'/.test(source), 'review-clone refresh must use checkout -f');
});

test('hard gate builds its worktree from the review clone', () => {
  assert(/hardGate\(ctx\.cloneDir/.test(source), 'hardGate must run against the clone');
});

test('the shared mutex records its holder for debuggability', () => {
  assert(/holder/.test(source), 'lock holder metadata must be written');
  assert(/pr-auto-review \$\{process\.pid\}/.test(source), 'holder must identify the job + pid');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`); process.exit(1); }
