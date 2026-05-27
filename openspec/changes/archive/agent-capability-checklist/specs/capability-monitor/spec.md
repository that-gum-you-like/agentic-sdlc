## ADDED Requirements

### Requirement: Capability monitor script
The system SHALL provide `agents/capability-monitor.mjs` that analyzes completed task checklists against expected capabilities and detects drift. It SHALL be callable standalone and integrated into `cycles/daily-review.mjs`.

#### Scenario: Monitor runs standalone
- **WHEN** `node agents/capability-monitor.mjs` is run
- **THEN** it scans completed tasks, loads capabilities.json, compares actual vs expected, and outputs a report

#### Scenario: Monitor runs as part of daily review
- **WHEN** `cycles/daily-review.mjs` runs
- **THEN** capability monitoring is included and results appear in the PM Dashboard

### Requirement: Drift detection — required capability skipped
When a required capability is marked `"used": false` without a `skipReason` for `driftThreshold` or more consecutive tasks by the same agent, the monitor SHALL fire a drift alert via notify.mjs with trigger type `capabilityDrift`.

#### Scenario: Drift detected after 3 consecutive skips
- **WHEN** Roy's last 3 completed tasks all have `"memoryRecord": { "used": false }` with no skipReason
- **AND** `memoryRecord` is in Roy's `required` list
- **AND** `driftThreshold` is 3
- **THEN** notify.mjs sends: "Capability drift alert: roy has skipped 'memoryRecord' for 3 consecutive tasks without justification"

#### Scenario: No drift when skipReason provided
- **WHEN** Roy's last 3 tasks have `"semanticSearch": { "used": false, "skipReason": "embeddings not installed" }`
- **AND** `semanticSearch` is in Roy's `conditional` list
- **THEN** no drift alert is fired (skipReason matches conditional exception)

#### Scenario: No drift below threshold
- **WHEN** Roy skipped `defeatTests` in 2 of the last 3 tasks (not consecutive)
- **THEN** no drift alert is fired (below threshold of 3 consecutive)

### Requirement: Scope creep detection — notExpected capability used
When a capability listed in an agent's `notExpected` is marked `"used": true`, the monitor SHALL log a scope creep warning.

#### Scenario: Reviewer writes files
- **WHEN** Richmond's checklist shows `"fileWrite": { "used": true }`
- **AND** `fileWrite` is in Richmond's `notExpected` list
- **THEN** monitor logs: "Scope creep warning: richmond used 'fileWrite' which is not expected for this agent"

### Requirement: Weekly capability usage report
`cycles/weekly-review.mjs` SHALL include a capability usage summary showing per-agent, per-capability usage rates over the reporting window.

#### Scenario: Weekly report includes capability trends
- **WHEN** weekly-review runs
- **THEN** output includes a table: agent | capability | used% | trend (up/down/stable) for all agents with completed tasks that week

### Requirement: PM Dashboard capability section
`daily-review.mjs` SHALL include an "Agent Capability Health" section in the PM Dashboard showing: agents with active drift alerts, overall capability usage rate, and any scope creep warnings.

#### Scenario: Dashboard shows healthy state
- **WHEN** all agents are using all required capabilities
- **THEN** dashboard shows "Agent Capability Health: All agents nominal. No drift alerts."

#### Scenario: Dashboard shows drift
- **WHEN** Roy has an active drift alert for memoryRecord
- **THEN** dashboard shows "Agent Capability Health: DRIFT ALERT — roy: memoryRecord skipped 3x consecutive"

### Requirement: Notification trigger for capability drift
`notify.mjs` SHALL support a `capabilityDrift` trigger type. When configured in project.json `notification.triggers`, drift alerts are sent to the notification channel.

#### Scenario: Drift alert sent via WhatsApp
- **WHEN** `notification.triggers.capabilityDrift` is true AND a drift is detected
- **THEN** notify.mjs sends the drift alert message to the configured channel

### Requirement: Capability monitoring configuration
`project.json` SHALL support a `capabilityMonitoring` section with: `enabled` (boolean, default true), `driftThreshold` (number, default 3), `windowSize` (number, default 10).

#### Scenario: Monitoring disabled
- **WHEN** `capabilityMonitoring.enabled` is false
- **THEN** capability-monitor.mjs exits immediately without analysis

#### Scenario: Custom threshold
- **WHEN** `driftThreshold` is set to 5
- **THEN** drift alerts only fire after 5 consecutive skips (not the default 3)
