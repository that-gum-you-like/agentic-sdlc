#!/usr/bin/env node
/**
 * migrate-runtime-state.mjs — one-shot, verified, NON-DESTRUCTIVE migration of
 * tracked agent memory into the runtime state dir (runtime-state-isolation,
 * RS-REQ-015).
 *
 *   node agents/migrate-runtime-state.mjs [--dry-run] [--project-dir <p>] [--state-dir <s>]
 *
 * What it does
 *   1. Copies every tracked agents/<agent>/memory/<layer>.json seed into
 *      <stateDir>/memory/<agent>/<layer>.json, sha256-verifies each copy.
 *   2. Never overwrites an existing state file, never deletes or edits a seed.
 *   3. Merges entries preserved in state-archive/<date>/agent-memory-local-state/
 *      (PR #164: the dirty-tree rescue) into state, by entry id, so no lesson that
 *      was rescued is lost; an id already present in ANY layer of the agent is skipped.
 *   4. Takes a pre-migration copy of everything it is about to touch under
 *      <stateDir>/migration/pre-migration-snapshot/ (outside the checkout, so the
 *      tree stays clean) and writes <stateDir>/migration/runtime-state-manifest.json
 *      ONLY when every copy verified.
 *   5. Idempotent: a second run reports "already migrated" and changes nothing.
 *
 * Exit: 0 ok / already migrated / dry-run, 1 verification or lesson-check failure, 2 usage.
 * Rollback: SDLC_STATE_DIR=legacy (seeds are untouched).
 */

