/**
 * File-based orchestration adapter (default).
 * Reads/writes task JSON files directly — zero external dependencies.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, renameSync } from 'fs';
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

export function archiveTask(tasksDir, completedDir, task) {
  if (!existsSync(completedDir)) mkdirSync(completedDir, { recursive: true });
  const src = join(tasksDir, task._file);
  const dest = join(completedDir, task._file);
  renameSync(src, dest);
}

export function loadCompletedCount(completedDir) {
  if (!existsSync(completedDir)) return 0;
  return readdirSync(completedDir).filter(f => f.endsWith('.json')).length;
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
