/**
 * Claude Code Native orchestration adapter.
 *
 * Task read/write delegates to file-based adapter.
 * Adds context for spawning Claude Code Agent tool subagents.
 *
 * In this mode, the main Claude Code session is the orchestrator.
 * Tasks are read from local JSON files, and worker.mjs generates prompts
 * that can be passed to Claude Code's Agent tool.
 */

import * as fileBased from './file-based.mjs';

// Task operations delegate to file-based
export const { loadTasks, saveTask, archiveTask, loadCompletedCount, loadHumanTasks, saveHumanTask } = fileBased;

export function syncConfig(_sdlcConfig) {
  // Claude Code native mode has no external platform to sync with.
  // The Claude Code session IS the orchestration platform.
  return { drift: [], mode: 'claude-code-native' };
}
