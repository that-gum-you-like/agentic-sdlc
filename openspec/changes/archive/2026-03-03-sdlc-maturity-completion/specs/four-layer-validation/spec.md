## ADDED Requirements

### Requirement: Four-layer validation script
The system SHALL provide `agents/four-layer-validate.mjs` that runs four sequential validation layers on a set of changed files.

#### Scenario: Layer 1 — Research (imports and types)
- **WHEN** the script runs layer 1 on changed files
- **THEN** it verifies all imports resolve, TypeScript types match, and no missing dependencies

#### Scenario: Layer 2 — Critique (checklist review)
- **WHEN** the script runs layer 2
- **THEN** it checks changed files against Richmond's checklist (services return {data,error}, no any types, no console.log, file size limits)

#### Scenario: Layer 3 — Code (anti-pattern scan)
- **WHEN** the script runs layer 3
- **THEN** it runs defeat tests and AST analysis on changed files, reporting violations

#### Scenario: Layer 4 — Statistics (metrics)
- **WHEN** the script runs layer 4
- **THEN** it reports: file size deltas, test count deltas, and number of new/modified files

### Requirement: Validation report output
The script SHALL output a structured JSON report with pass/fail per layer and detail entries.

#### Scenario: All layers pass
- **WHEN** all four layers find no issues
- **THEN** the report shows `{ passed: true, layers: [...] }` with each layer having `status: "pass"`

#### Scenario: Layer fails
- **WHEN** layer 2 finds a file with `console.log`
- **THEN** the report shows `passed: false` with layer 2 having `status: "fail"` and a detail entry

### Requirement: CLI interface
The script SHALL accept `--files <glob>` to scope analysis, and `--json` for machine-readable output.

#### Scenario: Scoped validation
- **WHEN** `node agents/four-layer-validate.mjs --files "src/services/*.ts"` is run
- **THEN** only files matching the glob are validated

#### Scenario: Full validation
- **WHEN** `node agents/four-layer-validate.mjs` is run with no arguments
- **THEN** it validates all files changed since the last commit (via `git diff --name-only HEAD~1`)
