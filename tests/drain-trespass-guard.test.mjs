/**
 * The drain worker must never touch a human checkout (2026-11-03 incident: a worker
 * committed on ~/agentic-sdlc main and switched its branch). agents/drain-trespass-guard.sh
 * snapshots each checkout before the run and reports/repairs after it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUARD = resolve(dirname(fileURLToPath(import.meta.url)), '../agents/drain-trespass-guard.sh');
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim();

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'init');
  return dir;
}
// Snapshot, run `between` (the "worker"), then check — all in one bash so the arrays persist.
const run = (dir, between) => execFileSync('bash', ['-c',
  `. "${GUARD}"; guard_snapshot "${dir}"; ${between}; guard_check backup-ref`], { encoding: 'utf8' });

test('an untouched checkout reports nothing', () => {
  const dir = repo();
  assert.equal(run(dir, 'true'), '');
});

test('a switched branch is reported and switched back when the tree is clean', () => {
  const dir = repo();
  const out = run(dir, `git -C "${dir}" checkout -qb agent/drain/X`);
  assert.match(out, /branch main -> agent\/drain\/X; restored;/);
  assert.equal(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'main');
});

test('a drain-authored commit on the human branch is reported with a backup ref and NOT reset', () => {
  const dir = repo();
  const out = run(dir, `echo b > "${dir}/b.txt"; git -C "${dir}" add .; git -C "${dir}" -c user.name=t -c user.email=t@t commit -qm "feat: x

Co-Authored-By: hermes-drain"`);
  assert.match(out, /drain-authored commit\(s\) on main \(backup ref backup-ref, NOT reset\)/);
  assert.equal(git(dir, 'log', '-1', '--format=%s'), 'feat: x', 'never auto-reset: a human may have committed too');
  assert.equal(git(dir, 'rev-parse', 'backup-ref'), git(dir, 'rev-parse', 'HEAD'));
});

test("a human's own commit in the same window is not a trespass", () => {
  const dir = repo();
  const out = run(dir, `echo c > "${dir}/c.txt"; git -C "${dir}" add .; git -C "${dir}" -c user.name=t -c user.email=t@t commit -qm "human work"`);
  assert.equal(out, '');
});

test('a switched branch with a dirty tree is reported but not switched (never discard work)', () => {
  const dir = repo();
  const out = run(dir, `git -C "${dir}" checkout -qb other; echo dirty >> "${dir}/a.txt"`);
  assert.match(out, /branch main -> other;$/);
  assert.equal(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'other');
});
