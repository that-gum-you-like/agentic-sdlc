## ADDED Requirements

### Requirement: Failure IDs with severity levels
Agent `core.json` failures SHALL use structured IDs (F-001, F-002, etc.) with severity levels: `critical`, `high`, `medium`. The `core.json.template` SHALL include the failure schema with severity field.

#### Scenario: Critical failure triggers immediate rule change
- **WHEN** a failure with severity `critical` is recorded in an agent's `core.json`
- **THEN** the agent's AGENT.md non-negotiable rules SHALL be updated in the same commit
- **AND** the failure entry includes `ruleAdded` field pointing to the new rule

#### Scenario: High failure updates checklist
- **WHEN** a failure with severity `high` is recorded
- **THEN** the reviewer checklist SHALL gain a new check item referencing the failure pattern
- **AND** `test-behavior.mjs` SHALL verify the checklist was updated

#### Scenario: Medium failure adds watch pattern
- **WHEN** a failure with severity `medium` is recorded
- **THEN** the pattern is added to `long-term.json` as a watch item
- **AND** no immediate rule or checklist change is required

### Requirement: Failure schema in core.json
Each failure entry in `core.json` SHALL contain: `id` (F-xxx), `date` (ISO 8601), `severity` (critical/high/medium), `description`, `lesson`, and optionally `ruleAdded`.

#### Scenario: Valid failure entry
- **WHEN** an agent records a failure
- **THEN** the entry matches the schema: `{ "id": "F-001", "date": "2026-04-07", "severity": "high", "description": "...", "lesson": "..." }`
