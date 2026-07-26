#!/usr/bin/env node
/**
 * Tests for the autonomous drain — hermes-drain.sh guards + drain-prompt.md
 * safety contract. The script is a shell orchestrator, so we assert its
 * structural guards and exercise its safe no-op path (running on a non-main
 * branch must skip WITHOUT invoking any LLM).
 *
 * Run: node tests/hermes-drain.test.mjs
 */

import { readFileSync, existsSync, statSync, constants, mkdtempSync, rmSync } from 'fs';
import { accessSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = resolve(root, 'agents/hermes-drain.sh');
const prompt = resolve(root, 'agents/drain-prompt.md');

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try { fn(); console.log('OK'); passed++; }
  catch (err) { console.log('FAIL'); failures.push({ name, err: err.message }); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

console.log('hermes-drain tests');

test('drain script exists and is executable', () => {
  assert(existsSync(script), 'hermes-drain.sh missing');
  accessSync(script, constants.X_OK); // throws if not executable
});

test('drain script carries the core safety guards', () => {
  const s = readFileSync(script, 'utf8');
  assert(/git clone/.test(s) && /DRAIN_CLONE/.test(s), 'must isolate work in a DEDICATED clone (separate .git + tree; main repo never touched)');
  assert(/Ready \\?\(unblocked\\?\)/.test(s), 'must cost-gate on ready-task count');
  assert(/head:agent\/drain\//.test(s) && /MAX_OPEN_DRAIN_PRS/.test(s), 'must cap unreviewed drain PRs');
  assert(/mkdir "\$LOCKDIR"/.test(s) && /\.sdlc-autonomous\.lock/.test(s), 'must use the SHARED atomic (mkdir) mutex (mutually exclusive with pr-auto-review)');
  assert(/pgrep -f 'timeout 3600 hermes'/.test(s), 'must have a pgrep backstop against a live concurrent worker');
  assert(/HERMES_HOME="\$DRAIN_HOME"/.test(s) && /TERMINAL_ENV=local/.test(s), 'must use the isolated local-backend profile');
  assert(/checkout -q -f -B "\$BASE_BRANCH" "origin\/\$BASE_BRANCH"/.test(s), 'clone refresh must FORCE checkout the RESOLVED base branch — the previous worker legitimately leaves the clone dirty (regression: 2026-07-06 "clone checkout failed")');
  assert(/SDLC_PROJECT_DIR="\$DRAIN_CLONE"/.test(s), 'worker invocation must pin SDLC_PROJECT_DIR to the clone — the systemd unit exports it pointing at the main repo, which made workers dirty the MAIN tree (regression: 2026-07-06)');
  assert(/pending_fixes/.test(s) && /-ge "\$MAX_OPEN_DRAIN_PRS" \] && \[ "\$\{pending_fixes:-0\}" -eq 0 \]/.test(s),
    'the unreviewed-PR cap must NOT starve self-healing: pending FIX-* tasks bypass it (REQ-SH-2)');
});

test('drain prompt carries the self-healing fix-task procedure (REQ-SH-2)', () => {
  const p = readFileSync(prompt, 'utf8');
  assert(/## Fix tasks/.test(p), 'must have a Fix tasks section');
  assert(/never skip a `FIX-\*` task for having an open PR/i.test(p), 'open-PR skip rule must exempt FIX-* tasks');
  assert(/Do NOT create a new branch and do NOT open a new PR/i.test(p), 'fixes go to the EXISTING branch, never a second PR');
  assert(/fixFor/.test(p), 'must point the worker at the fixFor metadata');
  assert(/pushed fix for PR/.test(p), 'must define the fix-complete output contract');
});

test('drain prompt encodes the hard constraints (PR-gate, never main, one task)', () => {
  const p = readFileSync(prompt, 'utf8');
  assert(/never (commit to|touch|merge)/i.test(p), 'must forbid touching/merging main');
  assert(/never .*force-push|force-push/i.test(p), 'must forbid force-push');
  assert(/pull request|gh pr create/i.test(p) && /do ?n.?o?t merge|never .*merge/i.test(p), 'must open a PR but never merge');
  assert(/one task per run|exactly \*\*one\*\*|ONE ready task/i.test(p), 'must limit to one task per run');
  assert(/rm -rf/.test(p), 'must explicitly forbid destructive commands');
});

test('cost gate makes it a safe no-op with no ready tasks (no LLM call)', () => {
  // HERMETIC: point SDLC_REPO at a throwaway git repo with no queue-drainer.
  // The cost gate must resolve zero ready tasks and skip with exit 0, never
  // reaching the Hermes invocation. Never run the script against the real repo
  // from tests — it could launch a live LLM drain worker.
  const tmp = mkdtempSync(join(tmpdir(), 'drain-noop-'));
  try {
    const git = (...args) => execFileSync('git', args, { cwd: tmp, encoding: 'utf8' });
    git('init', '-q', '-b', 'main');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
    const out = execFileSync('bash', [script], {
      cwd: tmp,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, SDLC_REPO: tmp },
    });
    assert(/skip/i.test(out), `expected a skip message, got: ${out}`);
    assert(!/invoking Hermes/.test(out), 'must not invoke Hermes when guards fail');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('the shared mutex makes it a safe no-op when held (drain XOR auto-review)', () => {
  // Pre-create the shared lock dir; the script must detect it and skip.
  const tmp = mkdtempSync(join(tmpdir(), 'drain-lock-'));
  try {
    const git = (...args) => execFileSync('git', args, { cwd: tmp, encoding: 'utf8' });
    git('init', '-q', '-b', 'main');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
    execFileSync('mkdir', ['-p', join(tmp, 'pm', '.sdlc-autonomous.lock.d')]);
    const out = execFileSync('bash', [script], {
      cwd: tmp, encoding: 'utf8', timeout: 30000, env: { ...process.env, SDLC_REPO: tmp },
    });
    assert(/mutex held|skip/i.test(out), `expected a mutex-held skip, got: ${out}`);
    assert(!/invoking Hermes/.test(out), 'must not invoke Hermes when the mutex is held');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// --- drain-multi-project (REQ-005..008): drain ANY project, not just this repo ---

test('framework scripts resolve independently of the drain target (REQ-005)', () => {
  const s = readFileSync(script, 'utf8');
  assert(/SCRIPTS_DIR="\$\(cd "\$\(dirname "\$\{BASH_SOURCE\[0\]\}"\)" && pwd\)"/.test(s),
    'SCRIPTS_DIR must derive from the script\'s OWN location — the systemd unit\'s CWD is not guaranteed');
  assert(/node "\$SCRIPTS_DIR\/queue-drainer\.mjs" status --project-dir "\$REPO"/.test(s),
    'the cost gate must invoke the framework drainer from SCRIPTS_DIR with --project-dir, NOT as a path relative to the drain target (a bootstrapped project has no framework .mjs scripts)');
  assert(!/node agents\/queue-drainer\.mjs/.test(s),
    'must not invoke queue-drainer relative to the drain target');
  assert(/SDLC_DRAIN_PROMPT/.test(s) && /\$\{SCRIPTS_DIR\}\/drain-prompt\.md/.test(s),
    'prompt must fall back to the framework prompt when the project has none');
});

test('a FAILING cost gate never reports "no ready tasks" (REQ-006)', () => {
  const s = readFileSync(script, 'utf8');
  assert(!/queue-drainer\.mjs status[^\n]*2>\/dev\/null/.test(s),
    'must NOT discard the status command\'s stderr — that is what laundered a crash into "no ready tasks"');
  assert(/status_rc" -ne 0/.test(s) && /exit 1/.test(s),
    'a non-zero status exit must exit non-zero so systemd records a failure');
  assert(/-z "\$ready" \]/.test(s),
    'unparseable output must be an ERROR, not silently treated as zero');

  // Behavioral: reproduce the ORIGINAL bug exactly — run a copy of the script
  // from a directory where queue-drainer.mjs does not exist, so the status
  // command genuinely crashes ("Cannot find module"). Before the fix this
  // printed "no ready tasks — skip" and exited 0.
  const tmp = mkdtempSync(join(tmpdir(), 'drain-badgate-'));
  const lock = mkdtempSync(join(tmpdir(), 'drain-lockdir-'));
  try {
    const fakeScripts = join(tmp, 'agents');
    execFileSync('mkdir', ['-p', fakeScripts]);
    execFileSync('cp', [script, join(fakeScripts, 'hermes-drain.sh')]);
    execFileSync('mkdir', ['-p', join(tmp, 'pm')]);
    const git = (...args) => execFileSync('git', args, { cwd: tmp, encoding: 'utf8' });
    git('init', '-q', '-b', 'main');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');

    let out = '', code = 0;
    try {
      out = execFileSync('bash', [join(fakeScripts, 'hermes-drain.sh'), '--dry-run'], {
        cwd: tmp, encoding: 'utf8', timeout: 60000,
        env: { ...process.env, SDLC_REPO: tmp, SDLC_LOCK_DIR: join(lock, 'l.d') },
      });
    } catch (e) { out = `${e.stdout || ''}${e.stderr || ''}`; code = e.status ?? 1; }
    assert(!/no ready tasks/.test(out),
      `a crashing gate must NOT claim an empty queue, got: ${out}`);
    assert(code !== 0, `a crashing gate must exit non-zero, got exit ${code}: ${out}`);
    assert(/FAILED/.test(out), `the failure must be reported, got: ${out}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(lock, { recursive: true, force: true });
  }
});

test('base branch is detected from origin/HEAD, not hardcoded (REQ-007)', () => {
  const s = readFileSync(script, 'utf8');
  assert(/symbolic-ref --quiet --short refs\/remotes\/origin\/HEAD/.test(s),
    'base branch must be read from origin/HEAD');
  assert(/SDLC_BASE_BRANCH/.test(s), 'SDLC_BASE_BRANCH must override detection');
  assert(/BASE_BRANCH="\$\{BASE_BRANCH:-main\}"/.test(s), 'main survives only as a last-resort fallback');
  assert(!/origin\/main/.test(s), 'no hardcoded origin/main may remain');

  // Behavioral: a repo whose origin/HEAD is `master` must resolve to master.
  const tmp = mkdtempSync(join(tmpdir(), 'drain-branch-'));
  try {
    const upstream = join(tmp, 'up.git'), clone = join(tmp, 'clone');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'master', upstream]);
    const seed = join(tmp, 'seed');
    execFileSync('git', ['init', '-q', '-b', 'master', seed]);
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: seed });
    execFileSync('git', ['remote', 'add', 'origin', upstream], { cwd: seed });
    execFileSync('git', ['push', '-q', 'origin', 'master'], { cwd: seed });
    execFileSync('git', ['clone', '-q', upstream, clone]);
    const detected = execFileSync('git', ['-C', clone, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { encoding: 'utf8' }).trim();
    assert(detected === 'origin/master', `expected origin/master from origin/HEAD, got "${detected}"`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('drain state is per-project while the autonomy mutex stays host-global (REQ-008)', () => {
  const s = readFileSync(script, 'utf8');
  assert(/PROJECT_NAME="\$\(basename "\$REPO"\)"/.test(s), 'must derive a project name from the drain target');
  assert(/\.sdlc-drain-clone-\$PROJECT_NAME/.test(s), 'clone path must be per-project so two projects do not collide');
  assert(/LOGDIR="\$\{REPO\}\/pm\/drain-logs"/.test(s), 'logs belong to the drain target');
  assert(/FRAMEWORK_REPO\}\/pm\/\.sdlc-autonomous\.lock\.d/.test(s),
    'the mutex must stay HOST-GLOBAL (framework repo) — it bounds host resources and spend across every project, so it is deliberately not per-project');
});

test('the drain prompt is parameterized for the target project (REQ-005, REQ-007)', () => {
  const p = readFileSync(prompt, 'utf8');
  for (const ph of ['{{BASE_BRANCH}}', '{{PROJECT_NAME}}', '{{TEST_CMD}}', '{{DRAINER}}']) {
    assert(p.includes(ph), `prompt must use the ${ph} placeholder`);
  }
  assert(!/origin\/main/.test(p) && !/`main`/.test(p),
    'prompt must not hardcode main — a correct script paired with a prompt that says "branch off main" still produces the wrong branch');
  assert(!/npm test/.test(p), 'prompt must not hardcode npm test — projects define testCmd');

  const s = readFileSync(script, 'utf8');
  // The substitution is written with shell-escaped braces (\{\{NAME\}\}), so
  // allow optional backslashes between the brace characters.
  for (const ph of ['BASE_BRANCH', 'PROJECT_NAME', 'TEST_CMD', 'DRAINER']) {
    assert(new RegExp(`\\\\?\\{\\\\?\\{${ph}\\\\?\\}\\\\?\\}`).test(s), `script must substitute {{${ph}}}`);
  }
  assert(/timeout 3600 hermes -z "\$prompt_text"/.test(s), 'the worker must receive the SUBSTITUTED prompt, not the raw file');
});

test('a fresh clone installs dependencies before tests are expected to pass', () => {
  const s = readFileSync(script, 'utf8');
  assert(/npm ci --silent|npm install --silent/.test(s),
    'a fresh clone has no node_modules, so every task would fail its test gate without an install step');
  assert(/dependency install failed/.test(s), 'a failed install must skip rather than invoke the LLM into certain failure');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`); process.exit(1); }
