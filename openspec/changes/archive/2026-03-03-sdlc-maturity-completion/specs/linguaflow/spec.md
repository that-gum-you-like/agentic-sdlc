## ADDED Requirements

### Requirement: Task files have populated estimatedTokens
All task template files SHALL have the `estimatedTokens` field populated with a value based on task type: simple fix (3500), feature (20000), architecture (35000), research (65000).

#### Scenario: New tasks get token estimates
- **WHEN** a new task file is created in `tasks/queue/`
- **THEN** its `estimatedTokens` field is set to a non-null integer based on the task type

#### Scenario: Queue status shows token estimates
- **WHEN** `node agents/queue-drainer.mjs status` is run
- **THEN** each pending task displays its estimated token cost
