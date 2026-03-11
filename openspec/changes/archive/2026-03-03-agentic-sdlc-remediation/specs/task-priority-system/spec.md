## ADDED Requirements

### Requirement: Tasks SHALL have a priority field
Each task JSON file in `tasks/queue/` MUST support a `priority` field with values: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`. Missing priority MUST default to `MEDIUM`.

#### Scenario: Queue drainer sorts by priority
- **WHEN** `queue-drainer.mjs run` selects the next task
- **THEN** tasks are sorted by priority (CRITICAL first) before pattern-matching to agents

#### Scenario: Existing tasks without priority
- **WHEN** a task file lacks a `priority` field
- **THEN** the queue drainer treats it as `MEDIUM` priority

### Requirement: Tasks SHALL have an estimatedTokens field
Each task JSON file MUST support an `estimatedTokens` field (number or null). This is informational for budget planning.

#### Scenario: Token estimate present
- **WHEN** `queue-drainer.mjs status` displays a task with estimatedTokens set
- **THEN** the token estimate is shown alongside the task

### Requirement: Tasks SHALL support claim/release for parallel safety
Each task JSON file MUST support `claimedBy` (agent name or null) and `claimedAt` (ISO timestamp or null) fields.

#### Scenario: Agent claims a task
- **WHEN** `queue-drainer.mjs claim <task-id> <agent>` is run
- **THEN** the task's `claimedBy` is set to the agent name and `claimedAt` to current timestamp

#### Scenario: Agent releases a task
- **WHEN** `queue-drainer.mjs release <task-id>` is run
- **THEN** the task's `claimedBy` and `claimedAt` are set to null

#### Scenario: Parallel mode skips claimed tasks
- **WHEN** `queue-drainer.mjs run --parallel` encounters a task with non-null `claimedBy`
- **THEN** that task is skipped

#### Scenario: Stale claim detection
- **WHEN** a task has `claimedAt` older than 30 minutes and status is still `in_progress`
- **THEN** `queue-drainer.mjs status` flags it as "potentially stuck"

### Requirement: Completed tasks SHALL be archivable
The system MUST provide a `tasks/completed/` directory and an `archive` command on the queue drainer.

#### Scenario: Archive completed tasks
- **WHEN** `queue-drainer.mjs archive` is run
- **THEN** all task files with `status: "completed"` are moved from `tasks/queue/` to `tasks/completed/`

#### Scenario: Status reflects archived tasks
- **WHEN** `queue-drainer.mjs status` is run after archiving
- **THEN** completed count includes both archived and non-archived completed tasks
