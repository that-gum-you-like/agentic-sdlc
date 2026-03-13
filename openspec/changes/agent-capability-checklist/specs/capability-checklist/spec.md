## ADDED Requirements

### Requirement: Capability checklist JSON schema
The system SHALL provide `agents/schemas/capability-checklist.schema.json` defining the post-task capability checklist format. Required fields: `taskId` (string), `agent` (string), `timestamp` (string, ISO date), `capabilities` (object where each key maps to `{ "used": boolean, "skipReason"?: string }`).

#### Scenario: Valid checklist passes validation
- **WHEN** a checklist JSON with all required fields and valid capability entries is validated
- **THEN** validation succeeds

#### Scenario: Missing skipReason for unused required capability flagged
- **WHEN** a checklist has `"memoryRecall": { "used": false }` with no `skipReason`
- **AND** `memoryRecall` is listed as `required` in capabilities.json for that agent
- **THEN** the capability monitor flags this as a drift signal

### Requirement: Worker injects checklist template into agent prompt
`worker.mjs` SHALL append a capability checklist output section to every generated agent prompt. The section MUST instruct the agent to output a `<!-- CAPABILITY_CHECKLIST -->` tagged JSON block as the final structured output before task completion. The template MUST list all capabilities relevant to that agent (loaded from `agents/capabilities.json` if it exists, or a default full list).

#### Scenario: Agent prompt includes checklist instructions
- **WHEN** worker.mjs generates a prompt for any agent
- **THEN** the prompt includes a "Capability Checklist" section with instructions to output the JSON block

#### Scenario: Checklist template scoped to agent
- **WHEN** `capabilities.json` lists Roy's required capabilities as `["memoryRecall", "defeatTests"]`
- **THEN** Roy's prompt checklist template highlights those as required and marks others as optional

### Requirement: Expected capabilities configuration
The system SHALL support `agents/capabilities.json` (or per-project at `agents/capabilities.json`) defining per-agent expected capability usage with three tiers: `required` (must use every task), `conditional` (expected under stated conditions), `notExpected` (should never use).

#### Scenario: Capabilities config loaded
- **WHEN** `capabilities.json` exists with entries for "roy" and "richmond"
- **THEN** worker.mjs and capability-monitor.mjs both read the correct expected capabilities per agent

#### Scenario: Missing capabilities.json uses defaults
- **WHEN** `capabilities.json` does not exist
- **THEN** all capabilities are treated as `conditional` (no required, no notExpected) and drift detection uses a default list

### Requirement: Queue-drainer parses and stores checklist on completion
When `queue-drainer.mjs complete` is called, it SHALL parse the agent output for a `<!-- CAPABILITY_CHECKLIST -->` tagged JSON block and store it as `capabilityChecklist` in the task's JSON file before archiving.

#### Scenario: Checklist extracted and stored
- **WHEN** an agent outputs a valid `<!-- CAPABILITY_CHECKLIST -->` JSON block AND `queue-drainer.mjs complete` is called
- **THEN** the task JSON in `tasks/completed/` contains a `capabilityChecklist` field with the parsed checklist

#### Scenario: Missing checklist logged as warning
- **WHEN** an agent completes a task without outputting a capability checklist
- **THEN** queue-drainer logs "Warning: no capability checklist found in output for <task-id>" AND the task is still marked complete (not blocked)

### Requirement: Capability checklist template
The system SHALL provide `agents/templates/capabilities.json.template` with a default configuration covering all known capabilities, with sensible defaults for each agent archetype (backend, frontend, reviewer, release manager).

#### Scenario: Template available after setup
- **WHEN** setup.mjs runs in a new project
- **THEN** `agents/capabilities.json` is created from the template with default entries for each configured agent
