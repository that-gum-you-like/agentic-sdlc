## ADDED Requirements

### Requirement: REM Sleep SHALL run automatically for all agents
A `rem-sleep.mjs` script MUST run `memory-manager.mjs consolidate` for all 6 agents with age-based promotion logic.

#### Scenario: Run for all agents
- **WHEN** `node agents/rem-sleep.mjs` is run
- **THEN** consolidation runs for roy, moss, jen, richmond, denholm, and douglas

#### Scenario: Age-based promotion from recent
- **WHEN** entries in `recent.json` are older than 7 days
- **THEN** they are promoted to `medium-term.json` or moved to `compost.json` based on relevance

#### Scenario: Age-based promotion from medium-term
- **WHEN** entries in `medium-term.json` are older than 30 days
- **THEN** they are promoted to `long-term.json` or moved to `compost.json`

#### Scenario: Dry run mode
- **WHEN** `node agents/rem-sleep.mjs --dry-run` is run
- **THEN** a report is printed showing what would be promoted/composted, but no files are changed

### Requirement: REM Sleep SHALL be scheduled via OpenClaw cron
A weekly cron job MUST be registered with OpenClaw to run REM sleep every Sunday at 23:00.

#### Scenario: Cron registered
- **WHEN** `openclaw_cron_list` is checked
- **THEN** a weekly REM sleep job is registered

#### Scenario: Cron executes
- **WHEN** the cron fires on Sunday 23:00
- **THEN** `node agents/rem-sleep.mjs` runs and consolidation completes for all agents
