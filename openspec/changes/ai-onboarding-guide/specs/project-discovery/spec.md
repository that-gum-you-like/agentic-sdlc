## ADDED Requirements

### Requirement: setup.mjs --discover flag
`setup.mjs` SHALL support a `--discover` flag that scans the target project directory and outputs a structured JSON report of detected project characteristics.

#### Scenario: Discover a Node.js project
- **WHEN** `node ~/agentic-sdlc/setup.mjs --discover --dir /path/to/project` runs
- **THEN** it outputs JSON with detected: language, framework, test framework, CI system, package manager, existing agent config, and suggested agents/level

#### Scenario: Discovery is non-destructive
- **WHEN** `--discover` flag is used
- **THEN** NO files are created, modified, or deleted. Output is read-only analysis.

#### Scenario: AI agent uses discovery output
- **WHEN** an AI agent runs --discover before integration
- **THEN** it receives structured data it can use to skip redundant setup steps and pre-fill configuration
