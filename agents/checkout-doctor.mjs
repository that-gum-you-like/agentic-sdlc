#!/usr/bin/env node
/**
 * checkout-doctor — container-mount section (RS-REQ-064).
 *
 * Inspects running `hermes-*` Docker containers and reports any whose Mounts
 * include the human home, an ancestor, or a live checkout with RW: true.
 * Read-only; docker missing or no containers is a note, never a failure.
 * RS-REQ-040 section (diagnose): foreign-owned/stray paths with the human chown command.
 * All sections are read-only.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentUid, ownerName, chownCommand, findForeignPaths, foreignOwnerOf } from './lib/ownership.mjs';
import { exposureReason, discoverCheckouts } from './hermes-config-guard.mjs';

export const CONTAINER_FIX = 'stop and recreate with a dedicated workspace (~/.hermes/workspaces/<project>), docker_mount_cwd_to_workspace: false';

/** Default docker runner: returns parsed `docker inspect` JSON for running hermes-* containers; throws if docker is unavailable. */
export function dockerRunner() {
  const ids = execFileSync('docker', ['ps', '--filter', 'name=hermes-', '--format', '{{.ID}}'], { encoding: 'utf8', timeout: 10000 }).split(/\s+/).filter(Boolean);
  if (!ids.length) return [];
  return JSON.parse(execFileSync('docker', ['inspect', ...ids], { encoding: 'utf8', timeout: 10000 }));
}

/**
 * @param {{run?: () => object[], home?: string, checkouts?: string[]}} opts  run is injectable
 * @returns {{containers: string[], exposed: Array<{container: string, name: string, source: string, destination: string, reason: string, fix: string}>, notes: string[]}}
 */
export function checkContainerMounts({ run = dockerRunner, home = homedir(), checkouts = discoverCheckouts(home) } = {}) {
  let inspected;
  try { inspected = run(); } catch (e) { return { containers: [], exposed: [], notes: [`docker unavailable: ${String(e.message).split('\n')[0]}`] }; }
  const list = Array.isArray(inspected) ? inspected : [];
  if (!list.length) return { containers: [], exposed: [], notes: ['no hermes containers running'] };
  const exposed = [];
  for (const c of list) {
    for (const m of c.Mounts || []) {
      if (!m.RW || !m.Source) continue;
      const reason = exposureReason(m.Source, { home, checkouts });
      if (reason) exposed.push({ container: String(c.Id || '').slice(0, 12), name: String(c.Name || '').replace(/^\//, ''), source: m.Source, destination: m.Destination, reason, fix: CONTAINER_FIX });
    }
  }
  const containers = list.map(c => String(c.Id || '').slice(0, 12)).sort();
  return { containers, exposed, notes: [] };
}

const defaultGit = (repo, args) =>
  execFileSync('git', ['--no-optional-locks', '-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const lines = s => s.split('\n').map(l => l.trim()).filter(Boolean);

export function diagnose({ repo, git = defaultGit, uid = currentUid(), fs, stateDir, passwdText, base = 'origin/main' } = {}) {
  const g = (...a) => { try { return git(repo, a); } catch { return null; } };
  const branch = (g('rev-parse', '--abbrev-ref', 'HEAD') || '').trim() || null;
  let ahead = null, behind = null;
  const lr = g('rev-list', '--left-right', '--count', `HEAD...${base}`);
  if (lr) { [ahead, behind] = lr.trim().split(/\s+/).map(Number); }
  const trackedModified = lines(g('diff', '--name-only', 'HEAD') || '');
  const untracked = lines(g('ls-files', '--others', '--exclude-standard', '--directory') || '');
  const { foreign, unreadable } = findForeignPaths(repo, { uid, fs });
  const foreignOut = foreign.map(f => {
    const owner = ownerName(f.uid, passwdText);
    return { path: f.path, uid: f.uid, owner, command: chownCommand(join(repo, f.path), ownerName(uid, passwdText)) };
  });
  let state = null;
  if (stateDir && existsSync(stateDir)) {
    const owner = foreignOwnerOf(stateDir, { uid });
    state = { path: stateDir, ok: owner === null, ...(owner !== null ? { uid: owner, owner: ownerName(owner, passwdText), command: chownCommand(stateDir, ownerName(uid, passwdText)) } : {}) };
  }
  const findings = foreignOut.length + unreadable.length + untracked.length + trackedModified.length + (state && !state.ok ? 1 : 0);
  return { repo, branch, ahead, behind, foreign: foreignOut, unreadable, untracked, trackedModified, stateDir: state, findings };
}

export function formatReport(r) {
  const out = [`checkout-doctor: ${r.repo}`, `branch ${r.branch ?? '?'}  ahead ${r.ahead ?? '?'}  behind ${r.behind ?? '?'}`];
  const section = (title, items, fmt) => { if (items.length) { out.push('', `${title} (${items.length})`); items.forEach(i => out.push('  ' + fmt(i))); } };
  section('Foreign-owned paths', r.foreign, f => `${f.path}  owner=${f.owner}\n    human fix: ${f.command}`);
  section('Unreadable paths', r.unreadable, u => `${u.path}  (${u.error})`);
  section('Untracked, not ignored', r.untracked, u => u);
  section('Tracked modifications', r.trackedModified, u => u);
  if (r.stateDir && !r.stateDir.ok) out.push('', `State dir ${r.stateDir.path} owned by ${r.stateDir.owner}\n    human fix: ${r.stateDir.command}`);
  out.push('', r.findings ? `${r.findings} finding(s). This tool changed nothing.` : 'No findings.');
  return out.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const argv = process.argv.slice(2);
    const ri = argv.indexOf('--repo');
    const repo = resolve(ri !== -1 ? argv[ri + 1] : join(dirname(fileURLToPath(import.meta.url)), '..'));
    const stateDir = process.env.SDLC_STATE_DIR || join(homedir(), '.local/state/sdlc');
    const r = diagnose({ repo, stateDir });
    const containers = checkContainerMounts();
    if (argv.includes('--json')) console.log(JSON.stringify({ ...r, containerMounts: containers }, null, 2));
    else {
      console.log(formatReport(r));
      for (const n of containers.notes) console.log(`checkout-doctor: ${n}`);
      for (const e of containers.exposed) console.error(`FAIL ${e.name} (${e.container}) mounts ${e.source} -> ${e.destination} rw (${e.reason}); ${e.fix}`);
    }
    process.exitCode = (r.findings || containers.exposed.length) ? 1 : 0;
  } catch (e) { console.error(`checkout-doctor crashed: ${e.message}`); process.exitCode = 2; }
}
