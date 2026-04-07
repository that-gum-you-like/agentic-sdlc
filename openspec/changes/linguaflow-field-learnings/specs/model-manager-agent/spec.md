## ADDED Requirements

### Requirement: Model-manager agent role
The framework SHALL include a `model-manager` agent template with AGENT.md, core.json, and capabilities definition. The model-manager's sole domain is token budget monitoring, model assignment, and performance tracking. It SHALL NOT perform code changes or task execution.

#### Scenario: Model-manager scaffolded by setup.mjs
- **WHEN** `setup.mjs` runs and the user includes `model-manager` in the agent roster
- **THEN** the system creates `agents/model-manager/AGENT.md`, `agents/model-manager/memory/core.json`, and configures it in `budget.json` with a `haiku`-tier model (low cost, high frequency)

#### Scenario: Model-manager runs on cron
- **WHEN** the model-manager cron fires (configurable interval, default 15 minutes)
- **THEN** it reads cost-tracker utilization data, evaluates all agents against budget thresholds, and takes action on any agents approaching limits

### Requirement: Token utilization monitoring
The model-manager SHALL read `cost-tracker.mjs` output to determine each agent's current daily token utilization as a percentage of their `dailyTokens` budget.

#### Scenario: Agent at 80% utilization triggers warning
- **WHEN** an agent reaches 80% of daily token budget
- **THEN** the model-manager logs a warning to `pm/model-performance.jsonl` with event type `"budget-warning"`

#### Scenario: Agent at 90% utilization triggers pre-swap alert
- **WHEN** an agent reaches 90% of daily token budget
- **THEN** the model-manager sends a notification via `notify.mjs` and prepares the fallback model assignment

#### Scenario: Agent at 100% utilization triggers model swap
- **WHEN** an agent exhausts 100% of daily token budget and `fallbackChain` has remaining models
- **THEN** the model-manager writes `activeModel` to `budget.json` with the next model in the fallback chain
- **AND** logs a swap event to the performance ledger
- **AND** sends a notification with the old model, new model, and reason

#### Scenario: No fallback models remaining
- **WHEN** an agent exhausts budget and all models in `fallbackChain` are also exhausted or unavailable
- **THEN** the model-manager sends a critical alert via `notify.mjs` and marks the agent as `budget-exhausted` in `budget.json`
- **AND** the agent SHALL NOT be assigned new tasks until budget resets

### Requirement: Daily budget reset
The model-manager SHALL reset `activeModel` to `null` (reverting to preferred `model`) at the daily budget reset time (midnight local or configured in `project.json`).

#### Scenario: Midnight reset restores preferred models
- **WHEN** the daily budget reset occurs
- **THEN** all agents with `activeModel` set SHALL have it cleared to `null`
- **AND** a reset event is logged to the performance ledger

### Requirement: Performance ledger
The model-manager SHALL maintain an append-only JSONL file at `pm/model-performance.jsonl` recording task outcomes correlated with model and configuration.

#### Scenario: Task completion logged
- **WHEN** any task completes (via `queue-drainer.mjs complete`)
- **THEN** a ledger entry is appended with: `ts`, `agent`, `model`, `provider`, `taskId`, `taskType`, `tokensUsed`, `success`, `testsPassed`, `duration`, `firstAttempt`

#### Scenario: Model swap logged
- **WHEN** the model-manager performs a model swap
- **THEN** a ledger entry is appended with event type `"model-swap"`, `agent`, `fromModel`, `toModel`, `reason`, `utilizationPct`

#### Scenario: Ledger queryable via CLI
- **WHEN** `node model-manager.mjs report` is run
- **THEN** the system outputs aggregated stats per agent per model: task count, success rate, avg tokens/task, first-attempt rate

### Requirement: Model recommendations
The model-manager SHALL analyze the performance ledger to produce data-driven model assignment recommendations.

#### Scenario: Agent succeeds consistently on cheaper model
- **WHEN** an agent has 90%+ success rate on a cheaper model over 10+ tasks
- **THEN** the model-manager recommends downgrading the preferred model and includes the evidence (success rate, task count, avg tokens saved)

#### Scenario: Agent fails frequently on current model
- **WHEN** an agent has <70% success rate on its current model over 5+ tasks
- **THEN** the model-manager recommends upgrading to a more capable model and includes the evidence

#### Scenario: Recommendations output
- **WHEN** `node model-manager.mjs recommend` is run
- **THEN** the system outputs per-agent recommendations with confidence level (low/medium/high based on sample size) and supporting data

### Requirement: Worker reads activeModel
The `worker.mjs` script SHALL check `budget.json` for `activeModel` before spawning an agent. If `activeModel` is set and non-null, it SHALL use that model instead of the preferred `model`.

#### Scenario: Active model override in effect
- **WHEN** `worker.mjs` spawns agent `roy` and `budget.json` has `roy.activeModel` set to `"claude-haiku-4-5"`
- **THEN** the spawned agent uses `claude-haiku-4-5` regardless of `roy.model`

#### Scenario: No active model override
- **WHEN** `worker.mjs` spawns agent `roy` and `budget.json` has `roy.activeModel` as `null`
- **THEN** the spawned agent uses `roy.model` (the preferred model)

### Requirement: Task-type model preferences
The model-manager SHALL consult `modelPreferences` in `budget.json` when assigning models, allowing per-task-type overrides.

#### Scenario: Simple fix uses cheaper model
- **WHEN** a task with `taskType: "simple fix"` is assigned to an agent with `modelPreferences: { "simple fix": "claude-haiku-4-5" }`
- **THEN** the worker SHALL use `claude-haiku-4-5` for that task (unless overridden by `activeModel` due to budget exhaustion)

#### Scenario: Architecture task uses capable model
- **WHEN** a task with `taskType: "architecture"` is assigned to an agent with `modelPreferences: { "architecture": "claude-opus-4-6" }`
- **THEN** the worker SHALL use `claude-opus-4-6` for that task
