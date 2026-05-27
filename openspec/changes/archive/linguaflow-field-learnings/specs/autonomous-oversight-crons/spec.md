## ADDED Requirements

### Requirement: Essential cron job templates
The `cron-schedule.json.template` SHALL document 5 essential cron jobs proven in production: backlog review (daily), openspec sync (every 6 hours), REM sleep (weekly), cost report (daily), model-manager health check (every 15 minutes).

#### Scenario: Template includes all 5 crons with descriptions
- **WHEN** a user reads the cron-schedule.json.template
- **THEN** each cron entry includes: name, cron expression, command, description of what it does, and which agent role should own it

### Requirement: Cron jobs are platform-agnostic
Cron definitions SHALL specify commands as `node ~/agentic-sdlc/agents/<script>.mjs <args>`, not platform-specific invocations. The execution mechanism (OpenClaw cron, system crontab, CI schedule, etc.) is the project's choice.

#### Scenario: Cron runs without OpenClaw
- **WHEN** a project does not use OpenClaw
- **THEN** the cron commands are runnable via system `crontab -e` or any cron scheduler without modification

### Requirement: Backlog review cron
A daily backlog review cron SHALL scan `openspec/changes/` for active items, verify execution agents have assigned tasks, and flag orphaned changes.

#### Scenario: Orphaned openspec change flagged
- **WHEN** an openspec change has been in `proposal` or `design` phase for >14 days with no task queue entries
- **THEN** the backlog review emits a warning naming the stale change

### Requirement: Model-manager health check cron
A recurring cron (default: every 15 minutes) SHALL invoke the model-manager agent to check utilization and perform model swaps as needed.

#### Scenario: Model-manager cron triggers utilization check
- **WHEN** the model-manager cron fires
- **THEN** `model-manager.mjs check` runs and outputs agent utilization status
