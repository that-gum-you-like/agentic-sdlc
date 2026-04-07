# Spec: CLI Guard Defeat Test

**Change**: self-bootstrap-learnings
**Status**: draft
**Created**: 2026-04-07

## ADDED Requirements

### Requirement: CLI guard defeat test

`four-layer-validate.mjs` SHALL scan `.mjs` files for `process.argv` usage outside `__isMainModule` guards. Files that export functions AND have unguarded CLI routing SHALL fail validation. An allowlist SHALL be supported for pure CLI tools that intentionally use `process.argv` without guards.

#### Scenario: Script with exports and unguarded process.argv fails

WHEN `four-layer-validate.mjs` scans a `.mjs` file
AND the file contains `export` statements
AND the file references `process.argv` outside an `__isMainModule` guard
THEN validation SHALL fail with an error identifying the file and the unguarded usage.

#### Scenario: Script with __isMainModule guard passes

WHEN `four-layer-validate.mjs` scans a `.mjs` file
AND the file contains `export` statements
AND all `process.argv` references are inside an `__isMainModule` guard block
THEN validation SHALL pass.

#### Scenario: Pure CLI script with no exports passes

WHEN `four-layer-validate.mjs` scans a `.mjs` file
AND the file contains NO `export` statements
AND the file references `process.argv`
THEN validation SHALL pass because the file is a pure CLI tool.

#### Scenario: Allowlisted script passes

WHEN `four-layer-validate.mjs` scans a `.mjs` file
AND the file is listed in the CLI guard allowlist
THEN validation SHALL pass regardless of `process.argv` usage or export statements.

### Requirement: CLAUDE.md non-negotiable rule for CLI guards

`CLAUDE.md` SHALL include a non-negotiable rule requiring that any `.mjs` file which exports functions MUST wrap `process.argv` routing inside an `__isMainModule` guard. This prevents imported library modules from triggering CLI side effects.

#### Scenario: CLAUDE.md documents CLI guard rule

WHEN a contributor reads `CLAUDE.md`
THEN they SHALL find a rule in the non-negotiable section stating that exported modules must guard `process.argv` usage with `__isMainModule`.
