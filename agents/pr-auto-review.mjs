#!/usr/bin/env node
/**
 * pr-auto-review.mjs — automated review-merge pipeline for autonomous drain PRs.
 *
 * For each open `agent/drain/*` PR, in order:
 *   1. HARD GATE  — check the head out into a temp git worktree; `npm test` +
 *                   `node agents/four-layer-validate.mjs` must pass there.
 *                   No pass, no merge. No flag can skip this.
 *   2. SCOPE SCAN — deterministic: hard-reject secret/deploy/escaping paths;
 *                   FLAG (never auto-merge) anything touching the guardrail
 *                   surface (drain script/prompt, this pipeline, CI workflows,
 *                   budget.json, scheduler) so the system cannot silently
 *                   weaken its own gates.
 *   3. LLM REVIEW — OpenRouter (no OpenAI) scores the diff against the queue
 *                   task + a safety checklist; strict-JSON approve/reject.
 *                   Errors/garbage count as NOT approved, never as approval.
 *   4. ACT        — all pass → `gh pr merge --squash --delete-branch`, then the
 *                   queue task is marked complete IN A DEDICATED CLONE
 *                   (~/.sdlc-review-clone) and pushed — the main working tree
 *                   is NEVER mutated by this job (a reconcile pass at run
 *                   start self-heals missed ones).
 *                   Soft fail → one review comment per head SHA; PR stays open.
 *
 * ≤ MAX_AUTO_MERGES (default 3) merges per run. Single-flight mkdir lock.
 * One JSON line per decision appended to pm/pr-auto-review.log.
 *
 * Usage: node agents/pr-auto-review.mjs [--dry-run]
 * Zero npm dependencies (Node stdlib only).
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync, rmSync, mkdtempSync, writeFileSync, statSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { tmpdir, homedir } from 'os';
import { fileURLToPath } from 'url';
import { loadLlmAdapter } from './adapters/load-adapter.mjs';
import { loadConfig } from './load-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function __isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === __filename;
}

// ---------------------------------------------------------------------------
// Policy (exported so tests pin the guardrail surface)
// ---------------------------------------------------------------------------

export const MAX_AUTO_MERGES = Number(process.env.MAX_AUTO_MERGES || 3);
export const REVIEW_MODEL = process.env.PR_REVIEW_MODEL || 'deepseek/deepseek-chat-v3.1';
export const REVIEW_AGENT = process.env.PR_REVIEW_AGENT || 'sdlc-reviewer';
export const DIFF_CHAR_LIMIT = 60_000;
const COMMENT_MARKER = '<!-- pr-auto-review';

/** Paths whose modification makes a PR un-auto-mergeable (hard unsafe). */
const REJECT_RULES = [
  { re: /(^|\/)\.env($|\.|\b)/, why: 'touches a .env file' },
  { re: /(^|\/)(secrets?|credentials?)([./]|$)/i, why: 'touches a secrets/credentials path' },
  { re: /\.pem$|(^|\/)id_rsa[^/]*$|\.p12$|\.keystore$/i, why: 'touches key material' },
  { re: /^\.github\/.*deploy/i, why: 'touches a .github deploy workflow' },
  { re: /^\/|(^|\/)\.\.(\/|$)/, why: 'path escapes the repository' },
];

/** Guardrail surface: modifying these is FLAGGED — never auto-merged. */
export const FLAG_PATHS = [
  'agents/hermes-drain.sh',
  'agents/drain-prompt.md',
  'agents/pr-auto-review.mjs',
  'agents/budget.json',
  'agents/templates/cron-schedule.json.template',
  'agents/scheduler-install.mjs',
  'tests/pr-auto-review.test.mjs',
  'tests/hermes-drain.test.mjs',
];
const FLAG_PREFIXES = ['.github/workflows/'];

/**
 * Deterministic scope/safety scan over a PR's changed paths.
 * @returns {{ ok: boolean, rejects: string[], flags: string[] }}
 */
export function scanScope(paths) {
  const rejects = [];
  const flags = [];
  for (const p of paths || []) {
    for (const rule of REJECT_RULES) {
      if (rule.re.test(p)) { rejects.push(`${p} — ${rule.why}`); break; }
    }
    if (FLAG_PATHS.includes(p) || FLAG_PREFIXES.some(pre => p.startsWith(pre))) {
      flags.push(p);
    }
  }
  return { ok: rejects.length === 0 && flags.length === 0, rejects, flags };
}

