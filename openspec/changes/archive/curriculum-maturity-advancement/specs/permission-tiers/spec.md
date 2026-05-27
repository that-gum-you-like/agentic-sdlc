## ADDED Requirements

### Requirement: Permission tier configuration
`budget.json` SHALL support a `permissions` field per agent with values: `read-only`, `edit-gated`, `full-edit`, `deploy`. Default SHALL be `full-edit` for backward compatibility.

Tier definitions:
- `read-only`: Agent can read files, search, analyze. Cannot write files or run commands that modify state.
- `edit-gated`: Agent can read + propose edits, but edits require review approval before committing.
- `full-edit`: Agent can read, write, run tests, and commit. Cannot trigger deploy pipelines.
- `deploy`: Agent can do everything including triggering deploy pipelines.

#### Scenario: Agent configured with permission tier
- **WHEN** budget.json contains `"richmond": { "permissions": "read-only", "dailyTokenLimit": 50000 }`
- **THEN** Richmond's spawned instances are constrained to read-only operations

#### Scenario: Default permission for unconfigured agents
- **WHEN** budget.json contains `"roy": { "dailyTokenLimit": 100000 }` (no permissions field)
- **THEN** Roy defaults to `full-edit` permission tier

### Requirement: Queue-drainer enforces permission requirements
Tasks MAY specify a `requiredPermission` field. Queue-drainer SHALL only assign tasks to agents whose permission tier meets or exceeds the requirement. Permission hierarchy: `read-only` < `edit-gated` < `full-edit` < `deploy`.

#### Scenario: Deploy task only assigned to deploy-tier agent
- **WHEN** a task has `"requiredPermission": "deploy"` AND only Denholm has `"permissions": "deploy"`
- **THEN** the task is only assignable to Denholm AND other agents cannot claim it

#### Scenario: Read-only agent cannot claim edit task
- **WHEN** Richmond (read-only) attempts to claim a task requiring full-edit
- **THEN** the claim is rejected with "Permission denied: richmond has 'read-only', task requires 'full-edit'"

### Requirement: Worker injects permission constraints
`worker.mjs` SHALL inject the agent's permission tier into the prompt as explicit constraints. For `read-only`: "You MUST NOT write files, run destructive commands, or modify any state." For `edit-gated`: "You may propose edits but MUST NOT commit without review approval."

#### Scenario: Read-only agent gets constraints in prompt
- **WHEN** worker generates prompt for Richmond (read-only)
- **THEN** the prompt includes "PERMISSION TIER: read-only. You MUST NOT write files, create files, run destructive commands, or modify any state. Your role is analysis and review only."

### Requirement: Permission tier in status display
`queue-drainer.mjs status` SHALL display each agent's permission tier alongside their budget and instance count.

#### Scenario: Status shows permissions
- **WHEN** `queue-drainer.mjs status` is run
- **THEN** each agent line includes permission tier: "roy [full-edit] 45K/100K tokens, 1 instance"
