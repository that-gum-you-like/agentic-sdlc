/**
 * The drain worker must never touch a human checkout (2026-11-03 incident: a worker
 * committed on ~/agentic-sdlc main and switched its branch). agents/drain-trespass-guard.sh
 * snapshots each checkout before the run and reports/repairs after it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
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
// GUARD_BACKUP_DIR keeps restored-change patches out of the real ~/hermes-outbox.
const run = (dir, between) => execFileSync('bash', ['-c',
  `. "${GUARD}"; guard_snapshot "${dir}"; ${between}; guard_check backup-ref`],
  { encoding: 'utf8', env: { ...process.env, GUARD_BACKUP_DIR: join(dir, '.guard-backups') } });

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

test('a worker edit plus branch switch: edit reverted, branch restored', () => {
  const dir = repo();
  const out = run(dir, `git -C "${dir}" checkout -qb other; echo dirty >> "${dir}/a.txt"`);
  assert.match(out, /modified tracked files restored: a\.txt \(saved: git apply .*\);.*branch main -> other; restored;/);
  assert.equal(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'main');
});

test("the human's own uncommitted edit blocks the branch switch-back (never discard human work)", () => {
  const dir = repo();
  writeFileSync(join(dir, 'a.txt'), 'human\n');
  const out = run(dir, `git -C "${dir}" checkout -q -b other 2>/dev/null`);
  assert.match(out, /branch main -> other;$/);
  assert.equal(readFileSync(join(dir, 'a.txt'), 'utf8'), 'human\n');
});

test('tracked files modified during the run are restored; files the human had already modified are left alone', () => {
  const dir = repo();
  writeFileSync(join(dir, 'b.txt'), 'b\n'); git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'b');
  writeFileSync(join(dir, 'b.txt'), 'human edit\n');            // dirty BEFORE the run
  const out = run(dir, `echo worker > "${dir}/a.txt"; echo worker >> "${dir}/b.txt"`);
  assert.match(out, /modified tracked files restored: a\.txt \(saved: git apply .*\);/);
  assert.equal(readFileSync(join(dir, 'a.txt'), 'utf8'), 'a\n', 'worker edit reverted');
  assert.match(readFileSync(join(dir, 'b.txt'), 'utf8'), /human edit/, 'human edit untouched');
});

test('every restored change is saved as a patch first, so a human or timer edit is never lost (2026-11-09)', () => {
  const dir = repo();
  const out = run(dir, `echo 'interactive session edit' >> "${dir}/a.txt"`);
  const patch = out.match(/saved: git apply (\S+?)\)/)[1];
  assert.equal(patch, join(dir, '.guard-backups', `backup-ref-${dir.split('/').pop()}.patch`));
  assert.equal(readFileSync(join(dir, 'a.txt'), 'utf8'), 'a\n', 'still restored');
  git(dir, 'apply', patch);
  assert.equal(readFileSync(join(dir, 'a.txt'), 'utf8'), 'a\ninteractive session edit\n', 'the patch brings the edit back');
});

// RS-REQ-051: the guard stays strict. Timer writers were removed (memory moved to the state
// dir, archive in place), not tolerated, so there is no allowlist to maintain.
test('a state-dir memory write mid-drain is not a trespass; a checkout write still is (rc 97 path)', () => {
  const dir = repo();
  mkdirSync(join(dir, 'agents', 'sdlc-developer', 'memory'), { recursive: true });
  writeFileSync(join(dir, 'agents', 'sdlc-developer', 'memory', 'long-term.json'), '{"entries":[]}\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'seed');
  const state = mkdtempSync(join(tmpdir(), 'guard-state-'));
  // REM-sleep style write into the state dir (outside the checkout) during the drain
  const outClean = run(dir, `mkdir -p "${state}/memory/sdlc-developer"; echo '{"entries":[{"id":"x"}]}' > "${state}/memory/sdlc-developer/long-term.json"`);
  assert.equal(outClean, '', 'state-dir write is invisible to the guard');
  // The very same write landing on the TRACKED seed in the checkout is a trespass: restored + patch saved
  const out = run(dir, `echo '{"entries":[{"id":"x"}]}' > "${dir}/agents/sdlc-developer/memory/long-term.json"`);
  assert.match(out, /modified tracked files restored: agents\/sdlc-developer\/memory\/long-term\.json \(saved: git apply .*\);/);
  assert.equal(readFileSync(join(dir, 'agents', 'sdlc-developer', 'memory', 'long-term.json'), 'utf8'), '{"entries":[]}\n', 'seed restored');
});

test('the guard has no allowlist and its header records that timer writers were removed', () => {
  const src = readFileSync(GUARD, 'utf8');
  assert.match(src.split('\n').filter(l => l.startsWith('#')).join('\n'), /timer writers were removed rather than tolerated/);
  assert.doesNotMatch(src.split('\n').filter(l => !l.startsWith('#')).join('\n'), /allowlist|ignore_paths|GUARD_IGNORE/i, 'no allowlist in code');
  assert.equal(/\bgrep -q[^\n]*\bmemory\b/.test(src.split('\n').filter(l => !l.startsWith('#')).join('\n')), false, 'no memory-path exemption in code');
});
