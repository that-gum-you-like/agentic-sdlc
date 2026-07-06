#!/usr/bin/env node
/**
 * Tests for the autonomous drain — hermes-drain.sh guards + drain-prompt.md
 * safety contract. The script is a shell orchestrator, so we assert its
 * structural guards and exercise its safe no-op path (running on a non-main
 * branch must skip WITHOUT invoking any LLM).
 *
 * Run: node tests/hermes-drain.test.mjs
 */

import { readFileSync, existsSync, statSync, constants } from 'fs';
import { accessSync } from 'fs';
import { resolve, dirname } from 'path';
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
  assert(/branch.*!=.*"main"|!= "main"/.test(s), 'must refuse to run unless on main');
  assert(/git status --porcelain/.test(s), 'must require a clean tree');
  assert(/Ready \\?\(unblocked\\?\)/.test(s), 'must cost-gate on ready-task count');
  assert(/head:agent\/drain\//.test(s) && /MAX_OPEN_DRAIN_PRS/.test(s), 'must cap unreviewed drain PRs');
  assert(/mkdir "\$LOCKDIR"/.test(s) && /\.hermes-drain\.lock/.test(s), 'must use an ATOMIC (mkdir) single-flight lock, not a racy [ -f ] test');
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

test('running on a non-main branch is a safe no-op (no LLM call)', () => {
  // The test repo is on a feature branch during development → the script must
  // skip immediately with exit 0 and never reach the Hermes invocation.
  const out = execFileSync('bash', [script], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert(/not main|skip/i.test(out), `expected a skip message, got: ${out}`);
  assert(!/invoking Hermes/.test(out), 'must not invoke Hermes when guards fail');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`); process.exit(1); }
