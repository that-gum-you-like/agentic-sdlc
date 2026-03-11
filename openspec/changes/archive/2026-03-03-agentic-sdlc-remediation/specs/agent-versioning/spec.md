## ADDED Requirements

### Requirement: Agent prompts SHALL have version headers
Each `agents/*/AGENT.md` file MUST contain an HTML comment version header in the format: `<!-- version: X.Y.Z | date: YYYY-MM-DD -->` as the first line.

#### Scenario: Version header present
- **WHEN** an AGENT.md file is read
- **THEN** the first line is a version header comment with semver and date

### Requirement: Agent versions SHALL be snapshotable
A `version-snapshot.mjs` script MUST copy all current AGENT.md files to `agents/versions/YYYY-MM-DD/` for rollback capability.

#### Scenario: Take a snapshot
- **WHEN** `node agents/version-snapshot.mjs snapshot` is run
- **THEN** all 6 AGENT.md files are copied to `agents/versions/<today's date>/`

#### Scenario: List snapshots
- **WHEN** `node agents/version-snapshot.mjs list` is run
- **THEN** all existing snapshot dates are listed

#### Scenario: Restore a snapshot
- **WHEN** `node agents/version-snapshot.mjs restore <date>` is run
- **THEN** all AGENT.md files are restored from the specified snapshot

### Requirement: Memory migration SHALL run on version changes
A `migrate-memory.mjs` script MUST check agent memories for references to outdated patterns when an agent version changes.

#### Scenario: Check mode (default)
- **WHEN** `node agents/migrate-memory.mjs --check` is run
- **THEN** flagged entries are reported but no changes are made

#### Scenario: Apply mode
- **WHEN** `node agents/migrate-memory.mjs --apply` is run
- **THEN** flagged entries are updated with `"migrated_from"` field and content adjusted

#### Scenario: Compare versions
- **WHEN** an AGENT.md version header differs from the latest snapshot
- **THEN** the migration script identifies what rules were added/removed/changed between versions
