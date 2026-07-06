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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`); process.exit(1); }
