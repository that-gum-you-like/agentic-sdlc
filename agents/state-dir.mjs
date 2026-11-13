/**
 * state-dir.mjs — where runtime state lives (runtime-state-isolation, RS-REQ-010).
 *
 * Runtime memory is NOT written into the git checkout. It lives in a per-project
 * state directory; the tracked agents/<agent>/memory/*.json files are frozen seeds
 * that change only through a reviewed PR (memory-publish.mjs).
 *
 *   $SDLC_STATE_DIR                       explicit override
 *   SDLC_STATE_DIR=legacy                 rollback: old in-tree behaviour
 *   ${XDG_STATE_HOME:-~/.local/state}/sdlc/<project>/   default
 *
 * Pure helpers, node stdlib only.
 */

import { mkdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

export const LEGACY = 'legacy';
export const LAYERS = ['core', 'long-term', 'medium-term', 'recent', 'compost'];

/** Filesystem-safe project segment: "Test Project" -> "test-project". */
export function slugifyProject(name) {
  const s = String(name || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'untitled-project';
}

export function isLegacyMode(env = process.env) {
  return String(env.SDLC_STATE_DIR || '').trim().toLowerCase() === LEGACY;
}

/** @returns {string} absolute state dir, or the literal 'legacy'. */
export function resolveStateDir(env = process.env, project = 'untitled-project', home = homedir()) {
  if (isLegacyMode(env)) return LEGACY;
  const override = String(env.SDLC_STATE_DIR || '').trim();
  if (override) return resolve(override);
  const base = String(env.XDG_STATE_HOME || '').trim() || join(home, '.local', 'state');
  return join(base, 'sdlc', slugifyProject(project));
}

/** Tracked seed location (read-only fallback; written only by memory-publish). */
export function seedPath(agent, layer, { agentsDir }) {
  return resolve(agentsDir, agent, 'memory', `${layer}.json`);
}

/** The ONLY function that names a memory file location. */
export function memoryPath(agent, layer, { stateDir, agentsDir }) {
  if (!stateDir || stateDir === LEGACY) return seedPath(agent, layer, { agentsDir });
  return join(stateDir, 'memory', agent, `${layer}.json`);
}

export function memoryDir(agent, { stateDir, agentsDir }) {
  if (!stateDir || stateDir === LEGACY) return resolve(agentsDir, agent, 'memory');
  return join(stateDir, 'memory', agent);
}

/** True when `path` is owned by `uid` (default: current user). Injectable for tests. */
export function isOwnedByUid(path, uid = process.getuid?.(), statFn = statSync) {
  if (uid === undefined) return true; // non-POSIX: no ownership concept
  return statFn(path).uid === uid;
}

/**
 * Create the state dir lazily (mode 0700). Refuses a pre-existing dir that is
 * not owned by the current uid, so a root-created dir can never become the sink.
 */
export function ensureStateDir(dir, { uid = process.getuid?.(), statFn = statSync } = {}) {
  if (!dir || dir === LEGACY) return dir;
  if (existsSync(dir)) {
    if (!isOwnedByUid(dir, uid, statFn)) {
      throw new Error(`state dir ${dir} is not owned by uid ${uid}; refusing to use it (chown it or set SDLC_STATE_DIR)`);
    }
    return dir;
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}
