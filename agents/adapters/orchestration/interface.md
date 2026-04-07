# Orchestration Adapter Interface

Every orchestration adapter MUST export these named functions with the exact signatures below.

## Methods

### `loadTasks(tasksDir: string): Task[]`
Read all tasks from the task queue.
- Returns array of task objects, each with `_file` metadata for round-trip writes
- Filters to `.json` files only

### `saveTask(tasksDir: string, task: object): void`
Write a task back to the queue. Uses `task._file` to determine filename.

### `archiveTask(tasksDir: string, completedDir: string, task: object): void`
Move a completed task from queue to completed directory.

### `loadCompletedCount(completedDir: string): number`
Count completed task files.

### `loadHumanTasks(humanQueueDir: string): Task[]`
Read all human task files. Returns array with `_file` metadata.

### `saveHumanTask(humanQueueDir: string, task: object): void`
Write a human task back to its queue.

### `syncConfig(sdlcConfig: object): { drift: object[] }`
Sync SDLC agent configuration to the orchestration platform.
- Returns array of drift objects describing differences between SDLC config and platform state
- For `file-based`, this is a no-op returning empty drift
- For `paperclip`, this wraps the existing paperclip-sync API calls

## Task Object Shape

```json
{
  "id": "T-001",
  "title": "Task title",
  "description": "What to do",
  "assignee": "agent-name",
  "status": "pending | in_progress | completed | blocked",
  "priority": "high | medium | low",
  "estimatedTokens": 3500,
  "taskType": "simple fix | feature | architecture | research",
  "claimedBy": null,
  "claimedAt": null,
  "started_at": null,
  "completed_at": null,
  "test_status": null,
  "blockedBy": null,
  "files": [],
  "_file": "T-001.json"
}
```

## Adapter File Convention

Each adapter is a single `.mjs` file in `agents/adapters/orchestration/`:
- `file-based.mjs` — default, reads/writes local JSON files
- `paperclip.mjs` — wraps Paperclip REST API
- `claude-code-native.mjs` — spawns Claude Code subagents

Loaded dynamically by `agents/adapters/load-adapter.mjs` based on `project.json` config.