import {
  existsSync, readFileSync, readdirSync, mkdirSync, copyFileSync, rmSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { LAYERS, LEGACY, memoryPath, seedPath, ensureStateDir } from './state-dir.mjs';
import { createMemoryStore, writeAtomic } from './memory-store.mjs';

const __filename = fileURLToPath(import.meta.url);
const sha256 = buf => createHash('sha256').update(buf).digest('hex');

export const MANIFEST_REL = join('migration', 'runtime-state-manifest.json');

function listAgents(agentsDir) {
  if (!existsSync(agentsDir)) return [];
  return readdirSync(agentsDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(join(agentsDir, e.name, 'memory')))
    .map(e => e.name).sort();
}

/** state-archive/<date>/agent-memory-local-state/<agent>/<layer>.json, oldest date first. */
function archiveSources(projectDir, agent, layer) {
  const root = join(projectDir, 'state-archive');
  if (!existsSync(root)) return [];
  return readdirSync(root).sort()
    .map(d => join(root, d, 'agent-memory-local-state', agent, `${layer}.json`))
    .filter(existsSync);
}

/**
 * @param {object} o
 * @param {string} o.agentsDir
 * @param {string} o.stateDir
 * @param {string} [o.projectDir]  defaults to dirname(agentsDir); state-archive/ is looked up here
 * @param {boolean} [o.dryRun]
 * @param {Function} [o.copyFn]    (src, dest) => void — injectable for failure tests
 * @param {Function} [o.now]
 * @returns {{status:string, ok:boolean, entries:object[], archiveMerged:object[], lessonCheck:object, errors:string[]}}
 */
export function migrate({ agentsDir, stateDir, projectDir = dirname(agentsDir), dryRun = false, copyFn, now = () => new Date() }) {
  const result = { status: 'migrated', ok: true, entries: [], archiveMerged: [], lessonCheck: { checked: 0, missing: [] }, errors: [] };
  if (!stateDir || stateDir === LEGACY) {
    return { ...result, ok: false, status: 'refused', errors: ['state dir is legacy/unset; nothing to migrate into'] };
  }
  const manifestPath = join(stateDir, MANIFEST_REL);
  if (existsSync(manifestPath)) return { ...result, status: 'already-migrated' };

  const paths = { stateDir, agentsDir };
  const store = createMemoryStore({ stateDir, agentsDir, projectDir });
  const agents = listAgents(agentsDir);
  const createdTargets = [];

  if (!dryRun) ensureStateDir(stateDir);
  const snapDir = join(stateDir, 'migration', 'pre-migration-snapshot');

  const doCopy = copyFn || ((src, dest) => writeAtomic(dest, readFileSync(src)));

  for (const agent of agents) {
    for (const layer of LAYERS) {
      const seed = seedPath(agent, layer, paths);
      if (!existsSync(seed)) continue;
      const target = memoryPath(agent, layer, paths);
      const seedHash = sha256(readFileSync(seed));
      const entry = { agent, layer, seedSha256: seedHash, stateSha256: null, action: '' };

      if (existsSync(target)) {
        entry.stateSha256 = sha256(readFileSync(target));
        entry.action = entry.stateSha256 === seedHash ? 'identical' : 'kept-existing-state';
        if (!dryRun) { // pre-snapshot of what we leave alone, for the record
          mkdirSync(join(snapDir, agent), { recursive: true });
          copyFileSync(target, join(snapDir, agent, `${layer}.json`));
        }
      } else if (dryRun) {
        entry.action = 'would-copy';
      } else {
        mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
        doCopy(seed, target);
        entry.stateSha256 = existsSync(target) ? sha256(readFileSync(target)) : null;
        createdTargets.push(target);
        entry.action = 'copied';
        if (entry.stateSha256 !== seedHash) {
          result.errors.push(`sha256 mismatch for ${agent}/${layer}: seed ${seedHash} state ${entry.stateSha256}`);
        }
      }
      result.entries.push(entry);
    }
  }

  if (result.errors.length) {
    // Verification failed: undo ONLY what this run created. Seeds untouched, no manifest.
    for (const t of createdTargets) { try { rmSync(t, { force: true }); } catch { /* best effort */ } }
    return { ...result, ok: false, status: 'failed' };
  }

  // Merge rescued (state-archive) entries by id. The archive holds the NEWER, consolidated
  // layout, so an id that the archive has in a higher layer than state does is a promotion:
  // it moves up (never duplicated, never dropped). Composted ids stay composted; an id state
  // already holds in the same or a higher layer is left alone.
  const RANK = { recent: 0, 'medium-term': 1, 'long-term': 2 };
  for (const agent of agents) {
    const layers = {};
    for (const l of [...Object.keys(RANK), 'compost']) layers[l] = store.loadMemory(agent, l);
    const dirty = new Set();
    const locate = id => Object.keys(layers).find(l => (layers[l].entries || []).some(e => e?.id === id));
    for (const layer of ['long-term', 'medium-term', 'recent']) { // higher layers first
      const moved = [];
      for (const src of archiveSources(projectDir, agent, layer)) {
        let data;
        try { data = JSON.parse(readFileSync(src, 'utf8')); } catch { continue; }
        for (const e of data.entries || []) {
          if (!e?.id) continue;
          const at = locate(e.id);
          if (at === layer || at === 'compost' || (at && RANK[at] > RANK[layer])) continue;
          if (at) { // promotion: remove from the lower layer
            layers[at].entries = layers[at].entries.filter(x => x.id !== e.id);
            dirty.add(at);
          }
          layers[layer].entries = [...(layers[layer].entries || []), e];
          dirty.add(layer);
          moved.push(e.id);
        }
      }
      if (moved.length) result.archiveMerged.push({ agent, layer, ids: moved });
    }
    if (!dryRun) for (const l of dirty) store.saveMemory(agent, l, layers[l]);
  }

  // Lesson check (PR #164): every archived long-term entry of sdlc-developer must now be in state.
  if (!dryRun) {
    const have = new Set((store.loadMemory('sdlc-developer', 'long-term').entries || []).map(e => e.id));
    for (const src of archiveSources(projectDir, 'sdlc-developer', 'long-term')) {
      let data; try { data = JSON.parse(readFileSync(src, 'utf8')); } catch { continue; }
      for (const e of data.entries || []) {
        if (!e?.id) continue;
        result.lessonCheck.checked++;
        if (!have.has(e.id)) result.lessonCheck.missing.push(e.id);
      }
    }
    if (result.lessonCheck.missing.length) {
      result.errors.push(`archived lessons missing after migration: ${result.lessonCheck.missing.join(', ')}`);
      return { ...result, ok: false, status: 'failed' };
    }
    writeAtomic(manifestPath, JSON.stringify({
      version: 1,
      migratedAt: now().toISOString(),
      agentsDir, stateDir,
      entries: result.entries,
      archiveMerged: result.archiveMerged,
      lessonCheck: result.lessonCheck,
    }, null, 2) + '\n');
  } else {
    result.status = 'dry-run';
  }
  return result;
}

function __isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === __filename;
}

if (__isMainModule()) {
  const args = process.argv.slice(2);
  const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const { loadConfig } = await import('./load-config.mjs');
  const config = loadConfig();
  const stateDir = opt('--state-dir') ? resolve(opt('--state-dir')) : config.stateDir;
  const r = migrate({ agentsDir: config.agentsDir, stateDir, projectDir: config.projectDir, dryRun: args.includes('--dry-run') });
  for (const e of r.entries) console.log(`  ${e.action.padEnd(20)} ${e.agent}/${e.layer}  ${e.stateSha256?.slice(0, 12) ?? ''}`);
  for (const m of r.archiveMerged) console.log(`  archive-merged       ${m.agent}/${m.layer}: ${m.ids.join(', ')}`);
  if (r.lessonCheck.checked) console.log(`  PR #164 lesson check: ${r.lessonCheck.checked - r.lessonCheck.missing.length}/${r.lessonCheck.checked} present`);
  for (const e of r.errors) console.error(`ERROR: ${e}`);
  console.log(`\nmigrate-runtime-state: ${r.status}${r.status === 'already-migrated' ? ' (no changes)' : ''}`);
  process.exit(r.ok ? 0 : 1);
}
