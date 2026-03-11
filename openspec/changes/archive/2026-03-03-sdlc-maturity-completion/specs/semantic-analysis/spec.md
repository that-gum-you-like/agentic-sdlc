## ADDED Requirements

### Requirement: AST-based code analyzer
The system SHALL provide `agents/ast-analyzer.mjs` that uses the TypeScript compiler API to detect code quality issues that ESLint and defeat tests cannot catch.

#### Scenario: Detect unused exports
- **WHEN** the analyzer runs on `src/services/`
- **THEN** it reports any exported functions/types that are not imported anywhere in the project

#### Scenario: Detect circular dependencies
- **WHEN** the analyzer runs on `src/`
- **THEN** it reports any circular import chains (A imports B imports C imports A)

#### Scenario: Detect dead code paths
- **WHEN** the analyzer finds functions that are defined but never called (not exported, not referenced)
- **THEN** it reports them as dead code candidates

### Requirement: CLI interface
The script SHALL accept `--path <dir>` to scope analysis and `--json` for machine-readable output.

#### Scenario: Scoped analysis
- **WHEN** `node agents/ast-analyzer.mjs --path src/services/` is run
- **THEN** only files under `src/services/` are analyzed

#### Scenario: Default analysis
- **WHEN** `node agents/ast-analyzer.mjs` is run with no arguments
- **THEN** it analyzes the full `LinguaFlow/src/` directory

### Requirement: Integration with four-layer validation
The AST analyzer SHALL be invocable from `four-layer-validate.mjs` as part of layer 3 (code analysis).

#### Scenario: Layer 3 includes AST results
- **WHEN** four-layer validation runs layer 3
- **THEN** AST analyzer findings are included in the layer 3 report alongside defeat test results
