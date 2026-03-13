## ADDED Requirements

### Requirement: JSON Schema files for inter-agent handoffs
The system SHALL provide JSON Schema files in `agents/schemas/` for all structured inter-agent communication types: `task-claim.schema.json`, `task-complete.schema.json`, `review-request.schema.json`, `review-result.schema.json`, `deploy-request.schema.json`, `human-task.schema.json`.

#### Scenario: Schema files exist
- **WHEN** the framework is set up via setup.mjs
- **THEN** `agents/schemas/` contains all 6 schema files AND each is valid JSON Schema (draft-07 or later)

### Requirement: Queue-drainer validates task JSON on claim
When `queue-drainer.mjs claim` is called, the task JSON SHALL be validated against `task-claim.schema.json`. If validation fails, the claim SHALL be rejected with a descriptive error listing which fields are missing or invalid.

#### Scenario: Valid claim succeeds
- **WHEN** `queue-drainer.mjs claim TASK-010 roy` is called AND the task JSON has all required fields
- **THEN** the claim succeeds normally

#### Scenario: Invalid claim rejected
- **WHEN** a task JSON is missing `estimatedTokens`
- **THEN** the claim is rejected with "Validation error: task-claim requires 'estimatedTokens' (number)"

### Requirement: Queue-drainer validates task JSON on complete
When `queue-drainer.mjs complete` is called, the completion payload SHALL be validated against `task-complete.schema.json`. Required fields: `taskId`, `agentName`, `filesChanged` (array), `testsPassed` (number), `testsFailed` (number), `commitHash` (string), `learnings` (array of strings).

#### Scenario: Completion with learnings recorded
- **WHEN** `queue-drainer.mjs complete TASK-010 passing` is called with a valid completion payload
- **THEN** the task is marked complete AND learnings are passed to memory-manager for recording

#### Scenario: Completion without required fields rejected
- **WHEN** completion is attempted without `commitHash`
- **THEN** completion is rejected with "Validation error: task-complete requires 'commitHash' (string)"

### Requirement: Matrix-cli validates message payloads
When `matrix-cli.mjs` sends a structured message (review-request, review-result, deploy-request), the payload SHALL be validated against the corresponding schema. Invalid payloads SHALL be rejected before sending.

#### Scenario: Structured review request validated
- **WHEN** a review-request message is sent via matrix-cli
- **THEN** the payload is validated against `review-request.schema.json` AND sent only if valid

### Requirement: Schema validation uses ajv
JSON Schema validation SHALL use the `ajv` npm package (or equivalent lightweight validator). No heavy framework dependencies for schema validation.

#### Scenario: ajv validates schemas
- **WHEN** a schema validation is performed
- **THEN** it uses ajv (verifiable in package.json dependencies) AND returns structured error messages
