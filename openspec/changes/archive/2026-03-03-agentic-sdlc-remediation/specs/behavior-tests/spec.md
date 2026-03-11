## ADDED Requirements

### Requirement: Behavior tests SHALL validate agent prompt quality
A `test-behavior.mjs` script MUST verify that each agent's AGENT.md and core memories contain required instructions for known scenarios.

#### Scenario: Roy's prompt includes {data, error} pattern
- **WHEN** behavior tests check `agents/roy/AGENT.md`
- **THEN** the file contains instructions about returning `{ data, error }` from services

#### Scenario: All agents have failure memories
- **WHEN** behavior tests check each agent's `memory/core.json`
- **THEN** every agent has at least one entry in their `failures` array

#### Scenario: Richmond's checklist covers all defeat test categories
- **WHEN** behavior tests check `agents/richmond/checklist.md`
- **THEN** the checklist mentions: any types, console.log, file size limits, {data, error} pattern

#### Scenario: Agent prompts include memory read instruction
- **WHEN** behavior tests check each AGENT.md
- **THEN** every agent prompt includes instructions to read memory before starting work

### Requirement: Behavior tests SHALL run in dry-run mode
The script MUST support `--dry-run` to report results without failing.

#### Scenario: Dry run
- **WHEN** `node agents/test-behavior.mjs --dry-run` is run
- **THEN** all checks are evaluated and results printed, but exit code is always 0

#### Scenario: Normal run
- **WHEN** `node agents/test-behavior.mjs` is run
- **THEN** failing checks cause exit code 1

### Requirement: Agent failure memories SHALL be populated
All 6 agents MUST have at least 1 failure memory in their `core.json` `failures` array with fields: `id`, `date`, `description`, `lesson`, `severity`.

#### Scenario: Failure memory structure
- **WHEN** an agent's `core.json` failures array is read
- **THEN** each entry has `id`, `date`, `description`, `lesson`, and `severity` fields

#### Scenario: Failures drive self-correction
- **WHEN** an agent reads its core memory before starting a task
- **THEN** failure entries are visible and inform the agent's approach
