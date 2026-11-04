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

import { existsSync, readFileSync, appendFileSync, mkdirSync, rmSync, mkdtempSync, writeFileSync, statSync, renameSync } from 'fs';
import { execFileSync, spawn } from 'child_process';
import { dirname, join, resolve } from 'path';
import { tmpdir, homedir } from 'os';
import { fileURLToPath } from 'url';
import { loadLlmAdapter } from './adapters/load-adapter.mjs';
import { loadConfig } from './load-config.mjs';
import { sendNotification, triggerNotification } from './notify.mjs';

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
  'agents/cron-schedule.json',
  'agents/scheduler-install.mjs',
  'agents/deploy-runner.mjs',
  'agents/deploy-rollback.mjs',
  'tests/pr-auto-review.test.mjs',
  'tests/hermes-drain.test.mjs',
  'tests/deploy-runner.test.mjs',
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
export function taskIdFromBranch(branch, exists = null) {
  // Seeded ids are long and hyphenated (OS-curriculum-v2-conformance-17); the old
  // `[A-Za-z]+-\d+` pattern matched none of them, so no OpenSpec-seeded task was ever
  // marked completed on merge and the drain would redo merged work.
  const m = /^agent\/drain\/([A-Za-z][\w.-]*)$/.exec(branch || '');
  if (!m) return null;
  const rest = m[1];
  if (exists) {
    // Longest prefix that is a real queue task wins (handles any retry suffix).
    const parts = rest.split('-');
    for (let n = parts.length; n >= 2; n--) {
      const id = parts.slice(0, n).join('-');
      if (exists(id)) return id;
    }
  }
  const stripped = rest.replace(/-\d{6,}$/, ''); // drop a timestamp retry suffix
  return /-\d+$/.test(stripped) ? stripped : null;
}

/** Queue-aware resolver: prefer an id that exists in the repo's tasks/queue. */
export function queueTaskIdFromBranch(repoDir, branch) {
  return taskIdFromBranch(branch, (id) => existsSync(join(repoDir, 'tasks', 'queue', `${id}.json`)));
}

// ---------------------------------------------------------------------------
// LLM review
// ---------------------------------------------------------------------------

const IDENTITY_CHAR_LIMIT = 6000;
const RECALL_CHAR_LIMIT = 3000;

/** budget.json agents[REVIEW_AGENT].reviewModel overrides REVIEW_MODEL when set (CV-REQ-123). */
export function reviewModelFor(repoDir) {
  if (!repoDir) return REVIEW_MODEL;
  try {
    const budget = JSON.parse(readFileSync(join(repoDir, 'agents', 'budget.json'), 'utf8'));
    const m = budget?.agents?.[REVIEW_AGENT]?.reviewModel;
    return typeof m === 'string' && m.trim() ? m.trim() : REVIEW_MODEL;
  } catch (err) {
    return REVIEW_MODEL; // no/unreadable budget.json: the default model, by design
  }
}

/**
 * The reviewer's identity block (AGENT.md + memory recall), or '' when the
 * reviewed repo has no AGENT.md. Best-effort: never throws (CV-REQ-123).
 */
export function reviewerIdentityBlock(repoDir) {
  if (!repoDir) return '';
  let identity;
  try {
    identity = readFileSync(join(repoDir, 'agents', REVIEW_AGENT, 'AGENT.md'), 'utf8').trim();
  } catch (err) {
    return '';
  }
  if (!identity) return '';
  if (identity.length > IDENTITY_CHAR_LIMIT) identity = identity.slice(0, IDENTITY_CHAR_LIMIT) + '\n... [identity truncated]';
  let block = `## Your identity (${REVIEW_AGENT})\n${identity}\n\n`;
  try {
    const recalled = execFileSync('node', [join(__dirname, 'memory-manager.mjs'), 'recall', REVIEW_AGENT], {
      cwd: repoDir, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, SDLC_PROJECT_DIR: repoDir },
    }).trim();
    if (recalled) {
      block += `## Your memory (recalled)\n${recalled.length > RECALL_CHAR_LIMIT ? recalled.slice(0, RECALL_CHAR_LIMIT) + '\n... [memory truncated]' : recalled}\n\n`;
    }
  } catch (err) { /* memory is optional context; a recall failure never fails a review */ }
  return block;
}

