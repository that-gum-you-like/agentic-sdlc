## ADDED Requirements

### Requirement: Every OpenSpec change directory SHALL have a status.json file
Each change directory in `openspec/changes/` MUST contain a `status.json` file with fields: `status` (active|completed|archived), `phase` (proposal|design|specs|tasks|implementing|review|done), `created` (ISO date), and `lastUpdated` (ISO date).

#### Scenario: New change created
- **WHEN** a new OpenSpec change is created via `openspec new change`
- **THEN** a `status.json` file is created with `status: "active"`, `phase: "proposal"`, and current timestamps

#### Scenario: Existing changes backfilled
- **WHEN** the remediation runs against existing changes without status.json
- **THEN** a status.json is created with phase inferred from existing artifacts (e.g., if tasks.md exists, phase is "tasks" or later)

### Requirement: All proposals SHALL include a Value Analysis section
Every `proposal.md` in `openspec/changes/` MUST contain a `## Value Analysis` section with: user personas, problem statement, priority rationale, "what happens if we don't build this", and success metrics.

#### Scenario: Existing proposals updated
- **WHEN** the remediation runs against existing proposals without Value Analysis
- **THEN** a Value Analysis section is added based on the proposal's existing Why and Impact sections

#### Scenario: Future proposals require Value Analysis
- **WHEN** CLAUDE.md is updated with the new template requirement
- **THEN** agents creating new proposals MUST include the Value Analysis section
