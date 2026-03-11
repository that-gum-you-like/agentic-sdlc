## ADDED Requirements

### Requirement: Weekly REM sleep cron job
The system SHALL have an OpenClaw cron job registered that runs `node agents/rem-sleep.mjs` every Sunday at 23:00.

#### Scenario: Cron job exists
- **WHEN** `openclaw_cron_list` is run
- **THEN** a job named `rem-sleep-weekly` appears with schedule `0 23 * * 0` and command `node /home/bryce/languageapp/agents/rem-sleep.mjs`

#### Scenario: Cron job executes
- **WHEN** the cron fires at Sunday 23:00
- **THEN** REM sleep consolidation runs for all 6 agents

### Requirement: Daily cost report cron job
The system SHALL have an OpenClaw cron job registered that runs `node agents/cost-tracker.mjs report` every day at 06:00.

#### Scenario: Cron job exists
- **WHEN** `openclaw_cron_list` is run
- **THEN** a job named `cost-report-daily` appears with schedule `0 6 * * *` and command `node /home/bryce/languageapp/agents/cost-tracker.mjs report`

#### Scenario: Cron job executes
- **WHEN** the cron fires at 06:00
- **THEN** a daily cost report is generated to stdout (captured in OpenClaw logs)

### Requirement: Cron registration documented in CLAUDE.md
The iteration cycles section of CLAUDE.md SHALL reference the registered cron jobs.

#### Scenario: CLAUDE.md mentions crons
- **WHEN** CLAUDE.md is read
- **THEN** the Iteration Cycles section mentions the weekly REM sleep and daily cost report cron schedules
