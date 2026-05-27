## ADDED Requirements

### Requirement: Allowlist-based defeat tests
The `four-layer-validate.mjs` script SHALL support an `--allowlist <file>` flag that loads a JSON file mapping violation types to lists of pre-existing file paths. New violations not in the allowlist SHALL fail the build. Violations fixed (file no longer violates) SHALL be automatically removed from the allowlist.

#### Scenario: New violation fails build
- **WHEN** `four-layer-validate.mjs --allowlist allowlist.json` runs and detects an `any`-type violation in `newService.ts` that is NOT in the allowlist
- **THEN** the script exits with error code 1 and reports the new violation with instructions to fix it (not add it to the allowlist)

#### Scenario: Pre-existing violation passes
- **WHEN** a violation is detected in a file listed in the allowlist for that violation type
- **THEN** the script reports it as "known debt" but does NOT fail the build

#### Scenario: Fixed violation shrinks allowlist
- **WHEN** `four-layer-validate.mjs --allowlist allowlist.json --update` runs and a file in the allowlist no longer has the listed violation
- **THEN** that entry is removed from the allowlist JSON file
- **AND** the script reports "debt reduced: removed X from Y allowlist"

### Requirement: Allowlist JSON template
The framework SHALL include `agents/templates/defeat-allowlist.json.template` with the schema and categories matching `four-layer-validate.mjs` violation types (any-type, console-log, file-size, missing-error-handling, hardcoded-values).

#### Scenario: Template scaffolded by setup.mjs
- **WHEN** `setup.mjs` scaffolds a new project
- **THEN** it creates an empty allowlist at the project's configured path with all violation categories initialized to empty arrays

### Requirement: Allowlist never grows via automation
No automated process SHALL add entries to the allowlist. Entries MAY only be added manually by a human with a commit message explaining the debt.

#### Scenario: Attempt to auto-add blocked
- **WHEN** a script or agent attempts to programmatically add an entry to the allowlist
- **THEN** the operation SHALL be rejected with a message: "Allowlist entries require manual human addition with justification"
