## ADDED Requirements

### Requirement: Max instances configuration
`budget.json` SHALL support a `maxInstances` field per agent (default 1). This controls the maximum number of concurrent instances of that agent type that can be spawned.

#### Scenario: Agent configured for multi-instance
- **WHEN** budget.json contains `"roy": { "maxInstances": 3, "dailyTokenLimit": 100000 }`
- **THEN** queue-drainer MAY assign up to 3 tasks simultaneously to Roy instances

### Requirement: Instance-aware task claiming
When multiple instances of the same agent are active, each claim SHALL include an instance identifier (e.g., `roy-1`, `roy-2`). The task JSON `claimedBy` field SHALL use this instance ID.

#### Scenario: Two Roy instances claim different tasks
- **WHEN** Roy has maxInstances=3 AND two unblocked backend tasks exist
- **THEN** queue-drainer assigns TASK-010 to `roy-1` and TASK-011 to `roy-2` AND each task's `claimedBy` field reflects the instance ID

### Requirement: File pattern conflict detection before parallel assignment
Before assigning a second task to a new instance of the same agent, queue-drainer SHALL check that the task's expected file patterns (from domains.json and task metadata) do not overlap with files likely touched by already-claimed tasks. If overlap is detected, the task SHALL be serialized (queued for after the first completes) rather than parallelized.

#### Scenario: Overlapping tasks serialized
- **WHEN** TASK-010 (claimed by roy-1) involves `src/services/auth.ts` AND TASK-011 also involves `src/services/auth.ts`
- **THEN** TASK-011 is NOT assigned to roy-2 AND it remains pending until TASK-010 completes

#### Scenario: Independent tasks parallelized
- **WHEN** TASK-010 involves `src/services/auth.ts` AND TASK-012 involves `src/services/payments.ts`
- **THEN** TASK-012 is assigned to roy-2 in parallel with TASK-010

### Requirement: Shared budget across instances
All instances of the same agent type SHALL share the agent's `dailyTokenLimit`. Token usage by any instance counts against the total budget. When the shared budget is exhausted, no new instances may be spawned.

#### Scenario: Budget shared across instances
- **WHEN** roy-1 uses 60K tokens AND roy-2 uses 30K tokens AND Roy's dailyTokenLimit is 100K
- **THEN** total Roy usage is 90K AND 10K remains AND a third instance may be spawned only if the next task estimates <= 10K tokens

### Requirement: Instance coordination prompt injection
`worker.mjs` SHALL inject instance awareness into the agent prompt when multiple instances are active. The prompt MUST include: instance ID, total active instances, what other instances are working on, and file paths to avoid.

#### Scenario: Worker injects instance context
- **WHEN** worker generates prompt for roy-2 AND roy-1 is working on TASK-010 (auth service) AND roy-3 is working on TASK-013 (user service)
- **THEN** the prompt includes: "You are Roy (instance 2 of 3). Instance 1 is working on 'Fix auth token refresh' (src/services/auth*). Instance 3 is working on 'Add user preferences' (src/services/user*). Do not modify files claimed by other instances."

### Requirement: Auto-scale suggestion
When queue depth for a single domain exceeds 3 unblocked tasks AND the agent's maxInstances > current active instances, queue-drainer status SHALL display a suggestion: "Consider scaling <agent> — N unblocked tasks, only M instances active (max: P)."

#### Scenario: Scale suggestion displayed
- **WHEN** 5 unblocked backend tasks exist AND Roy has maxInstances=3 AND only 1 instance is active
- **THEN** `queue-drainer.mjs status` includes "Consider scaling roy — 5 unblocked tasks, 1 instance active (max: 3)"
