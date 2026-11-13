#!/usr/bin/env node
/**
 * sdlc-update — guarded replacement for the unit's bare `git pull --ff-only` (RS-REQ-030..033).
 *
 * Fetches, classifies the tree, and fast-forwards ONLY when `git merge --ff-only` is
 * guaranteed to succeed (clean tree, or dirty/untracked files disjoint from the incoming
 * diff). Otherwise it alerts ONCE per cause (triggerNotificationOnce 'sdlc-update:<cause>')
 * naming the colliding paths. A successful pull is silent. Exit is 0 unless the script crashes.
 *
 * NEVER runs stash, reset, checkout, clean or chown.
 *
 * Usage: node agents/sdlc-update.mjs [--repo <path>] [--base main] [--dry-run] [--render-unit]
 * Node stdlib only.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentUid, ownerName, foreignOwnerOf } from './lib/ownership.mjs';

const __filename = fileURLToPath(import.meta.url);
export const DRIFT_THRESHOLD = 5;
const MAX_PATHS = 10;

/**
 * Pure. `dirty` = tracked changes + untracked files; `incoming` = files changed by origin/<base>.
 * `foreign` = incoming paths whose existing file or parent dir is owned by another uid.
 * Returns { action: 'noop' | 'pull' | 'alert', cause?, paths? }.
 */
export function classifyTree({ branch, base = 'main', ahead = 0, behind = 0, dirty = [], incoming = [], midOp = false, foreign = [] }) {
  if (midOp) return { action: 'alert', cause: 'mid-operation' };
  if (branch !== base) return { action: 'alert', cause: 'not-on-main' };
  if (behind === 0) return { action: 'noop' };
  if (ahead > 0) return { action: 'alert', cause: 'diverged' };
  if (foreign.length) return { action: 'alert', cause: 'foreign-owned', paths: foreign };
  const inc = new Set(incoming);
  const overlap = dirty.filter(p => inc.has(p) || [...inc].some(i => i.startsWith(p.endsWith('/') ? p : p + '/')) || (p.endsWith('/') && [...inc].some(i => i.startsWith(p))));
  if (overlap.length) return { action: 'alert', cause: 'dirty-overlap', paths: overlap };
  return { action: 'pull' };
}

const defaultGit = (repo, args) =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const lines = s => (s || '').split('\n').map(l => l.trim()).filter(Boolean);
const list = paths => paths.slice(0, MAX_PATHS).join(', ') + (paths.length > MAX_PATHS ? ` (+${paths.length - MAX_PATHS} more)` : '');

const NEXT_ACTION = {
  'fetch-failed': 'Check the network (node agents/net-doctor.mjs); the next tick retries.',
  'mid-operation': 'Finish or abort the merge/rebase in the checkout.',
  'not-on-main': 'Switch the checkout back to main when ready.',
  'diverged': 'Local commits and origin/main both moved: rebase or push the local work.',
  'foreign-owned': 'Run the node agents/checkout-doctor.mjs command for these paths (needs sudo).',
  'dirty-overlap': 'Commit, move, or discard your edits to these paths; the next tick will then pull.',
  'merge-failed': 'Run `git merge --ff-only origin/main` by hand to see the full error.',
  'drift': 'Resolve the earlier alert; the checkout is falling behind.',
};

/**
 * Runs one update tick. All side effects are injectable:
 *   git(repo, args) -> stdout (throws on non-zero), notify(key, trigger, message), foreignOf(path) -> uid|null.
 * Returns { outcome, cause?, alerts: [...] } and never throws on notifier failure.
 */