export function buildReviewPrompt({ task, title, body, diff, repoDir }) {
  const identityBlock = reviewerIdentityBlock(repoDir);
  const taskBlock = task
    ? `## Queue task this PR claims to implement\n${JSON.stringify(task, null, 2)}`
    : '## Queue task\n(no matching queue task found — judge against the PR description alone)';
  const clippedDiff = (diff || '').length > DIFF_CHAR_LIMIT
    ? diff.slice(0, DIFF_CHAR_LIMIT) + '\n... [diff truncated]'
    : (diff || '');
  return `You are the automated code reviewer for the agentic-sdlc framework. Review this pull request produced by an autonomous agent. The full test suite ALREADY PASSED in a clean worktree, and a deterministic safety scan already ran — your job is judgment: correctness, scope fidelity, and safety.

${identityBlock}${taskBlock}

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

async function llmReview({ task, title, body, diff, repoDir }) {
  if (!ensureOpenRouterKey()) return { verdict: null, reasons: ['OPENROUTER_API_KEY unavailable'] };
  let adapter;
  try {
    adapter = await loadLlmAdapter(loadConfig().config, 'openrouter');
  } catch (err) {
    return { verdict: null, reasons: [`adapter load failed: ${err.message}`] };
  }
  // Screen EXTERNAL PR text for prompt-injection BEFORE the reviewer model
  // sees it (curriculum Ph5): a drain agent (or outside contributor) must not
  // be able to steer its own review via the PR title/body.
  try {
    const { screenExternalInput } = await import('./red-team-tester.mjs');
    const t = screenExternalInput(title, { source: 'pr-title' });
    const b = screenExternalInput(body, { source: 'pr-body' });
    title = t.sanitized;
    body = b.sanitized;
    if (!t.safe || !b.safe) {
      const labels = [...t.findings, ...b.findings].filter(f => f.severity === 'high').map(f => f.label);
      return { verdict: 'reject', reasons: [`prompt-injection pattern in PR text (${[...new Set(labels)].join(', ')}) — screened and rejected`] };
    }
  } catch { /* screening unavailable must not approve anything by accident — continue with raw text */ }
  try {
    const res = await adapter.complete(buildReviewPrompt({ task, title, body, diff, repoDir }), {
      model: reviewModelFor(repoDir),
      maxTokens: 1500,
      temperature: 0,
    });
    // Capture realized provider-reported usage in the cost ledger (REQ-H3).
    try {
      const { recordRealizedUsage } = await import('./cost-tracker.mjs');
      recordRealizedUsage(REVIEW_AGENT, task?.id || 'pr-review', res);
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

/** Base branch of the review clone (origin/HEAD), falling back to `main`. */
export function detectBaseBranch(cloneDir) {
  try {
    const b = run('git', ['-C', cloneDir, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])
      .trim().replace(/^origin\//, '');
    if (b) return b;
  } catch { /* fall through */ }
  return 'main';
}

export function hardGate(cloneDir, headRef, testCmd = 'npm test') {
  const wt = mkdtempSync(join(tmpdir(), 'pr-review-'));
  const result = { passed: false, step: null, tail: '' };
  try {
    run('git', ['-C', cloneDir, 'fetch', 'origin', headRef], { timeout: 120_000 });
    run('git', ['-C', cloneDir, 'worktree', 'add', '--detach', wt, 'FETCH_HEAD'], { timeout: 120_000 });
    // CV-REQ-050: test the head MERGED with current base, so a stale branch
    // that passes alone but breaks main fails here. Fail closed: a conflict or
    // any merge error means "not mergeable" and no tests run.
    const base = detectBaseBranch(cloneDir);
    try { run('git', ['-C', cloneDir, 'fetch', 'origin', base], { timeout: 120_000 }); } catch { /* use the clone's last-fetched base */ }
    try {
      // `merge --no-commit` still needs a committer identity (git prepares the
      // merge state/message before stopping), and a headless runner has no
      // global gitconfig — hence "Committer identity unknown". Supply a
      // throwaway identity: nothing is ever committed from this worktree.
      run('git', ['-c', 'user.name=SDLC Review Gate', '-c', 'user.email=review-gate@localhost',
        'merge', '--no-commit', '--no-ff', `origin/${base}`], { cwd: wt, timeout: 120_000 });
    } catch (err) {
      result.step = 'merge-conflict-with-base';
      result.tail = `merging origin/${base} into the PR head failed:\n${`${err.stdout || ''}\n${err.stderr || err.message || ''}`.slice(-1500)}`;
      return result;
    }
    // The gate runs the PROJECT's own test command, not a hardcoded framework
    // one — hermes-pilot's gate is `node tests/smoke.test.mjs`, tally's is
    // vitest (observed live 2026-07-26: hardcoded npm test failed the pilot).
    // Dependencies install only when the project actually declares some — the
    // framework declares none, so its reviews stay install-free and fast.
    const steps = [];
    try {
      const pkg = JSON.parse(readFileSync(join(wt, 'package.json'), 'utf8'));
      if (Object.keys(pkg.dependencies || {}).length || Object.keys(pkg.devDependencies || {}).length) {
        steps.push(['install deps', 'bash', ['-c', existsSync(join(wt, 'package-lock.json')) ? 'npm ci --silent' : 'npm install --silent'], 600_000]);
      }
    } catch { /* no package.json — a zero-dep project is fine */ }
    steps.push([testCmd, 'bash', ['-c', testCmd], 900_000]);
    // Framework-specific validation layer runs only where it exists.
    if (existsSync(join(wt, 'agents', 'four-layer-validate.mjs'))) {
      steps.push(['four-layer-validate', 'node', ['agents/four-layer-validate.mjs'], 300_000]);
    }
    for (const [step, cmd, args, timeout] of steps) {
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
// Merge order (CV-REQ-051): infra, backend, frontend, docs-tests; small first
// ---------------------------------------------------------------------------

/** Merge-order rank: earlier entries merge first. */
export const DOMAIN_ORDER = ['infra', 'backend', 'frontend', 'docs-tests'];

function pathOf(f) { return typeof f === 'string' ? f : (f && f.path) || ''; }

/** Domain of ONE path. Unknown paths rank last (docs-tests). */
function classifyPath(path) {
  const p = String(path).replace(/^\.\//, '');
  const base = p.split('/').pop();
  if (/^\.github\//.test(p) || /^scripts\//.test(p) || /\.sh$/.test(p) || /(^|\/)systemd(\/|$)/.test(p)
    || /cron-schedule/.test(base) || base === 'package.json') return 'infra';
  if (/(^|\/)(tests?|__tests__)\//.test(p) || /\.test\.[cm]?[jt]sx?$/.test(p) || /\.md$/i.test(p)) return 'docs-tests';
  if (/\.(tsx|css)$/.test(p) || /(^|\/)ui\/web\/components\//.test(p)) return 'frontend';
  if (/^agents\/[^/]+\.mjs$/.test(p) || /^lib\//.test(p) || /(^|\/)lib\//.test(p) || /^agents\//.test(p)) return 'backend';
  return 'docs-tests';
}

/** Domain of a PR: the highest-rank (earliest in DOMAIN_ORDER) domain among its files. */
export function classifyDomain(files) {
  let best = DOMAIN_ORDER.length - 1;
  for (const f of files || []) {
    const idx = DOMAIN_ORDER.indexOf(classifyPath(pathOf(f)));
    if (idx >= 0 && idx < best) best = idx;
  }
  return DOMAIN_ORDER[best];
}

/** Pure ordering: domain rank, then additions+deletions ascending, then PR number. */
export function orderPrs(prs) {
  const key = (pr) => ({
    rank: DOMAIN_ORDER.indexOf(classifyDomain(pr.files)),
    size: (Number(pr.additions) || 0) + (Number(pr.deletions) || 0),
    n: pr.number,
  });
  return [...prs].sort((a, b) => {
    const ka = key(a), kb = key(b);
    return ka.rank - kb.rank || ka.size - kb.size || ka.n - kb.n;
  });
}

/**
 * Order PRs for merging, fetching files/sizes per PR via `fetchDetails(number)`
 * (gh pr view --json files,additions,deletions). Any fetch failure falls back
 * to plain number order and says so via `log` — ordering must never block a run.
 */
export function orderPrsWithFetch(prs, fetchDetails, log = () => {}) {
  try {
    const detailed = prs.map(pr => ({ ...pr, ...fetchDetails(pr.number) }));
    return orderPrs(detailed);
  } catch (err) {
    log(`merge-order fetch failed (${err.message}) — falling back to PR number order`);
    return [...prs].sort((a, b) => a.number - b.number);
  }
}

/**
 * Pairs of open PRs that change a common file (CV-REQ-052). `later` is the PR
 * that comes later in merge order (orderPrs); it is the one to defer.
 * Returns [{later, earlier, files}] with PR numbers; disjoint PRs yield [].
 */
export function findOverlaps(prs) {
  const ordered = orderPrs(prs);
  const sets = ordered.map(pr => new Set((pr.files || []).map(pathOf).filter(Boolean)));
  const out = [];
  for (let i = 1; i < ordered.length; i++) {
    for (let j = 0; j < i; j++) {
      const files = [...sets[i]].filter(f => sets[j].has(f)).sort();
      if (files.length) out.push({ later: ordered[i].number, earlier: ordered[j].number, files });
    }
  }
  return out;
}

const DEFERRED_MARKER = '<!-- pr-auto-review-deferred';

/**
 * Is `prNumber` the LATER side of an overlap with a PR that MERGED earlier in
 * this run? Then defer it one run, so its gate runs against the new base.
 * An overlapping earlier PR that did NOT merge (flagged, rejected, errored)
 * never blocks: it may never merge, and deferring behind it would wedge this
 * PR forever — the hardGate already tests head merged with the current base.
 * `mergedThisRun` holds PR numbers merged this run. Returns {earlier, files} or null.
 */
export function deferralFor(prNumber, overlaps, mergedThisRun = new Set()) {
  const hits = (overlaps || []).filter(o => o.later === prNumber && mergedThisRun.has(o.earlier));
  if (!hits.length) return null;
  const earlier = [...new Set(hits.map(h => h.earlier))].sort((a, b) => a - b);
  const files = [...new Set(hits.flatMap(h => h.files))].sort();
  return { earlier, files };
}

export function buildDeferralComment({ earlier, files }) {
  return `${DEFERRED_MARKER} earlier:${earlier.join(',')} -->\n## Deferred (pr-auto-review)\n\n`
    + `This PR changes files that ${earlier.map(n => `#${n}`).join(', ')} just merged:\n`
    + `${files.map(f => `- \`${f}\``).join('\n')}\n\n`
    + '_No action needed: this is not a rejection. The next run gates this PR against the new base._';
}

/** Post the deferral comment once per (PR, earlier set). Best-effort; returns true if posted. */
export function postDeferralOnce(prNumber, deferral, dryRun, deps = { ghJson, gh }) {
  const body = buildDeferralComment(deferral);
  const marker = body.split('\n')[0];
  try {
    const { comments } = deps.ghJson(['pr', 'view', String(prNumber), '--json', 'comments']);
    if ((comments || []).some(c => (c.body || '').includes(marker))) return false;
  } catch { /* cannot tell: fall through and risk one duplicate rather than none */ }
  if (dryRun) return false;
  try { deps.gh(['pr', 'comment', String(prNumber), '--body', body]); return true; } catch { return false; }
}

// ---------------------------------------------------------------------------
// CHANGELOG (CV-REQ-053)
// ---------------------------------------------------------------------------

/** One changelog line: `- <date> #<pr> <subject> (<domain>)`. */
export function formatChangelogEntry({ date, pr, subject, domain }) {
  return `- ${date} #${pr} ${String(subject || '').replace(/\s+/g, ' ').trim()} (${domain})`;
}

