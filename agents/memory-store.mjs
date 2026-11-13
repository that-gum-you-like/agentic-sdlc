/**
 * memory-store.mjs — read/write agent memory layers through the state dir
 * (runtime-state-isolation, RS-REQ-011 / RS-REQ-012).
 *
 *  - read order: state file, else tracked seed (read-only), else empty
 *  - writes go ONLY to the state dir, atomically (temp + fsync + rename); the
 *    seed layer is copied into state first when state has none
 *  - read-modify-write sequences are serialised per agent by an advisory
 *    `mkdir` lock (`<stateDir>/memory/<agent>/.lock`, stale after 10 minutes)
 *  - the audit append never fails a save
 *  - legacy mode (SDLC_STATE_DIR=legacy): in-tree paths, no lock, as before
 *
 * Node stdlib only.
 */

import {
  existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, copyFileSync,
  openSync, writeSync, fsyncSync, closeSync, renameSync, rmSync, rmdirSync, statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { LEGACY, memoryPath, memoryDir, seedPath, ensureStateDir } from './state-dir.mjs';

export const LOCK_STALE_MS = 10 * 60 * 1000;
export const LOCK_SKIP_TIMEOUT_MS = 5000;
export const LOCK_RETRY_TIMEOUT_MS = 120_000;

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Temp file in the same directory, fsync, rename. A kill leaves old or new, never a truncated file. */
export function writeAtomic(path, content, { renameFn = renameSync } = {}) {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = join(dir, `.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  const fd = openSync(tmp, 'w', 0o600);
  try {
    writeSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    renameFn(tmp, path);
  } catch (err) {
    try { rmSync(tmp, { force: true }); } catch { /* best effort */ }
    throw err;
  }
}

export function createMemoryStore({ stateDir, agentsDir, projectDir, uid, renameFn } = {}) {
  const legacy = !stateDir || stateDir === LEGACY;
  const paths = { stateDir, agentsDir };
  const held = new Map(); // agent -> reentrancy depth (this process)

  const pathOf = (agent, layer) => memoryPath(agent, layer, paths);
  const seedOf = (agent, layer) => seedPath(agent, layer, paths);
  const emptyFor = layer => (layer === 'core' ? {} : { entries: [] });

  function loadMemory(agent, layer) {
    for (const p of [pathOf(agent, layer), seedOf(agent, layer)]) {
      if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
    }
    return emptyFor(layer);
  }

  /**
   * Run fn under the per-agent lock. mode 'retry' (workers) waits and throws on
   * timeout; mode 'skip' (timers) gives up after 5 s and returns { skipped: true }.
   */
  function withAgentLock(agent, fn, { mode = 'retry', staleMs = LOCK_STALE_MS, timeoutMs, pollMs = 50 } = {}) {
    if (legacy) return fn();
    if (held.get(agent)) { // reentrant within this process
      held.set(agent, held.get(agent) + 1);
      try { return fn(); } finally { held.set(agent, held.get(agent) - 1); }
    }
    ensureStateDir(stateDir, { uid });
    const dir = memoryDir(agent, paths);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const lock = join(dir, '.lock');
    const limit = timeoutMs ?? (mode === 'skip' ? LOCK_SKIP_TIMEOUT_MS : LOCK_RETRY_TIMEOUT_MS);
    const start = Date.now();
    for (;;) {
      try { mkdirSync(lock); break; } catch (err) {
        if (err.code !== 'EEXIST') throw err;
        try {
          if (Date.now() - statSync(lock).mtimeMs > staleMs) { // stale: break it
            try { rmdirSync(lock); } catch { /* raced with another breaker */ }
            continue;
          }
        } catch { continue; } // vanished between mkdir and stat
        if (Date.now() - start >= limit) {
          if (mode === 'skip') {
            console.error(`  ⚠ memory lock busy for ${agent}; skipping (non-fatal)`);
            return { skipped: true };
          }
          throw new Error(`memory lock for ${agent} not acquired within ${limit}ms`);
        }
        sleepMs(pollMs);
      }
    }
    held.set(agent, 1);
    try { return fn(); } finally {
      held.delete(agent);
      try { rmdirSync(lock); } catch { /* already gone */ }
    }
  }

  function audit(agent, layer, bytesBefore, content) {
    try {
      const entry = JSON.stringify({
        ts: new Date().toISOString(), agent, layer, bytesBefore,
        bytesAfter: content.length,
        sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
      }) + '\n';
      const pmPath = resolve(projectDir || dirname(agentsDir), 'pm/memory-audit.jsonl');
      const targets = legacy ? [pmPath] : [join(stateDir, 'memory-audit.jsonl'), pmPath];
      let lastErr;
      for (const t of targets) {
        try {
          mkdirSync(dirname(t), { recursive: true });
          appendFileSync(t, entry);
          return;
        } catch (err) { lastErr = err; }
      }
      throw lastErr;
    } catch {
      // Audit failure must never fail the memory save (CV-REQ-072)
      console.error(`  ⚠ Warning: audit log write failed for ${agent}/${layer}`);
    }
  }

  /** @returns {{skipped?:boolean}|undefined} */
  function saveMemory(agent, layer, data, opts = {}) {
    const res = withAgentLock(agent, () => {
      const path = pathOf(agent, layer);
      const content = JSON.stringify(data, null, 2);
      if (!legacy) {
        ensureStateDir(stateDir, { uid });
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        const seed = seedOf(agent, layer);
        if (!existsSync(path) && existsSync(seed)) copyFileSync(seed, path); // seed-copy-on-first-write
      }
      const bytesBefore = existsSync(path) ? readFileSync(path).length : 0;
      writeAtomic(path, content, { renameFn });
      audit(agent, layer, bytesBefore, content);
    }, { mode: opts.lockMode || 'retry' });
    return res && res.skipped ? res : undefined;
  }

  /** Locked read-modify-write of one layer: mutate(data) returns new data (or mutates in place). */
  function updateMemory(agent, layer, mutate, opts = {}) {
    return withAgentLock(agent, () => {
      const cur = loadMemory(agent, layer);
      const next = mutate(cur) ?? cur;
      saveMemory(agent, layer, next, opts);
      return next;
    }, { mode: opts.lockMode || 'retry' });
  }

  return {
    legacy, stateDir, agentsDir,
    memoryPath: pathOf, seedPath: seedOf,
    loadMemory, saveMemory, updateMemory, withAgentLock,
  };
}