export function runUpdate({ repo, base = 'main', git = defaultGit, notify = () => false, foreignOf, dryRun = false, uid = currentUid(), exists = existsSync } = {}) {
  const alerts = [];
  const alert = (cause, detail) => {
    const message = `sdlc-update ${cause}: ${detail} ${NEXT_ACTION[cause] || ''}`.trim();
    alerts.push({ cause, message });
    if (dryRun) return;
    try { notify(`sdlc-update:${cause}`, 'highSeverityFailure', message); } catch { /* a notifier failure must never change the exit code */ }
  };
  const g = (...a) => git(repo, a);

  try { g('fetch', '--quiet', 'origin'); } catch (e) {
    alert('fetch-failed', String(e.stderr || e.message).split('\n')[0]);
    return { outcome: 'alert', cause: 'fetch-failed', alerts };
  }
  const remote = `origin/${base}`;
  const branch = g('rev-parse', '--abbrev-ref', 'HEAD').trim();
  const [ahead, behind] = g('rev-list', '--left-right', '--count', `HEAD...${remote}`).trim().split(/\s+/).map(Number);
  const gitDir = g('rev-parse', '--git-dir').trim();
  const gd = gitDir.startsWith('/') ? gitDir : join(repo, gitDir);
  const midOp = ['MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD'].some(n => exists(join(gd, n)));
  const dirty = [...new Set([...lines(g('diff', '--name-only', 'HEAD')), ...lines(g('ls-files', '--others', '--exclude-standard'))])];
  const incoming = behind > 0 ? lines(g('diff', '--name-only', `HEAD..${remote}`)) : [];
  const fo = foreignOf || (p => foreignOwnerOf(join(repo, p), { uid }));
  const foreign = behind > 0 ? incoming.filter(p => fo(p) !== null) : [];

  const verdict = classifyTree({ branch, base, ahead, behind, dirty, incoming, midOp, foreign });
  let pulled = false;
  if (verdict.action === 'pull') {
    if (dryRun) return { outcome: 'would-pull', behind, alerts };
    try { g('merge', '--ff-only', remote); pulled = true; } catch (e) {
      alert('merge-failed', String(e.stderr || e.message).split('\n')[0]);
      return { outcome: 'alert', cause: 'merge-failed', alerts };
    }
  } else if (verdict.action === 'alert') {
    const detail = {
      'mid-operation': 'a merge/rebase is in progress, so nothing was pulled.',
      'not-on-main': `checkout is on "${branch}", not ${base}; nothing was pulled.`,
      'diverged': `${ahead} local and ${behind} upstream commits; nothing was pulled.`,
      'foreign-owned': `incoming files are owned by another user (${list(verdict.paths || [])}); nothing was pulled.`,
      'dirty-overlap': `local changes collide with incoming files: ${list(verdict.paths || [])}; nothing was pulled.`,
    }[verdict.cause];
    alert(verdict.cause, detail);
  }

  if (!pulled && behind > DRIFT_THRESHOLD) {
    let oldest = '';
    try { oldest = lines(g('log', '--format=%cI', `HEAD..${remote}`)).pop() || ''; } catch { /* date is best effort */ }
    alert('drift', `${behind} commits behind ${remote}${oldest ? `, oldest unpulled ${oldest.slice(0, 10)}` : ''}.`);
  }
  return { outcome: pulled ? 'pulled' : verdict.action === 'alert' ? 'alert' : 'noop', cause: verdict.cause, behind, alerts };
}

export function renderUnit({ repo, node = process.execPath, template }) {
  const t = template ?? readFileSync(join(dirname(__filename), 'templates/systemd/sdlc-update.service.template'), 'utf8');
  return t.replaceAll('{{REPO}}', repo).replaceAll('{{NODE}}', node).replaceAll('{{HOME}}', homedir());
}

const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;
if (__isMainModule) {
  const argv = process.argv.slice(2);
  const opt = n => { const i = argv.indexOf(n); return i !== -1 ? argv[i + 1] : undefined; };
  const repo = resolve(opt('--repo') || join(dirname(__filename), '..'));
  try {
    if (argv.includes('--render-unit')) { process.stdout.write(renderUnit({ repo })); }
    else {
      const { triggerNotificationOnce } = await import('./notify.mjs');
      const r = runUpdate({ repo, base: opt('--base') || 'main', notify: triggerNotificationOnce, dryRun: argv.includes('--dry-run') });
      if (argv.includes('--dry-run')) console.log(JSON.stringify(r, null, 2));
    }
  } catch (e) { console.error(`sdlc-update crashed: ${e.stack || e.message}`); process.exitCode = 1; }
}