/**
 * Append an entry object ({date, pr, subject, domain}) to a CHANGELOG file.
 * Creates the file with a `# Changelog` header; groups lines under a
 * `## <date>` heading (newest date first); idempotent per PR number.
 * Returns true when the file changed.
 */
export function appendChangelog(path, entry) {
  const line = formatChangelogEntry(entry);
  let text = existsSync(path) ? readFileSync(path, 'utf8') : '# Changelog\n';
  if (new RegExp(`^- \\S+ #${entry.pr} `, 'm').test(text)) return false;
  const heading = `## ${entry.date}`;
  const lines = text.replace(/\s+$/, '').split('\n');
  const hIdx = lines.indexOf(heading);
  if (hIdx >= 0) {
    // after the last line of this date's section (up to the next heading)
    let end = hIdx + 1;
    while (end < lines.length && !/^## /.test(lines[end])) end++;
    while (end > hIdx + 1 && lines[end - 1].trim() === '') end--;
    lines.splice(end, 0, line);
  } else {
    // newest date goes right below the title
    const titleIdx = lines.findIndex(l => /^# /.test(l));
    lines.splice(titleIdx + 1, 0, '', heading, '', line);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n');
  return true;
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

// PER-PROJECT (like ~/.sdlc-drain-clone-<name> and ~/.sdlc-deploy-clone-<name>).
// A single shared clone keeps the FIRST project's origin forever — observed
// live 2026-07-26: reviewing hermes-pilot fetched agent/drain/PILOT-001 from
// the framework repo's origin and failed the gate on "couldn't find remote ref".
export function reviewCloneDir(repoDir) {
  return process.env.SDLC_REVIEW_CLONE
    || join(homedir(), `.sdlc-review-clone-${repoDir.split('/').filter(Boolean).pop()}`);
}

/** Provision (once) and hard-refresh the dedicated review clone onto the remote base branch. */
function ensureReviewClone(repoDir, log) {
  const cloneDir = reviewCloneDir(repoDir);
  const remoteUrl = run('git', ['-C', repoDir, 'remote', 'get-url', 'origin']).trim();
  if (!existsSync(join(cloneDir, '.git'))) {
    log(`creating dedicated review clone at ${cloneDir} (one-time)…`);
    run('git', ['clone', '--quiet', remoteUrl, cloneDir], { timeout: 300_000 });
  }
  run('git', ['-C', cloneDir, 'fetch', '--quiet', 'origin'], { timeout: 120_000 });
  // Base branch is DETECTED (origin/HEAD), not assumed — tally defaults to
  // master; hardcoded main was the drain's exact bug (drain-multi-project).
  let base = '';
  try {
    base = run('git', ['-C', cloneDir, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']).trim().replace(/^origin\//, '');
  } catch { /* fall through */ }
  if (!base) {
    try { run('git', ['-C', cloneDir, 'remote', 'set-head', 'origin', '-a'], { timeout: 60_000 }); } catch { /* offline */ }
    try {
      base = run('git', ['-C', cloneDir, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']).trim().replace(/^origin\//, '');
    } catch { /* fall through */ }
  }
  base = base || 'main';
  // The clone is fully owned by this job — a hard reset is always safe here.
  // -f: never let leftover dirty state (e.g. an interrupted completion) block
  // the refresh — the same failure mode hit the drain clone (2026-07-06).
  run('git', ['-C', cloneDir, 'checkout', '-q', '-f', '-B', base, `origin/${base}`], { timeout: 60_000 });
  run('git', ['-C', cloneDir, 'reset', '--hard', '-q', `origin/${base}`], { timeout: 60_000 });
  run('git', ['-C', cloneDir, 'clean', '-fdq'], { timeout: 60_000 });
  return cloneDir;
}

// ---------------------------------------------------------------------------
// Queue completion + reconcile (in the clone — never the main tree)
// ---------------------------------------------------------------------------

/**
 * Mark the queue task completed in the review clone and push. `changelog`
 * ({date, pr, subject, domain}, optional) rides the SAME commit/push so no new
 * push path to main exists (CV-REQ-053).
 */
/**
 * Tick the task's checkbox in its OpenSpec tasks.md, so the spec stops claiming merged
 * work is open. The queue entry's description starts with the original bullet
 * (`- [ ] **CV-116**: ...`); `source` is `openspec/<change>/tasks.md`. Returns true when
 * a box was ticked. Never throws — a missing file or id is a no-op.
 */
export function tickTaskInSpec(root, task) {
  try {
    const id = (/\*\*([\w.-]+)\*\*/.exec(task.description || '') || [])[1];
    const change = (/^openspec\/([^/]+)\/tasks\.md$/.exec(task.source || '') || [])[1];
    if (!id || !change) return false;
    const file = join(root, 'openspec', 'changes', change, 'tasks.md');
    if (!existsSync(file)) return false;
    const md = readFileSync(file, 'utf8');
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^(\\s*- )\\[ \\]( \\*\\*${esc}\\*\\*)`, 'm');
    if (!re.test(md)) return false;
    writeFileSync(file, md.replace(re, '$1[x]$2'));
    return true;
  } catch { return false; }
}

export function completeTaskInClone(repoDir, taskId, log, changelog = null) {
  const clone = ensureReviewClone(repoDir, log);
  const taskFile = taskId ? join(clone, 'tasks', 'queue', `${taskId}.json`) : null;
  const task = taskFile && existsSync(taskFile) ? JSON.parse(readFileSync(taskFile, 'utf8')) : null;
  if (task && task.status !== 'completed') {
    try {
      // SDLC_PROJECT_DIR must point at the CLONE: under systemd it is exported
      // pointing at the main repo, and load-config.mjs prefers it over CWD —
      // without this override the completion would be written into the MAIN
      // working tree (single-writer violation observed live 2026-07-06).
      run('node', [join(clone, 'agents', 'queue-drainer.mjs'), 'complete', taskId, 'passing'],
        { cwd: clone, timeout: 120_000, env: { ...process.env, SDLC_PROJECT_DIR: clone } });
    } catch {
      // queue-drainer may refuse (e.g. never claimed); mark directly — the PR merged.
      task.status = 'completed';
      task.test_status = 'passing';
      task.completedAt = new Date().toISOString();
      writeFileSync(taskFile, JSON.stringify(task, null, 2) + '\n');
    }
  }
  if (task) tickTaskInSpec(clone, task);
  if (changelog) appendChangelog(join(clone, 'CHANGELOG.md'), changelog);
  if (!run('git', ['-C', clone, 'status', '--porcelain']).trim()) return true;
  run('git', ['-C', clone, 'add', 'tasks/', ...(existsSync(join(clone, 'openspec')) ? ['openspec/'] : [])]);
  if (changelog) run('git', ['-C', clone, 'add', 'CHANGELOG.md']);
  run('git', ['-C', clone, 'commit', '-q', '-m', changelog
    ? `chore(queue): mark ${taskId || `PR #${changelog.pr}`} completed + changelog #${changelog.pr} (drain PR merged by pr-auto-review)`
    : `chore(queue): mark ${taskId} completed (drain PR merged by pr-auto-review)`]);
  // If origin/main advanced since the refresh, the push is rejected (non-ff)
  // — never force. reconcileMerged retries on the next run.
  run('git', ['-C', clone, 'push', 'origin', 'main'], { timeout: 120_000 });
  return true;
}

// ---------------------------------------------------------------------------
// Self-healing: rejected PRs become CRITICAL fix tasks (REQ-SH-1)
// ---------------------------------------------------------------------------

/** Rejection kinds that produce a fix task. Adapter outages (llm-unavailable)
 *  and human-only outcomes (reject-unsafe, flagged) never do. */
export const FIXABLE_ACTIONS = ['gate-failed', 'llm-rejected'];

/**
 * Pure builder for a FIX-<pr> queue task (exported for tests).
 * Pass `existing` to refresh a prior fix task after a re-rejection at a new SHA.
 */
export function buildFixTask({ pr, branch, headSha, reasons, kind, existing }) {
  const sourceTask = taskIdFromBranch(branch);
  const feedback = (reasons || []).map(r => `- ${r}`).join('\n')
    || '- (no detail captured — read the PR review comment)';
  const description = [
    `Drain PR #${pr} (branch \`${branch}\`) was NOT merged by pr-auto-review (${kind}).`,
    `Repair it ON THE EXISTING BRANCH — do NOT create a new branch or a second PR:`,
    `1. \`git fetch origin ${branch} && git checkout ${branch}\``,
    `2. Address EVERY reason below.`,
    `3. Run \`npm test\` until green.`,
    `4. Commit and \`git push origin ${branch}\` — the reviewer re-reviews at the new SHA.`,
    '',
    '## Rejection reasons (verbatim)',
    feedback,
  ].join('\n');
  const base = existing || {
    id: `FIX-${pr}`,
    phase: 1,
    title: `Fix rejected drain PR #${pr} (${branch})`,
    assignee: 'sdlc-developer',
    priority: 'CRITICAL',
    estimatedTokens: 16000,
    files: [],
    blockedBy: [],
    created: new Date().toISOString(),
    tags: ['auto-fix'],
  };
  // CV-REQ-035: count rejections; the third hands the PR to a human instead of
  // re-queuing a repair the cheap model has already failed twice (no endless loop).
  const attempts = (existing?.attempts || 0) + 1;
  const exhausted = attempts >= MAX_FIX_ATTEMPTS;
  return {
    ...base,
    description,
    attempts,
    status: exhausted ? 'blocked' : 'pending',
    ...(exhausted ? { blockedReason: `needs-human: PR #${pr} rejected ${attempts}x (${kind}) — the drain will not retry it` } : {}),
    fixFor: { pr, branch, headSha, sourceTask, rejectionKind: kind },
    ...(existing ? { refreshedAt: new Date().toISOString() } : {}),
  };
}

export const MAX_FIX_ATTEMPTS = 3;

/** Upsert FIX-<pr> in the review clone and push to main (REQ-SH-1). */
function upsertFixTaskInClone(repoDir, prInfo, log) {
  const clone = ensureReviewClone(repoDir, log);
  const taskFile = join(clone, 'tasks', 'queue', `FIX-${prInfo.pr}.json`);
  let existing = null;
  if (existsSync(taskFile)) {
    try { existing = JSON.parse(readFileSync(taskFile, 'utf8')); } catch { existing = null; }
    // Same head SHA already filed and still pending → nothing new to say.
    if (existing?.fixFor?.headSha === prInfo.headSha && existing.status === 'pending') return false;
  }
  const task = buildFixTask({ ...prInfo, existing });
  writeFileSync(taskFile, JSON.stringify(task, null, 2) + '\n');
  run('git', ['-C', clone, 'add', 'tasks/']);
  run('git', ['-C', clone, 'commit', '-q', '-m',
    `chore(queue): file ${task.id} — drain PR #${prInfo.pr} ${prInfo.kind} (self-healing loop)`]);
  // Non-ff push fails safe; the next run retries (same semantics as completion).
  run('git', ['-C', clone, 'push', 'origin', 'main'], { timeout: 120_000 });
  if (task.status === 'blocked') {
    log(`${task.id} exhausted (${task.attempts} rejections) — blocked for a human`);
    try { triggerNotification('blocker', `🙋 PR #${prInfo.pr} rejected ${task.attempts}x — the drain stopped retrying. Needs a human (or an interactive Claude session).`); } catch { /* best-effort */ }
    return true;
  }
  log(`filed ${task.id} (${prInfo.kind}) — the drain will repair PR #${prInfo.pr} on its existing branch`);
  return true;
}

// ---------------------------------------------------------------------------
// Claude review queue (CV-REQ-100..103): PRs the cheap tier must not merge
// are queued for an interactive Claude session. Runtime file, gitignored.
// ---------------------------------------------------------------------------

export function claudeQueuePath(repoDir) {
  return join(repoDir, 'pm', 'claude-review-queue.json');
}

export function readClaudeQueue(path) {
  try {
    const q = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(q) ? q : [];
  } catch { return []; }
}

export function writeClaudeQueue(path, entries) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(entries, null, 2) + '\n');
  renameSync(tmp, path);
}

/**
 * Upsert a queue entry keyed by (pr, headSha). A new headSha for the same PR
 * marks older OPEN entries `superseded`. Same key is never duplicated (an
 * existing entry keeps its status/notifiedAt).
 * @returns {{ entry: object, created: boolean }}
 */
export function enqueueClaudeReview(entry, { path, now = () => new Date().toISOString() } = {}) {
  const q = readClaudeQueue(path);
  const found = q.find(e => e.pr === entry.pr && e.headSha === entry.headSha);
  if (found) return { entry: found, created: false };
  for (const e of q) {
    if (e.pr === entry.pr && e.status === 'open') e.status = 'superseded';
  }
  const fresh = {
    pr: entry.pr,
    branch: entry.branch,
    headSha: entry.headSha,
    reasons: entry.reasons || [],
    flaggedAt: entry.flaggedAt || now(),
    notifiedAt: null,
    status: 'open',
  };
  q.push(fresh);
  writeClaudeQueue(path, q);
  return { entry: fresh, created: true };
}

function updateClaudeEntry(path, pr, headSha, patch) {
  const q = readClaudeQueue(path);
  const e = q.find(x => x.pr === pr && x.headSha === headSha);
  if (!e) return null;
  Object.assign(e, patch);
  writeClaudeQueue(path, q);
  return e;
}

/** True when (pr, headSha) is an OPEN queue entry. */
export function isAwaitingClaude(pr, headSha, path) {
  return readClaudeQueue(path).find(e => e.pr === pr && e.headSha === headSha && e.status === 'open') || null;
}

export function claudeNoticeText(entry, title) {
  return `🔎 PR #${entry.pr}${title ? ` "${title}"` : ''} needs a Claude review — flagged: ${(entry.reasons || []).join('; ') || '(no reason recorded)'}. Run /sdlc-review-flagged`;
}

/**
 * Send the one-time notice for an entry without a notifiedAt. Never throws;
 * notifiedAt is set only when the notifier reports success, so a failure is
 * retried on the next pass.
 */
export function notifyClaudeReviewOnce(entry, { path, title, notify = (m) => triggerNotification('blocker', m) } = {}) {
  if (entry.notifiedAt) return false;
  try {
    if (!notify(claudeNoticeText(entry, title))) return false;
    const stamp = new Date().toISOString();
    entry.notifiedAt = stamp;
    updateClaudeEntry(path, entry.pr, entry.headSha, { notifiedAt: stamp });
    return true;
  } catch { return false; }
}

/**
 * On a `flagged` verdict: enqueue for Claude and send the single notice.
 * Best-effort — never throws, never blocks the review record.
 */
export function queueFlaggedPr(pr, headSha, reasons, { repoDir, queuePath, notify, log = () => {} }) {
  try {
    const path = queuePath || claudeQueuePath(repoDir);
    const { entry } = enqueueClaudeReview(
      { pr: pr.number, branch: pr.headRefName, headSha, reasons }, { path });
    return notifyClaudeReviewOnce(entry, { path, title: pr.title, notify });
  } catch (err) {
    log(`claude-review enqueue for PR #${pr.number} failed (non-fatal): ${err.message}`);
    return false;
  }
}

function reconcileMerged(repoDir, cloneDir, log) {
  let merged;
  try {
    merged = ghJson(['pr', 'list', '--search', 'head:agent/drain/', '--state', 'merged', '--limit', '20', '--json', 'headRefName,number']);
  } catch { return; }
  for (const pr of merged) {
    const taskId = queueTaskIdFromBranch(repoDir, pr.headRefName);
    // A merged PR also closes its FIX-<pr> task, if one was filed (REQ-SH-3).
    for (const id of [taskId, `FIX-${pr.number}`]) {
      if (!id) continue;
      const taskFile = join(cloneDir, 'tasks', 'queue', `${id}.json`);
      if (!existsSync(taskFile)) continue;
      const task = JSON.parse(readFileSync(taskFile, 'utf8'));
      if (task.status === 'completed') continue;
      log(`reconcile: ${id} merged but still ${task.status} — completing`);
      try { completeTaskInClone(repoDir, id, log); } catch (err) { log(`reconcile ${id} failed: ${err.message}`); }
    }
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

/** Best-effort self-healing hook: file/refresh the FIX task for a declined PR.
 *  Failure to file must never break the review run itself. */
function fileFixTask(pr, headSha, reasons, kind, ctx) {
  if (ctx.dryRun) return;
  try {
    upsertFixTaskInClone(ctx.repoDir, {
      pr: pr.number,
      branch: pr.headRefName,
      headSha,
      reasons: (reasons || []).filter(Boolean),
      kind,
    }, ctx.log);
  } catch (err) {
    ctx.log(`fix-task filing for PR #${pr.number} failed (non-fatal): ${err.message}`);
  }
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

  // 0) Overlap with an earlier open PR (CV-REQ-052): defer, never reject —
  // no rejection count, no FIX task; reviewed normally once the earlier one lands.
  const deferral = deferralFor(pr.number, ctx.overlaps, ctx.mergedThisRun);
  if (deferral) {
    record.action = 'deferred-overlap';
    record.detail = `overlaps ${deferral.earlier.map(n => `#${n}`).join(', ')}: ${deferral.files.join(', ')}`;
    postDeferralOnce(pr.number, deferral, dryRun);
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
  const gate = hardGate(ctx.cloneDir, pr.headRefName, ctx.testCmd);
  if (!gate.passed) {
    record.action = 'gate-failed';
    record.detail = gate.step;
    postReview(pr.number, headSha, [
      `**Verdict: NOT MERGED** — hard gate failed at \`${gate.step}\` in a clean worktree.`,
      '```', gate.tail || '(no output captured)', '```',
    ], dryRun);
    fileFixTask(pr, headSha, [`hard gate failed at ${gate.step}`, gate.tail || ''], 'gate-failed', ctx);
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
    if (!dryRun) queueFlaggedPr(pr, headSha, scope.flags, ctx);
    return record;
  }

  // 4) LLM review. (Task context comes from the freshly-refreshed clone.)
  const taskId = queueTaskIdFromBranch(repoDir, pr.headRefName);
  const taskFile = taskId ? join(ctx.cloneDir, 'tasks', 'queue', `${taskId}.json`) : null;
  const task = taskFile && existsSync(taskFile) ? JSON.parse(readFileSync(taskFile, 'utf8')) : null;
  let diff = '';
  try { diff = gh(['pr', 'diff', String(pr.number)], { maxBuffer: 16 * 1024 * 1024 }); } catch { /* reviewed without diff = soft fail below */ }
  const review = await llmReview({ task, title: pr.title, body: pr.body, diff, repoDir: ctx.cloneDir || repoDir });

  if (review.verdict !== 'approve') {
    record.action = review.verdict === 'reject' ? 'llm-rejected' : 'llm-unavailable';
    record.detail = review.reasons.join('; ');
    postReview(pr.number, headSha, [
      `**Verdict: NOT MERGED** — hard gate passed, but the LLM review did ${review.verdict === 'reject' ? 'not approve' : 'not complete'}:`,
      ...review.reasons.map(r => `- ${r}`),
    ], dryRun);
    if (record.action === 'llm-rejected') {
      fileFixTask(pr, headSha, review.reasons, 'llm-rejected', ctx);
    }
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
  {
    const changelog = {
      date: new Date().toISOString().slice(0, 10),
      pr: pr.number,
      subject: pr.title,
      domain: classifyDomain(pr.files),
    };
    try { completeTaskInClone(repoDir, taskId, log, changelog); } catch (err) { log(`task-complete ${taskId} failed (reconcile will retry): ${err.message}`); }
  }
  // Best-effort notify (openspec: telegram-activation) — the merge already
  // happened; a notification failure must not fail the run or the record.
  // Config-gated: sendNotification() bypasses notification.triggers entirely,
  // so this fired on every merge no matter how the triggers were set. Routed
  // through triggerNotification so `mergeComplete: false` actually silences it
  // (an absent trigger is also off).
  try { triggerNotification('mergeComplete', `✅ auto-merged PR #${pr.number}: ${pr.title}`); } catch { /* notify is best-effort */ }
  // Fire-and-forget deploy-runner kick (openspec: autonomous-deploy-pipeline
  // REQ-007) — a latency optimization only; the reconcile timer is the safety
  // net, and the merge outcome must never depend on the deploy path.
  try {
    spawn('node', [join(__dirname, 'deploy-runner.mjs'), '--project-dir', repoDir],
      { detached: true, stdio: 'ignore' }).unref();
  } catch { /* reconcile timer will catch it */ }
  return record;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runAutoReview({ dryRun = false } = {}) {
  const { projectDir, testCmd } = loadConfig();
  const repoDir = projectDir || resolve(__dirname, '..');
  // gh resolves the target repo from the process cwd. The systemd unit's
  // WorkingDirectory is the FRAMEWORK repo, so reviewing another project
  // (SDLC_PROJECT_DIR=~/hermes-pilot) would silently list the framework's PRs
  // — observed live 2026-07-26: pilot PR #1 open, review said "no open drain
  // PRs". Pin the cwd to the project under review.
  process.chdir(repoDir);
  const logDir = join(repoDir, 'pm');
  mkdirSync(logDir, { recursive: true });
  const logFile = join(logDir, 'pr-auto-review.log');
  const log = (msg) => console.log(`[pr-auto-review] ${msg}`);
  const record = (obj) => appendFileSync(logFile, JSON.stringify(obj) + '\n');

  // SHARED atomic mutex (atomic mkdir; stale after 2h) — mutually exclusive with
  // the drain (same path), so only one autonomous git-mutating job runs at a
  // time HOST-WIDE. Pinned to the FRAMEWORK repo (like hermes-drain.sh), not
  // the project under review: reviewing ~/tally must still exclude a framework
  // drain. Override: SDLC_LOCK_DIR (openspec: autonomous-deploy-pipeline REQ-006).
  const lockDir = process.env.SDLC_LOCK_DIR || join(resolve(__dirname, '..'), 'pm', '.sdlc-autonomous.lock.d');
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
    const ordered = orderPrsWithFetch(prs,
      (n) => ghJson(['pr', 'view', String(n), '--json', 'files,additions,deletions']), log);
    const overlaps = findOverlaps(ordered);
    const mergedThisRun = new Set();
    for (const pr of ordered) {
      if (merges >= MAX_AUTO_MERGES) { log(`merge rate limit (${MAX_AUTO_MERGES}) reached — deferring the rest`); break; }
      let res;
      try {
        res = await reviewPr(pr, { repoDir, cloneDir, log, dryRun, testCmd, overlaps, mergedThisRun });
      } catch (err) {
        res = { ts: new Date().toISOString(), pr: pr.number, branch: pr.headRefName, action: 'error', detail: err.message };
      }
      if (res.action === 'merged') { merges++; mergedThisRun.add(pr.number); }
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
