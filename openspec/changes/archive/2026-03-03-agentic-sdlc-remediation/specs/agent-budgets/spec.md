## ADDED Requirements

### Requirement: Per-agent token budgets SHALL be configurable
An `agents/budget.json` file MUST define daily token limits and model preferences per agent.

#### Scenario: Budget file structure
- **WHEN** `agents/budget.json` is read
- **THEN** each agent has `dailyTokens` (number), `model` (string), and `conservationMode` (boolean) fields

#### Scenario: Default budget values
- **WHEN** budget.json is created initially
- **THEN** Roy/Moss/Jen have 100K daily tokens with sonnet, Richmond/Denholm/Douglas have 50K with haiku

### Requirement: Queue drainer SHALL enforce budget limits
The queue drainer MUST check an agent's token usage against their daily budget before assigning new tasks.

#### Scenario: Agent under budget
- **WHEN** an agent has used fewer tokens than their daily limit
- **THEN** new tasks are assigned normally

#### Scenario: Agent over budget
- **WHEN** an agent has exceeded their daily token limit
- **THEN** new task assignment is skipped with a warning logged, but in-progress tasks continue

### Requirement: Conservation mode SHALL halve all budgets
A conservation mode flag in `budget.json` MUST reduce all daily limits by 50% when activated.

#### Scenario: Conservation mode enabled
- **WHEN** `conservationMode: true` is set in budget.json
- **THEN** all daily token limits are halved

### Requirement: Cost tracking SHALL log token usage per task
A `cost-tracker.mjs` script MUST log token usage to `agents/cost-log.json` and generate reports.

#### Scenario: Record usage
- **WHEN** `node agents/cost-tracker.mjs record <agent> <task-id> <input-tokens> <output-tokens>` is run
- **THEN** an entry is appended to `agents/cost-log.json` with timestamp and model

#### Scenario: Daily report
- **WHEN** `node agents/cost-tracker.mjs report` is run
- **THEN** a summary is printed showing: total tokens today, per-agent breakdown, budget remaining, and top-cost tasks

#### Scenario: Cost report cron
- **WHEN** the daily cron fires at 06:00
- **THEN** `node agents/cost-tracker.mjs report` runs and output is available
