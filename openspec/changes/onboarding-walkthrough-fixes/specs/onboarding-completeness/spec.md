## ADDED Requirements

### Requirement: Greenfield project guidance
ONBOARDING.md SHALL include guidance for projects with no existing code, covering how to bootstrap from scratch.

#### Scenario: AI agent discovers empty directory
- **WHEN** Phase 1 discovery finds no package.json, no source files, no tests
- **THEN** ONBOARDING.md directs the agent to start at Level 1 with a minimal CLAUDE.md and skip to setup.mjs when ready for Level 3

### Requirement: Monorepo documentation
ONBOARDING.md SHALL document that setup.mjs supports monorepo structures via the `appDir` field in project.json.

#### Scenario: Project has app in subdirectory
- **WHEN** the real app code is in a subdirectory (e.g., `app/`, `packages/web/`)
- **THEN** ONBOARDING.md explains how to set `appDir` during setup and how discovery auto-detects it

### Requirement: Multi-language guidance
ONBOARDING.md SHALL include adaptation notes for Python, Rust, and Go projects in Phase 3.

#### Scenario: Python project onboarding
- **WHEN** discovery detects Python
- **THEN** ONBOARDING.md provides Python-specific test command examples, directory conventions, and CLAUDE.md patterns

### Requirement: Expanded troubleshooting
ONBOARDING.md troubleshooting table SHALL cover: unknown language detection, CLAUDE.md not loading, missing agents directory, and test command failures.

#### Scenario: Troubleshooting covers common errors
- **WHEN** a new user encounters a setup problem
- **THEN** the troubleshooting table has a matching entry with a clear solution

### Requirement: Prerequisites stated upfront
README.md and ONBOARDING.md SHALL state Node.js 18+ and git as prerequisites.

#### Scenario: User without Node.js
- **WHEN** a user reads the README Quick Start
- **THEN** they see the Node.js requirement before attempting any commands

### Requirement: Level guide cross-reference consistency
All 6 level guides SHALL use the same cross-reference format for "Next Level" sections.

#### Scenario: Level 3 includes path to Level 4
- **WHEN** a user finishes Level 3
- **THEN** the "Next Level" section links to `level-4-quality.md` using the same format as other levels

### Requirement: No-tests guidance in Level 2
Level 2 guide SHALL include guidance for projects that don't have any tests yet.

#### Scenario: Project has zero tests
- **WHEN** Level 2 prerequisites check reveals no test framework
- **THEN** the guide provides a minimal setup path: install test framework, write one test, then proceed

### Requirement: Discovery example output
ONBOARDING.md SHALL include an example of `--discover` output so users know what to expect.

#### Scenario: User sees example before running command
- **WHEN** reading ONBOARDING.md Phase 1
- **THEN** there's an annotated example JSON output showing what each field means

### Requirement: Human-readable discovery output
`setup.mjs --discover --human` SHALL output a 1-line summary before the JSON.

#### Scenario: Human runs discover
- **WHEN** `--human` flag is passed with `--discover`
- **THEN** output starts with a summary line like "TypeScript/React Native project at Level 5" followed by the JSON
