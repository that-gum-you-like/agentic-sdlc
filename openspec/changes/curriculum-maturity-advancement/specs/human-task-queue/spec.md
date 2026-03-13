## ADDED Requirements

### Requirement: Human task file structure
The system SHALL support a `tasks/human-queue/` directory containing JSON task files for work that requires human action. Each file SHALL follow the schema `agents/schemas/human-task.schema.json` with fields: `id` (HTASK-NNN), `title`, `description`, `requester` (agent name), `urgency` (blocker/normal/low), `unblocks` (list of agent task IDs), `status` (pending/in-progress/completed), `createdAt`, `completedAt`.

#### Scenario: Human task file created by agent
- **WHEN** an agent creates a human task via worker action
- **THEN** a file `tasks/human-queue/HTASK-NNN.json` is created with all required fields AND `status` is "pending" AND `requester` is the agent's name

### Requirement: Agent creates human task on unresolvable blocker
When an agent encounters a blocker it cannot resolve autonomously (missing credentials, design decisions needed, content required, external vendor action), the `worker.mjs` prompt SHALL instruct the agent to create a human task instead of only flagging the agent task as blocked.

#### Scenario: Agent needs API credentials
- **WHEN** an agent task requires an API key that doesn't exist in the environment
- **THEN** the agent creates a human task with title "Provide API credentials for [service]" AND urgency "blocker" AND `unblocks` includes the blocked agent task ID AND the agent task status is set to "blocked"

### Requirement: Human task notification
When a human task is created, `notify.mjs` SHALL immediately send a notification to the configured channel containing the task title, description, urgency, and which agent tasks it unblocks.

#### Scenario: Blocker human task triggers immediate notification
- **WHEN** a human task with urgency "blocker" is created
- **THEN** notify.mjs sends a message within 60 seconds containing "[BLOCKER] Human action needed: <title>" AND the description AND "Unblocks: <task-ids>"

### Requirement: Human task completion unblocks agent tasks
When a human task's status changes to "completed", `queue-drainer.mjs` SHALL automatically change all tasks listed in `unblocks` from "blocked" to "pending" so they can be claimed by agents.

#### Scenario: Completing human task unblocks dependent agent work
- **WHEN** HTASK-001 has `unblocks: ["TASK-015", "TASK-016"]` AND HTASK-001 status changes to "completed"
- **THEN** TASK-015 and TASK-016 status changes from "blocked" to "pending" AND they appear in the next `queue-drainer.mjs status` output as available

### Requirement: Human task visible in queue status
`queue-drainer.mjs status` SHALL display a "Human Tasks" section showing all pending/in-progress human tasks with urgency, age, and what they unblock.

#### Scenario: Status shows human tasks prominently
- **WHEN** `queue-drainer.mjs status` is run AND there are 2 pending human tasks
- **THEN** output includes a "Human Tasks (2 pending)" section BEFORE the agent task sections AND each human task shows urgency, title, age, and blocked agent tasks

### Requirement: PM Dashboard shows human action items
The PM Dashboard template SHALL include a "YOUR Action Items" section at the top showing all pending human tasks, ordered by urgency (blocker first).

#### Scenario: Dashboard highlights human blockers
- **WHEN** daily-review.mjs updates the PM Dashboard AND there are blocker human tasks
- **THEN** the first section of DASHBOARD.md is "YOUR Action Items" with the blocker tasks listed first
