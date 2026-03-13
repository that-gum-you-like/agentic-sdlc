## ADDED Requirements

### Requirement: Session time tracking
`cost-tracker.mjs` SHALL track wall-clock session duration per day in addition to token counts. A session starts when the first agent task is spawned and ends when the last agent task completes (or when no agent activity occurs for 30 minutes). Session hours SHALL be logged in `agents/cost-log.json` alongside token data.

#### Scenario: Session hours recorded
- **WHEN** agents work from 09:00 to 14:30 and then 16:00 to 19:00 on a single day
- **THEN** cost-log records 8.5 hours of session time for that day (5.5 + 3.0, with the 1.5h gap breaking the session)

### Requirement: Wellness configuration
`project.json` SHALL support an optional `humanWellness` section with configurable thresholds: `enabled` (boolean, default false), `dailyMaxHours` (number, default 10), `nightCutoff` (HH:MM string, default "23:00"), `breakIntervalHours` (number, default 3).

#### Scenario: Wellness config defaults
- **WHEN** `humanWellness` is not present in project.json
- **THEN** wellness monitoring is disabled AND no alerts are sent AND session time is still tracked (for reporting)

#### Scenario: Wellness config enabled
- **WHEN** `humanWellness.enabled` is true in project.json
- **THEN** all configured thresholds are active AND alerts fire when thresholds are exceeded

### Requirement: Daily hour limit alert
When `humanWellness.enabled` is true AND cumulative session hours for the current day exceed `dailyMaxHours`, notify.mjs SHALL send a wellness alert. The alert SHALL be sent once per day (not repeatedly).

#### Scenario: Daily limit exceeded
- **WHEN** session hours reach 10.5 AND dailyMaxHours is 10
- **THEN** notify.mjs sends "Wellness alert: You've been running agents for 10.5 hours today. dailyMaxHours (10) exceeded. The projects will be there tomorrow."
- **AND** no additional wellness alerts are sent for daily hours that day

### Requirement: Night cutoff alert
When `humanWellness.enabled` is true AND agent activity occurs after `nightCutoff`, notify.mjs SHALL send a single night alert.

#### Scenario: Late night work detected
- **WHEN** an agent task is spawned at 23:15 AND nightCutoff is "23:00"
- **THEN** notify.mjs sends "Wellness alert: Agent activity detected after 23:00 cutoff. Consider wrapping up."

### Requirement: Break interval reminder
When `humanWellness.enabled` is true AND continuous session duration exceeds `breakIntervalHours` without a 15-minute gap, notify.mjs SHALL send a break reminder.

#### Scenario: Long continuous session
- **WHEN** agents have been running continuously for 3.5 hours AND breakIntervalHours is 3
- **THEN** notify.mjs sends "Wellness alert: 3.5 hours continuous. Take a 15-minute break."

### Requirement: Wellness alerts are advisory only
Wellness alerts SHALL NOT pause, block, or slow the task queue. They are informational notifications only. The human operator retains full control.

#### Scenario: Queue continues after wellness alert
- **WHEN** a wellness alert is sent for exceeding daily hours
- **THEN** the queue-drainer continues assigning tasks normally AND no tasks are delayed or blocked
