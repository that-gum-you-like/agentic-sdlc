## ADDED Requirements

### Requirement: Cron schedule template
The system SHALL provide `agents/templates/cron-schedule.json.template` defining recommended automated schedules for iteration cycles:
- Daily review: every day at 06:00
- Weekly pattern hunt + REM sleep: every Sunday at 23:00
- Monthly behavior audit: 1st of each month at 06:00
- Cost report: every day at 06:00

#### Scenario: Template available after setup
- **WHEN** setup.mjs runs in a new project
- **THEN** `agents/templates/cron-schedule.json.template` exists with all 4 cycle schedules AND each entry specifies the script to run and the cron expression

### Requirement: Setup registers cron jobs
When `setup.mjs` runs AND the notification provider is `openclaw`, it SHALL offer to register cron jobs for all iteration cycles. Each cron job SHALL run the corresponding script in an isolated session.

#### Scenario: Cron registration with OpenClaw
- **WHEN** setup.mjs runs AND notification provider is "openclaw"
- **THEN** the user is prompted "Register automated iteration cycles? (daily review, weekly pattern hunt, monthly audit)" AND if confirmed, cron jobs are registered via `openclaw cron add`

#### Scenario: No cron without OpenClaw
- **WHEN** setup.mjs runs AND notification provider is "file" or "none"
- **THEN** cron registration is skipped AND the user is told "To automate iteration cycles, add these to your system crontab:" followed by the recommended schedule

### Requirement: Daily review runs automatically
When the daily review cron fires, `cycles/daily-review.mjs` SHALL run unattended, update the PM Dashboard, record cost data, and send a summary notification if configured.

#### Scenario: Unattended daily review
- **WHEN** the daily review cron fires at 06:00
- **THEN** daily-review.mjs runs AND updates DASHBOARD.md AND appends to cost-log AND sends summary notification (if dailySummary trigger is enabled)

### Requirement: Weekly review runs automatically
When the weekly review cron fires, it SHALL run pattern-hunt, REM sleep, and behavior tests in sequence. If any behavior test fails, a highSeverityFailure notification SHALL be sent.

#### Scenario: Unattended weekly review
- **WHEN** the weekly review cron fires on Sunday at 23:00
- **THEN** pattern-hunt runs AND rem-sleep runs AND test-behavior runs AND results are logged
- **AND** if behavior tests fail, a notification is sent: "Weekly review: behavior test failure detected — <details>"

### Requirement: Cycle history log
All automated cycle runs SHALL be logged to `pm/cycle-history.json` with: cycle type, timestamp, success/failure, summary stats (tasks completed, patterns found, memories consolidated, tests passed/failed).

#### Scenario: Cycle history recorded
- **WHEN** daily-review completes
- **THEN** an entry is appended to `pm/cycle-history.json` with `{ "cycle": "daily", "timestamp": "...", "success": true, "stats": { "tasksCompleted": 5, "tokensBurned": 45000 } }`
