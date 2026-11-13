#!/usr/bin/env node
/**
 * Tests for the autonomous drain — hermes-drain.sh guards + drain-prompt.md
 * safety contract. The script is a shell orchestrator, so we assert its
 * structural guards and exercise its safe no-op path (running on a non-main
 * branch must skip WITHOUT invoking any LLM).
 *
 * Run: node tests/hermes-drain.test.mjs
 */

import { readdirSync, readFileSync, existsSync, statSync, constants, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
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
  assert(/pgrep -f '\^timeout 3600 hermes'/.test(s), 'must have a pgrep backstop against a live concurrent worker, ANCHORED — unanchored, any shell containing the text blocked every drain (2026-11-03)');
  assert(/HERMES_HOME="\$DRAIN_HOME"/.test(s) && /TERMINAL_ENV=local/.test(s), 'must use the isolated local-backend profile');
  assert(/checkout -q -f -B "\$BASE_BRANCH" "origin\/\$BASE_BRANCH"/.test(s), 'clone refresh must FORCE checkout the RESOLVED base branch — the previous worker legitimately leaves the clone dirty (regression: 2026-07-06 "clone checkout failed")');
  assert(/SDLC_PROJECT_DIR="\$DRAIN_CLONE"/.test(s), 'worker invocation must pin SDLC_PROJECT_DIR to the clone — the systemd unit exports it pointing at the main repo, which made workers dirty the MAIN tree (regression: 2026-07-06)');
  assert(/pending_fixes/.test(s) && /-ge "\$MAX_OPEN_DRAIN_PRS" \] && \[ "\$\{pending_fixes:-0\}" -eq 0 \]/.test(s),
    'the unreviewed-PR cap must NOT starve self-healing: pending FIX-* tasks bypass it (REQ-SH-2)');
});