/** Extract the queue task id from a drain branch name (agent/drain/H-001[-suffix]). */
export function taskIdFromBranch(branch) {
  const m = /^agent\/drain\/([A-Za-z]+-\d+)/.exec(branch || '');
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// LLM review
// ---------------------------------------------------------------------------

export function buildReviewPrompt({ task, title, body, diff }) {
  const taskBlock = task
    ? `## Queue task this PR claims to implement\n${JSON.stringify(task, null, 2)}`
    : '## Queue task\n(no matching queue task found — judge against the PR description alone)';
  const clippedDiff = (diff || '').length > DIFF_CHAR_LIMIT
    ? diff.slice(0, DIFF_CHAR_LIMIT) + '\n... [diff truncated]'
    : (diff || '');
  return `You are the automated code reviewer for the agentic-sdlc framework. Review this pull request produced by an autonomous agent. The full test suite ALREADY PASSED in a clean worktree, and a deterministic safety scan already ran — your job is judgment: correctness, scope fidelity, and safety.

${taskBlock}

## PR title
${title}

## PR description
${body || '(none)'}

## Safety checklist — reject if ANY of these fail
1. The diff does only what the task/description says (no scope creep, no unrelated files).
2. No weakening of tests, CI, validation, locks, or safety guards without explicit justification.
3. No secrets, credentials, tokens, or personal data added.
4. No new network calls to unexpected hosts; no OpenAI dependencies (privacy policy).
5. No destructive operations (rm -rf, force-push, history rewrites) introduced into scripts.
6. New/changed scripts keep the __isMainModule CLI guard convention and zero npm runtime deps.
7. Code quality is acceptable: no dead code, no silent fallbacks that hide errors, small focused diff.

## Diff
\`\`\`diff
${clippedDiff}
\`\`\`

Respond with ONLY a JSON object, no prose before or after:
{"verdict": "approve" | "reject", "reasons": ["<short reason>", ...]}`;
}

/**
 * Parse the LLM's verdict. Strict: anything unparseable or missing fields
 * returns null (treated as NOT approved by the caller).
 */
export function parseVerdict(text) {
  if (!text || typeof text !== 'string') return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj;
  try { obj = JSON.parse(m[0]); } catch { return null; }
  if (obj?.verdict !== 'approve' && obj?.verdict !== 'reject') return null;
  return { verdict: obj.verdict, reasons: Array.isArray(obj.reasons) ? obj.reasons.map(String) : [] };
}

function ensureOpenRouterKey() {
  if (process.env.OPENROUTER_API_KEY) return true;
  // Read-only reuse of the drain profile's key (same account, same ladder).
  const envFile = join(process.env.HERMES_DRAIN_HOME || join(homedir(), '.hermes-drain'), '.env');
  if (!existsSync(envFile)) return false;
  const m = readFileSync(envFile, 'utf8').match(/^OPENROUTER_API_KEY=(.+)$/m);
  if (!m) return false;
  process.env.OPENROUTER_API_KEY = m[1].trim().replace(/^["']|["']$/g, '');
  return true;
}

async function llmReview({ task, title, body, diff }) {
  if (!ensureOpenRouterKey()) return { verdict: null, reasons: ['OPENROUTER_API_KEY unavailable'] };
  let adapter;
  try {
    adapter = await loadLlmAdapter(loadConfig().config, 'openrouter');
  } catch (err) {
    return { verdict: null, reasons: [`adapter load failed: ${err.message}`] };
  }
  try {
    const res = await adapter.complete(buildReviewPrompt({ task, title, body, diff }), {
      model: REVIEW_MODEL,
      maxTokens: 1500,
      temperature: 0,
    });
    // Capture realized provider-reported usage in the cost ledger (REQ-H3).
    try {
      const { recordRealizedUsage } = await import('./cost-tracker.mjs');
      recordRealizedUsage(REVIEW_AGENT, task || 'pr-review', res);
    } catch { /* ledger capture must never break a review */ }
    const parsed = parseVerdict(res.text);
    if (!parsed) return { verdict: null, reasons: ['unparseable LLM response (treated as not approved)'] };
    return parsed;
  } catch (err) {
    return { verdict: null, reasons: [`LLM call failed: ${err.message}`] };
  }
}

// ---------------------------------------------------------------------------
// Shell helpers (no shell interpolation anywhere — arg arrays only)
// ---------------------------------------------------------------------------

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

function gh(args, opts = {}) {
  return run('gh', args, opts);
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

// ---------------------------------------------------------------------------
// HARD GATE — clean-worktree test run. No pass, no merge.
// ---------------------------------------------------------------------------

function hardGate(cloneDir, headRef) {
  const wt = mkdtempSync(join(tmpdir(), 'pr-review-'));
  const result = { passed: false, step: null, tail: '' };
  try {
    run('git', ['-C', cloneDir, 'fetch', 'origin', headRef], { timeout: 120_000 });
    run('git', ['-C', cloneDir, 'worktree', 'add', '--detach', wt, 'FETCH_HEAD'], { timeout: 120_000 });
    for (const [step, cmd, args, timeout] of [
      ['npm test', 'npm', ['test'], 900_000],
      ['four-layer-validate', 'node', ['agents/four-layer-validate.mjs'], 300_000],
    ]) {
      result.step = step;
      try {
        run(cmd, args, { cwd: wt, timeout });
      } catch (err) {
        const out = `${err.stdout || ''}\n${err.stderr || ''}`;
        result.tail = out.split('\n').slice(-30).join('\n').slice(-3000);
        return result;
      }
    }
    result.passed = true;
    result.step = null;
    return result;
  } catch (err) {
    result.tail = String(err.message || err).slice(-1500);
    return result;
  } finally {
    try { run('git', ['-C', cloneDir, 'worktree', 'remove', '--force', wt], { timeout: 60_000 }); } catch { /* best effort */ }
    try { rmSync(wt, { recursive: true, force: true }); } catch { /* best effort */ }
    try { run('git', ['-C', cloneDir, 'worktree', 'prune'], { timeout: 60_000 }); } catch { /* best effort */ }
  }
}

// ---------------------------------------------------------------------------
// Dedicated review clone (TOTAL isolation from the main working tree)
// ---------------------------------------------------------------------------
//
// The old completeTaskOnMain pulled/committed/pushed IN the main checkout —
// that raced human/CTO sessions working in the same tree (the exact collision
// behind the runaway incident). All review-side git mutation now happens in a
// persistent dedicated clone (same pattern as the drain's ~/.sdlc-drain-clone),
// so the main working tree and its .git are NEVER mutated by this job.

export const REVIEW_CLONE = process.env.SDLC_REVIEW_CLONE
  || join(homedir(), '.sdlc-review-clone');

/** Provision (once) and hard-refresh the dedicated review clone onto origin/main. */
function ensureReviewClone(repoDir, log) {
  const remoteUrl = run('git', ['-C', repoDir, 'remote', 'get-url', 'origin']).trim();
  if (!existsSync(join(REVIEW_CLONE, '.git'))) {
    log(`creating dedicated review clone at ${REVIEW_CLONE} (one-time)…`);
    run('git', ['clone', '--quiet', remoteUrl, REVIEW_CLONE], { timeout: 300_000 });
  }
  run('git', ['-C', REVIEW_CLONE, 'fetch', '--quiet', 'origin'], { timeout: 120_000 });
  // The clone is fully owned by this job — a hard reset is always safe here.
  run('git', ['-C', REVIEW_CLONE, 'checkout', '-q', '-B', 'main', 'origin/main'], { timeout: 60_000 });
  run('git', ['-C', REVIEW_CLONE, 'reset', '--hard', '-q', 'origin/main'], { timeout: 60_000 });
  run('git', ['-C', REVIEW_CLONE, 'clean', '-fdq'], { timeout: 60_000 });
  return REVIEW_CLONE;
}

// ---------------------------------------------------------------------------
// Queue completion + reconcile (in the clone — never the main tree)
// ---------------------------------------------------------------------------

function completeTaskInClone(repoDir, taskId, log) {
  const clone = ensureReviewClone(repoDir, log);
  const taskFile = join(clone, 'tasks', 'queue', `${taskId}.json`);
  if (!existsSync(taskFile)) return true; // nothing to do
  const task = JSON.parse(readFileSync(taskFile, 'utf8'));
  if (task.status === 'completed') return true;
  try {
    run('node', [join(clone, 'agents', 'queue-drainer.mjs'), 'complete', taskId, 'passing'], { cwd: clone, timeout: 120_000 });
  } catch {
    // queue-drainer may refuse (e.g. never claimed); mark directly — the PR merged.
    task.status = 'completed';
    task.test_status = 'passing';
    task.completedAt = new Date().toISOString();
    writeFileSync(taskFile, JSON.stringify(task, null, 2) + '\n');
  }
  if (!run('git', ['-C', clone, 'status', '--porcelain']).trim()) return true;
  run('git', ['-C', clone, 'add', 'tasks/']);
  run('git', ['-C', clone, 'commit', '-q', '-m', `chore(queue): mark ${taskId} completed (drain PR merged by pr-auto-review)`]);
  // If origin/main advanced since the refresh, the push is rejected (non-ff)
  // — never force. reconcileMerged retries on the next run.
  run('git', ['-C', clone, 'push', 'origin', 'main'], { timeout: 120_000 });
  return true;
}

function reconcileMerged(repoDir, cloneDir, log) {
  let merged;
  try {
    merged = ghJson(['pr', 'list', '--search', 'head:agent/drain/', '--state', 'merged', '--limit', '20', '--json', 'headRefName']);
  } catch { return; }
  for (const pr of merged) {
    const taskId = taskIdFromBranch(pr.headRefName);
    if (!taskId) continue;
    const taskFile = join(cloneDir, 'tasks', 'queue', `${taskId}.json`);
    if (!existsSync(taskFile)) continue;
    const task = JSON.parse(readFileSync(taskFile, 'utf8'));
    if (task.status === 'completed') continue;
    log(`reconcile: ${taskId} merged but still ${task.status} — completing`);
    try { completeTaskInClone(repoDir, taskId, log); } catch (err) { log(`reconcile ${taskId} failed: ${err.message}`); }
  }
}

// ---------------------------------------------------------------------------
// Per-PR review
// ---------------------------------------------------------------------------

function alreadyReviewed(prNumber, headSha) {
  try {
    const { comments } = ghJson(['pr', 'view', String(prNumber), '--json', 'comments']);
    return (comments || []).some(c => (c.body || '').includes(`${COMMENT_MARKER} sha:${headSha}`));
  } catch {
    return false;
  }
}

function postReview(prNumber, headSha, lines, dryRun) {
  const body = `${COMMENT_MARKER} sha:${headSha} -->\n## Automated review (pr-auto-review)\n\n${lines.join('\n')}\n\n_This PR stays open. Fix and push, or a CTO session will pick it up._`;
  if (dryRun) return;
  try { gh(['pr', 'comment', String(prNumber), '--body', body]); } catch { /* comment is best-effort */ }
}

async function reviewPr(pr, ctx) {
  const { repoDir, log, dryRun } = ctx;
  const headSha = pr.headRefOid;
  const record = { ts: new Date().toISOString(), pr: pr.number, branch: pr.headRefName, sha: headSha, action: null, detail: null };

  if (alreadyReviewed(pr.number, headSha)) {
    record.action = 'skip';
    record.detail = 'already reviewed at this head SHA';
    return record;
  }

  // 1) Deterministic scope scan first — cheapest, and gates the guardrail surface.
  const paths = (pr.files || []).map(f => f.path);
  const scope = scanScope(paths);
  if (scope.rejects.length) {
    record.action = 'reject-unsafe';
    record.detail = scope.rejects.join('; ');
    postReview(pr.number, headSha, [
      '**Verdict: REJECTED (unsafe scope)** — this diff touches paths the pipeline may never merge:',
      ...scope.rejects.map(r => `- ${r}`),
    ], dryRun);
    return record;
  }

  // 2) HARD GATE — clean-worktree tests. No pass, no merge. The worktree is
  // created from the dedicated review CLONE so the main repo's .git is never
  // touched (no fetch, no worktree metadata, no FETCH_HEAD races).
  log(`PR #${pr.number} ${pr.headRefName}: running hard gate (clean worktree from review clone)…`);
  const gate = hardGate(ctx.cloneDir, pr.headRefName);
  if (!gate.passed) {
    record.action = 'gate-failed';
    record.detail = gate.step;
    postReview(pr.number, headSha, [
      `**Verdict: NOT MERGED** — hard gate failed at \`${gate.step}\` in a clean worktree.`,
      '```', gate.tail || '(no output captured)', '```',
    ], dryRun);
    return record;
  }

  // 3) Guardrail flag — tests green, but never auto-merge the guardrail surface.
  if (scope.flags.length) {
    record.action = 'flagged';
    record.detail = scope.flags.join('; ');
    postReview(pr.number, headSha, [
      '**Verdict: FLAGGED for human/CTO review** — tests pass in a clean worktree, but this diff touches the guardrail surface, which is never auto-merged:',
      ...scope.flags.map(f => `- \`${f}\``),
    ], dryRun);
    return record;
  }

  // 4) LLM review. (Task context comes from the freshly-refreshed clone.)
  const taskId = taskIdFromBranch(pr.headRefName);
  const taskFile = taskId ? join(ctx.cloneDir, 'tasks', 'queue', `${taskId}.json`) : null;
  const task = taskFile && existsSync(taskFile) ? JSON.parse(readFileSync(taskFile, 'utf8')) : null;
  let diff = '';
  try { diff = gh(['pr', 'diff', String(pr.number)], { maxBuffer: 16 * 1024 * 1024 }); } catch { /* reviewed without diff = soft fail below */ }
  const review = await llmReview({ task, title: pr.title, body: pr.body, diff });

  if (review.verdict !== 'approve') {
    record.action = review.verdict === 'reject' ? 'llm-rejected' : 'llm-unavailable';
    record.detail = review.reasons.join('; ');
    postReview(pr.number, headSha, [
      `**Verdict: NOT MERGED** — hard gate passed, but the LLM review did ${review.verdict === 'reject' ? 'not approve' : 'not complete'}:`,
      ...review.reasons.map(r => `- ${r}`),
    ], dryRun);
    return record;
  }

  // 5) Merge + complete.
  record.action = 'merged';
  record.detail = review.reasons.join('; ') || 'approved';
  if (dryRun) {
    record.action = 'would-merge';
    return record;
  }
  gh(['pr', 'merge', String(pr.number), '--squash', '--delete-branch'], { timeout: 180_000 });
  if (taskId) {
    try { completeTaskInClone(repoDir, taskId, log); } catch (err) { log(`task-complete ${taskId} failed (reconcile will retry): ${err.message}`); }
  }
  return record;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runAutoReview({ dryRun = false } = {}) {
  const { projectDir } = loadConfig();
  const repoDir = projectDir || resolve(__dirname, '..');
  const logDir = join(repoDir, 'pm');
  mkdirSync(logDir, { recursive: true });
  const logFile = join(logDir, 'pr-auto-review.log');
  const log = (msg) => console.log(`[pr-auto-review] ${msg}`);
  const record = (obj) => appendFileSync(logFile, JSON.stringify(obj) + '\n');

  // SHARED atomic mutex (atomic mkdir; stale after 2h) — mutually exclusive with
  // the drain (same path), so only one autonomous git-mutating job runs at a time.
  const lockDir = join(logDir, '.sdlc-autonomous.lock.d');
  const holderFile = join(lockDir, 'holder');
  const readHolder = () => { try { return readFileSync(holderFile, 'utf8').trim(); } catch { return '(unknown)'; } };
  try {
    mkdirSync(lockDir);
  } catch {
    let age = Infinity;
    try { age = Date.now() - statSync(lockDir).mtimeMs; } catch { /* treat as stale */ }
    if (age < 2 * 60 * 60 * 1000) { log(`another run holds the lock (${readHolder()}) — skip`); return []; }
    rmSync(lockDir, { recursive: true, force: true });
    try { mkdirSync(lockDir); } catch { log('lost the lock race — skip'); return []; }
  }
  try { writeFileSync(holderFile, `pr-auto-review ${process.pid} ${new Date().toISOString()}\n`); } catch { /* metadata only */ }

  const results = [];
  try {
    // Provision/refresh the dedicated clone ONCE per run — every git-mutating
    // and repo-reading step below uses it; the main tree is never touched.
    let cloneDir;
    try {
      cloneDir = ensureReviewClone(repoDir, log);
    } catch (err) {
      log(`review clone unavailable — aborting run: ${err.message}`);
      return results;
    }

    reconcileMerged(repoDir, cloneDir, log);

    let prs;
    try {
      prs = ghJson(['pr', 'list', '--search', 'head:agent/drain/', '--state', 'open',
        '--json', 'number,title,body,headRefName,headRefOid,files']);
    } catch (err) {
      log(`gh pr list failed: ${err.message}`);
      return results;
    }
    if (!prs.length) { log('no open drain PRs — nothing to review'); return results; }
    log(`${prs.length} open drain PR(s)`);

    let merges = 0;
    for (const pr of prs.sort((a, b) => a.number - b.number)) {
      if (merges >= MAX_AUTO_MERGES) { log(`merge rate limit (${MAX_AUTO_MERGES}) reached — deferring the rest`); break; }
      let res;
      try {
        res = await reviewPr(pr, { repoDir, cloneDir, log, dryRun });
      } catch (err) {
        res = { ts: new Date().toISOString(), pr: pr.number, branch: pr.headRefName, action: 'error', detail: err.message };
      }
      if (res.action === 'merged') merges++;
      log(`PR #${res.pr}: ${res.action}${res.detail ? ` — ${res.detail}` : ''}`);
      record(res);
      results.push(res);
    }
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
  return results;
}

if (__isMainModule()) {
  const dryRun = process.argv.includes('--dry-run');
  runAutoReview({ dryRun })
    .then(results => {
      const merged = results.filter(r => r.action === 'merged' || r.action === 'would-merge').length;
      console.log(`[pr-auto-review] done — ${results.length} PR(s) processed, ${merged} merged${dryRun ? ' (dry run)' : ''}`);
    })
    .catch(err => { console.error(`[pr-auto-review] fatal: ${err.message}`); process.exit(1); });
}
