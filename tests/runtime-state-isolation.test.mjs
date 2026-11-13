/**
 * runtime-state-isolation.test.mjs — RS-REQ-050 / RS-REQ-017 (RS-401)
 *
 * A full pass of every scheduled cycle script (daily, weekly incl. REM sleep, monthly,
 * queue archive, version snapshot, rag index) in a fixture repo with SDLC_STATE_DIR set
 * must leave `git status --porcelain` empty. Any script that dirties the checkout is
 * named in the failure message: it must be moved to the state dir, not tolerated.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'rs-cycle-'));
  const checkout = join(root, 'checkout');
  // Copy the tracked tree (not .git, not openspec history) so scripts run against a real layout.
  for (const f of execFileSync('git', ['-C', REPO, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)) {
    if (f.startsWith('openspec/') || f.startsWith('tests/') || f.startsWith('docs/') || f.startsWith('.claude/')) continue;
    let fp;
    try { fp = join(REPO, f); lstatSync(fp); } catch { continue; } // file may have been deleted but not yet committed
    if (!lstatSync(fp).isFile()) continue; // symlinks / submodules
    const dest = join(checkout, f);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(REPO, f), dest);
  }
  // One completed, not-yet-archived task so `archive` has real work to do.
  const q = join(checkout, 'tasks', 'queue');
  mkdirSync(q, { recursive: true });
  writeFileSync(join(q, 'T-DONE.json'), JSON.stringify({ id: 'T-DONE', title: 'done', status: 'completed', completed_at: new Date().toISOString() }, null, 2));
  git(checkout, 'init', '-q', '-b', 'main');
  git(checkout, 'add', '-A');
  git(checkout, 'commit', '-qm', 'fixture');
  return { root, checkout, stateDir: join(root, 'state'), home: join(root, 'home') };
}

// `queue-drainer archive` is deliberately NOT in this list: it is a manual command (no timer
// runs it) whose in-place `archived_at` stamp is the designed tracked edit of the task file
// (design.md "Task archive abolition"). Its own contract is tested below: it stamps in place
// and never moves, deletes or creates files.
const CYCLE = [
  ['rem-sleep', 'agents/rem-sleep.mjs', []],
  ['version-snapshot snapshot', 'agents/version-snapshot.mjs', ['snapshot']],
  ['rag-indexer', 'agents/rag-indexer.mjs', []],
  ['cycles/daily-review', 'agents/cycles/daily-review.mjs', []],
  ['cycles/weekly-review', 'agents/cycles/weekly-review.mjs', []],
  ['cycles/monthly-review', 'agents/cycles/monthly-review.mjs', []],
];

test('no tracked or untracked-unignored change after every cycle script', { timeout: 600_000 }, () => {
  const fx = fixture();
  mkdirSync(fx.home, { recursive: true });
  const env = {
    ...process.env,
    HOME: fx.home, // no real ~/hermes-outbox, ~/.hermes/.env or notification state
    SDLC_STATE_DIR: fx.stateDir,
    SDLC_PROJECT_DIR: fx.checkout,
    SDLC_NOTIFY_ONCE_PATH: join(fx.root, 'notify-once.json'),
    HERMES_OUTBOX: join(fx.root, 'outbox'),
    TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '',
    DBUS_SESSION_BUS_ADDRESS: 'unix:path=/nonexistent', // desktop popups fail closed
  };
  assert.equal(git(fx.checkout, 'status', '--porcelain').trim(), '', 'fixture starts clean');
  const dirtied = [];
  for (const [label, script, args] of CYCLE) {
    try {
      execFileSync(process.execPath, [join(fx.checkout, script), ...args], { cwd: fx.checkout, env, encoding: 'utf8', stdio: 'pipe', timeout: 300_000 });
    } catch { /* a script may exit non-zero in a bare fixture; only checkout cleanliness is under test */ }
    const status = git(fx.checkout, 'status', '--porcelain').trim();
    if (status) {
      dirtied.push(`${label} dirtied the checkout:\n${status.split('\n').slice(0, 10).join('\n')}`);
      git(fx.checkout, 'checkout', '-q', '--', '.');
      git(fx.checkout, 'clean', '-fdq');
    }
  }
  assert.deepEqual(dirtied, [], `scripts that must move their writes to SDLC_STATE_DIR:\n${dirtied.join('\n')}`);
});

test('the cycle scripts actually ran against the state dir (memory lives outside the checkout)', () => {
  const fx = fixture();
  mkdirSync(fx.home, { recursive: true });
  const env = { ...process.env, HOME: fx.home, SDLC_STATE_DIR: fx.stateDir, SDLC_PROJECT_DIR: fx.checkout, SDLC_NOTIFY_ONCE_PATH: join(fx.root, 'n.json'), TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/nonexistent' };
  execFileSync(process.execPath, [join(fx.checkout, 'agents/rem-sleep.mjs')], { cwd: fx.checkout, env, stdio: 'pipe' });
  assert.equal(git(fx.checkout, 'status', '--porcelain').trim(), '');
  assert.ok(existsSync(fx.stateDir), 'state dir was created and used');
  assert.ok(readdirSync(fx.stateDir).length > 0, 'state dir has content');
});

test('queue-drainer archive stamps in place: no file moved, deleted or created (RS-REQ-020)', () => {
  const fx = fixture();
  mkdirSync(fx.home, { recursive: true });
  const env = { ...process.env, HOME: fx.home, SDLC_STATE_DIR: fx.stateDir, SDLC_PROJECT_DIR: fx.checkout, SDLC_NOTIFY_ONCE_PATH: join(fx.root, 'n.json'), TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/nonexistent' };
  execFileSync(process.execPath, [join(fx.checkout, 'agents/queue-drainer.mjs'), 'archive'], { cwd: fx.checkout, env, stdio: 'pipe' });
  const lines = git(fx.checkout, 'status', '--porcelain').split('\n').filter(Boolean);
  assert.ok(lines.length > 0, 'completed tasks were stamped');
  assert.ok(lines.every(l => /^ ?M tasks\/queue\/[^/]+\.json$/.test(l)), `only in-place modifications of queue files, got: ${lines.filter(l => !/^ ?M tasks\/queue\//.test(l)).join('; ')}`);
  assert.equal(existsSync(join(fx.checkout, 'tasks', 'completed')), false, 'no tasks/completed dir is created');
});