test('drain prompt carries the self-healing fix-task procedure (REQ-SH-2)', () => {
  const p = readFileSync(prompt, 'utf8');
  assert(/## Fix tasks/.test(p), 'must have a Fix tasks section');
  assert(readFileSync(script, 'utf8').includes("grep -v '^FIX-'"), 'open-PR exclusion (now done by the script, CV-REQ-120) must exempt FIX-* tasks');
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

// --- completion notify (openspec: telegram-activation, REQ-004) ---
test('drain completion notifies through the DRAINED project\'s config, best-effort only', () => {
  const s = readFileSync(script, 'utf8');
  const notifyLine = s.match(/SDLC_PROJECT_DIR="\$REPO" node "\$SCRIPTS_DIR\/notify\.mjs" send[\s\S]*?\|\| true/);
  assert(notifyLine, 'completion notify must route via notify.mjs with the drained project\'s own SDLC_PROJECT_DIR and be || true guarded');
  // Ordering: the notify hook must sit AFTER the worker invocation and the
  // dry-run early-exit, so --dry-run never notifies.
  const workerIdx = s.indexOf('timeout 3600 hermes -z');
  const dryRunIdx = s.indexOf('DRY RUN — would drain');
  const notifyIdx = s.indexOf('notify.mjs');
  assert(workerIdx !== -1 && dryRunIdx !== -1 && notifyIdx !== -1, 'expected worker, dry-run, and notify markers in the script');
  assert(notifyIdx > workerIdx && dryRunIdx < workerIdx,
    'notify must come after the worker (dry-run exits earlier and must never notify)');
  // A notify failure must not flip the drain exit code: exit 0 still follows
  // the hook. Asserted structurally rather than by literal adjacency, since the
  // hook is now wrapped in a failure-only guard (see the next test).
  assert(/\|\| true\n(?:fi\n)?\nexit 0/.test(s), 'the drain must still exit 0 after a failed notification');
});

test('a SUCCESSFUL drain is silent — only failures notify', () => {
  // The drain fires every 15 minutes. A message per tick trains the reader to
  // ignore the channel, which costs them the one message that mattered
  // (Bryce, 2026-09-02: "i don't need a message every 15 minutes, i just need
  // deploy and failure notifications"). Routine success lives in the daily
  // heartbeat instead.
  const s = readFileSync(script, 'utf8');
  // There is more than one `if [ "$rc" -ne 0 ]` block (an earlier one copies the
  // failed log to the outbox), so check that SOME failure guard contains the
  // notify — not merely the first one.
  const guards = [...s.matchAll(/if \[ "\$rc" -ne 0 \]; then([\s\S]*?)\nfi/g)].map((m) => m[1]);
  assert(guards.length > 0, 'expected at least one `if [ "$rc" -ne 0 ]` guard');
  assert(guards.some((g) => /notify\.mjs/.test(g)), 'the notify call must be INSIDE a failure guard');
  // And there must be no other unguarded notify send in the script.
  const allSends = [...s.matchAll(/notify\.mjs" send/g)];
  assert(allSends.length === 1, `expected exactly one notify send, found ${allSends.length}`);
});

test('drain installs the pre-commit hook in the clone after the sync, aborting on failure (CV-313)', () => {
  const s = readFileSync(script, 'utf8');
  const sync = s.indexOf('reset --hard "origin/$BASE_BRANCH"');
  const install = s.indexOf('review-hook.mjs" install --pre-only');
  assert(sync !== -1 && install !== -1, 'must call review-hook.mjs install --pre-only');
  assert(install > sync, 'hook install must come AFTER the clone sync (reset would not remove it, but order documents intent)');
  const after = s.slice(install, install + 400);
  assert(/exit 1/.test(after) && /aborting pass/.test(after), 'a failed install must abort the pass with a logged reason');
  assert(/cd "\$DRAIN_CLONE"/.test(s.slice(install - 80, install)), 'must install INTO the clone, not the main repo');
});

test('drain prompt runs check-staged before the commit step (CV-315)', () => {
  const p = readFileSync(prompt, 'utf8');
  const gate = p.indexOf('review-hook.mjs" check-staged');
  const commit = p.indexOf('6. **Commit**');
  assert(gate !== -1 && commit !== -1, 'prompt must contain check-staged and the commit step');
  assert(gate < commit, 'check-staged must come before the commit step');
  assert(/at most \*\*twice\*\*/.test(p), 'retry limit of two must be stated');
});

test('drain prompt recalls memory before work and records after, even on failure (CV-316)', () => {
  const p = readFileSync(prompt, 'utf8');
  const recall = p.indexOf('memory-manager.mjs" recall');
  const record = p.indexOf('memory-manager.mjs" record');
  assert(recall !== -1 && record !== -1, 'prompt must contain both recall and record');
  assert(recall < record, 'recall must come before record');
  assert(recall < p.indexOf('3. **Branch from'), 'recall must happen before any work (branching/implementing)');
  assert(/EVERY outcome, including each failing one/.test(p), 'record must cover failing outcomes');
  assert(/\|\| true/.test(p.slice(recall, recall + 120)), 'a missing memory dir must not fail the run');
  const s = readFileSync(script, 'utf8');
  assert(/\\?\{\\?\{SCRIPTS_DIR\\?\}\\?\}/.test(s), 'script must substitute {{SCRIPTS_DIR}}');
});

test('framework project.json testCmd runs the full suite, and the script still reads testCmd per project', () => {
  const cfg = JSON.parse(readFileSync(resolve(root, 'agents/project.json'), 'utf8'));
  assert(cfg.testCmd === "node --test 'tests/*.test.mjs' 'agents/__tests__/*.test.mjs'", `testCmd must be the full suite, got: ${cfg.testCmd}`);
  const s = readFileSync(script, 'utf8');
  assert(/c\.testCmd\|\|"npm test"/.test(s), 'per-project testCmd override (default npm test) must remain');
});

// --- agent identity (curriculum-v2-conformance CV-REQ-120..122) ---
function dryRunFixture(tasks) {
  const tmp = mkdtempSync(join(tmpdir(), 'drain-dry-'));
  const lock = mkdtempSync(join(tmpdir(), 'drain-dry-lock-'));
  const home = mkdtempSync(join(tmpdir(), 'drain-dry-home-'));
  execFileSync('mkdir', ['-p', join(tmp, 'agents'), join(tmp, 'tasks', 'queue')]);
  writeFileSync(join(tmp, 'agents', 'project.json'), JSON.stringify({ name: 'fixture', agents: [] }));
  writeFileSync(join(home, 'config.yaml'), '');
  for (const t of tasks) {
    writeFileSync(join(tmp, 'tasks', 'queue', `${t.id}.json`),
      JSON.stringify({ title: t.id, description: '', status: 'pending', priority: 'HIGH', ...t }));
  }
  const git = (...args) => execFileSync('git', args, { cwd: tmp, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  const run = (extra = {}) => execFileSync('bash', [script, '--dry-run'], {
    cwd: tmp, encoding: 'utf8', timeout: 60000,
    env: { ...process.env, SDLC_REPO: tmp, SDLC_LOCK_DIR: join(lock, 'l.d'), HERMES_DRAIN_HOME: home,
      SDLC_DRAIN_SKIPS: join(lock, 'no-skips.txt'), ...extra },
  });
  const cleanup = () => { for (const d of [tmp, lock, home]) rmSync(d, { recursive: true, force: true }); };
  return { run, cleanup };
}

test('dry-run logs the selected task and its agent, without an LLM call (CV-802)', () => {
  const f = dryRunFixture([
    { id: 'T-2', priority: 'LOW', agent: 'sdlc-developer' },
    { id: 'T-1', priority: 'CRITICAL', agent: 'sdlc-documentarian' },
  ]);
  try {
    const out = f.run();
    assert(/selected task: T-1 \(agent sdlc-documentarian\)/.test(out), `expected T-1 + agent, got: ${out}`);
    assert(!/invoking Hermes/.test(out), 'dry-run must stay LLM-free');
  } finally { f.cleanup(); }
});

test('agent defaults to sdlc-developer when the task names none (CV-802)', () => {
  const f = dryRunFixture([{ id: 'T-1' }]);
  try {
    assert(/selected task: T-1 \(agent sdlc-developer\)/.test(f.run()), 'no agent field -> sdlc-developer');
  } finally { f.cleanup(); }
});

test('prompt template carries the identity placeholders and no hard-coded developer memory (CV-802)', () => {
  const p = readFileSync(prompt, 'utf8');
  for (const ph of ['{{TASK_ID}}', '{{AGENT}}', '{{AGENT_IDENTITY}}']) assert(p.includes(ph), `prompt must use ${ph}`);
  assert(p.includes('## Your identity ({{AGENT}})'), 'identity section header');
  assert(!/recall sdlc-developer/.test(p) && !/record sdlc-developer/.test(p), 'memory recall/record must use {{AGENT}}');
  assert(p.includes('Your task is {{TASK_ID}}') && !/Pick one task/.test(p), 'the worker must not choose its task');
  assert(/## Fix tasks/.test(p), 'FIX section stays');
});

test('script selects via queue-drainer next, substitutes identity without sed, -m only behind drainModel (CV-802)', () => {
  const s = readFileSync(script, 'utf8');
  for (const ph of ['TASK_ID', 'AGENT', 'AGENT_IDENTITY']) {
    assert(s.includes(`\\{\\{${ph}\\}\\}`), `script must substitute {{${ph}}}`);
  }
  assert(!/sed[^\n]*AGENT_IDENTITY/.test(s), 'identity must not pass through sed');
  assert(/queue-drainer\.mjs" next/.test(s) && /--exclude/.test(s), 'must select via queue-drainer next --exclude');
  assert(s.includes("grep -v '^FIX-'"), 'FIX tasks are never excluded');
  assert(s.includes('nothing selectable — skip (no LLM call)'), 'must skip without an LLM call');
  assert(s.includes('MODEL_ARGS=(-m "$DRAIN_MODEL")') && /drainModel/.test(s), '-m only set from drainModel');
  assert(s.includes('--yolo ${MODEL_ARGS[@]+'), 'hermes line passes MODEL_ARGS only (empty = unchanged command line)');
});

test('bash substitution keeps &, backslash and / from AGENT.md verbatim (CV-802)', () => {
  const script2 = [
    'shopt -u patsub_replacement 2>/dev/null || true',
    "t='A {{AGENT_IDENTITY}} B'; id='x & y \\ z / w'",
    't="${t//\\{\\{AGENT_IDENTITY\\}\\}/$id}"; printf %s "$t"',
  ].join('\n');
  const out = execFileSync('bash', ['-c', script2], { encoding: 'utf8' });
  assert(out === 'A x & y \\ z / w B', `got: ${out}`);
});


test('a task the worker gave up on is skipped next time, not re-picked forever (skip ledger)', () => {
  const f = dryRunFixture([
    { id: 'T-1', priority: 'CRITICAL' },
    { id: 'T-2', priority: 'LOW' },
  ]);
  const ledger = join(mkdtempSync(join(tmpdir(), 'skips-')), 'skips.txt');
  writeFileSync(ledger, 'T-1\n');
  try {
    assert(/selected task: T-2 /.test(f.run({ SDLC_DRAIN_SKIPS: ledger })), 'T-1 is in the skip ledger');
  } finally { f.cleanup(); }
  const src = readFileSync(script, 'utf8');
  assert(/DRAIN: \(skipped\|blocked\) \$TASK_ID/.test(src) && />> "\$SKIP_LEDGER"/.test(src), 'a give-up is recorded in the ledger');
});

test('uid 0 -> rc 98, no mutex/clone/log created, message names the user-level unit (RS-REQ-042)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rs-root-'));
  try {
    for (const args of [[], ['--dry-run']]) {
      let status = 0, stderr = '';
      try {
        execFileSync('bash', [script, ...args], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, SDLC_TEST_UID: '0', SDLC_REPO: dir, SDLC_LOCK_DIR: join(dir, 'lock.d'), SDLC_DRAIN_CLONE: join(dir, 'clone') } });
      } catch (e) { status = e.status; stderr = String(e.stderr); }
      assert(status === 98, `rc ${status} for ${args.join(' ') || 'normal'}`);
      assert(/systemctl --user/.test(stderr), 'names the user-level unit');
    }
    assert(readdirSync(dir).length === 0, `files created: ${readdirSync(dir)}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --- runtime-state-isolation RS-REQ-013 ------------------------------------------------------
test('worker env contains SDLC_STATE_DIR (host state dir, resolved from the HOST repo config)', () => {
  const s = readFileSync(script, 'utf8');
  assert(/SDLC_PROJECT_DIR="\$DRAIN_CLONE" SDLC_STATE_DIR="\$HOST_STATE_DIR"/.test(s), 'worker invocation must export the host SDLC_STATE_DIR next to the clone SDLC_PROJECT_DIR');
  assert(/SDLC_PROJECT_DIR="\$REPO" node .*load-config\.mjs/.test(s), 'state dir must be resolved from the HOST repo, not the clone');
});

test('clone memory write leaves clone clean; recall survives clone reset', () => {
  const base = mkdtempSync(join(tmpdir(), 'rs-drain-'));
  try {
    const clone = join(base, 'clone'); const state = join(base, 'state');
    mkdirSync(join(clone, 'agents', 'ag', 'memory'), { recursive: true });
    writeFileSync(join(clone, 'agents', 'project.json'), JSON.stringify({ name: 'drain-fixture', agents: ['ag'] }));
    writeFileSync(join(clone, '.gitignore'), 'pm/\n'); // runtime pm/ is ignored in every real project
    const g = (...a) => execFileSync('git', ['-C', clone, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { encoding: 'utf8' });
    g('init', '-q'); g('add', '-A'); g('commit', '-qm', 'init');
    const env = { ...process.env, SDLC_PROJECT_DIR: clone, SDLC_STATE_DIR: state };
    const mm = join(root, 'agents', 'memory-manager.mjs');
    execFileSync('node', [mm, 'record', 'ag', 'recent', 'worker lesson survives'], { cwd: clone, env, encoding: 'utf8' });
    assert(g('status', '--porcelain').trim() === '', 'memory write must leave the clone clean');
    g('reset', '--hard'); g('clean', '-fdq');
    const out = execFileSync('node', [mm, 'recall', 'ag'], { cwd: clone, env, encoding: 'utf8' });
    assert(/worker lesson survives/.test(out), 'lesson must survive the next pass reset');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

// Summary LAST (bug 2026-11-09): a test declared after it could fail without failing the suite.
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`); process.exit(1); }
