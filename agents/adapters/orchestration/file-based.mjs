/**
 * File-based orchestration adapter (default).
 * Reads/writes task JSON files directly — zero external dependencies.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';

export function loadTasks(tasksDir) {
  const tasks = [];
  if (!existsSync(tasksDir)) return tasks;
  const files = readdirSync(tasksDir).filter(f => f.endsWith('.json')).sort();
  for (const file of files) {
    try {
      const task = JSON.parse(readFileSync(join(tasksDir, file), 'utf8'));
      task._file = file;
      tasks.push(task);
    } catch { /* skip malformed */ }
  }
  return tasks;
}

export function saveTask(tasksDir, task) {
  writeFileSync(join(tasksDir, task._file), JSON.stringify(task, null, 2));
}

/**
 * RS-REQ-020: archiving stamps `archived_at` on the task in place. Nothing is
 * moved, renamed or deleted; `completedDir` is accepted for call-site
 * compatibility and never written. Returns true when a stamp was written.
 */
export function archiveTask(tasksDir, _completedDir, task, { now = new Date() } = {}) {
  if (task.archived_at) return false;
  task.archived_at = now.toISOString();
  saveTask(tasksDir, task);
  return true;
}

/** RS-REQ-043: name a directory owned by another uid (null when ours or unknown). */
export function foreignDirOwner(dir, uid = process.env.SDLC_TEST_UID ? Number(process.env.SDLC_TEST_UID) : process.getuid?.()) {
  try {
    const st = statSync(dir);
    return uid !== undefined && st.uid !== uid ? st.uid : null;
  } catch { return null; }
}

/** RS-REQ-021: archived count = archived-in-queue + legacy tasks/completed (read only). */
export function loadCompletedCount(completedDir, tasksDir) {
  let n = 0;
  if (tasksDir) n += loadTasks(tasksDir).filter(t => t.archived_at).length;
  if (completedDir && existsSync(completedDir)) {
    try { n += readdirSync(completedDir).filter(f => f.endsWith('.json')).length; } catch { /* unreadable legacy dir */ }
  }
  return n;
}

/** RS-REQ-021: archived tasks (queue stamp first, legacy dir for anything not in the queue). */
export function loadArchivedTasks(tasksDir, completedDir) {
  const out = loadTasks(tasksDir).filter(t => t.archived_at);
  const seen = new Set(out.map(t => t._file));
  if (completedDir && existsSync(completedDir)) {
    let files = [];
    try { files = readdirSync(completedDir).filter(f => f.endsWith('.json')).sort(); } catch { /* unreadable */ }
    for (const f of files) {
      if (seen.has(f)) continue;
      try { const t = JSON.parse(readFileSync(join(completedDir, f), 'utf8')); t._file = f; out.push(t); } catch { /* skip malformed */ }
    }
  }
  return out;
}

export function loadHumanTasks(humanQueueDir) {
  if (!existsSync(humanQueueDir)) return [];
  const files = readdirSync(humanQueueDir).filter(f => f.endsWith('.json')).sort();
  const tasks = [];
  for (const file of files) {
    try {
      const task = JSON.parse(readFileSync(join(humanQueueDir, file), 'utf8'));
      task._file = file;
      tasks.push(task);
    } catch { /* skip malformed */ }
  }
  return tasks;
}

export function saveHumanTask(humanQueueDir, task) {
  writeFileSync(join(humanQueueDir, task._file), JSON.stringify(task, null, 2));
}

export function syncConfig(_sdlcConfig) {
  // File-based adapter has no external platform to sync with
  return { drift: [] };
}
