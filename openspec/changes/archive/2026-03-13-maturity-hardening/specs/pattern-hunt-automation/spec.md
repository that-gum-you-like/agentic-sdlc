## ADDED Requirements

### Requirement: Weekly pattern-hunt cron job
The system SHALL schedule `node agents/pattern-hunt.mjs` to run weekly via OpenClaw cron (Sunday 22:00, before REM sleep at 23:00).

#### Scenario: Cron fires weekly
- **WHEN** Sunday 22:00 arrives
- **THEN** OpenClaw executes `node agents/pattern-hunt.mjs` in the project directory
- **AND** results are posted to Matrix #reviews room

#### Scenario: Cron job listed in openclaw cron list
- **WHEN** `openclaw cron list` is run
- **THEN** a job named `pattern-hunt-weekly` appears with schedule `0 22 * * 0`

### Requirement: Behavior test gate on AGENT.md edits
The lint-staged configuration SHALL run `node agents/test-behavior.mjs` when any file matching `agents/**/*.md` is staged for commit. The commit SHALL be blocked if any behavior test fails.

#### Scenario: AGENT.md edit passes behavior tests
- **WHEN** a developer edits `agents/roy/AGENT.md` and stages the change
- **AND** all 30 behavior tests pass
- **THEN** the commit proceeds normally

#### Scenario: AGENT.md edit fails behavior tests
- **WHEN** a developer edits `agents/jen/AGENT.md` introducing a prompt regression
- **AND** behavior test #14 fails
- **THEN** the commit is blocked with the test failure output

#### Scenario: Non-AGENT.md files are unaffected
- **WHEN** a developer edits `src/services/videoService.ts`
- **THEN** the behavior test gate does NOT run (only lint + jest run as before)
