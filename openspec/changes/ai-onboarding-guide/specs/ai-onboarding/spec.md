## ADDED Requirements

### Requirement: ONBOARDING.md as AI-agent entry point
The framework SHALL provide `ONBOARDING.md` at the repo root, written as instructions an AI coding agent can follow to integrate the framework into a user's project. The file SHALL be both AI-parseable and human-readable.

#### Scenario: AI agent reads ONBOARDING.md first
- **WHEN** an AI agent is asked to integrate the agentic-sdlc framework
- **THEN** ONBOARDING.md provides a step-by-step protocol: discover project → assess maturity → choose starting level → integrate incrementally → validate

#### Scenario: Discovery phase before any changes
- **WHEN** the onboarding process starts
- **THEN** the AI agent reads the user's existing project files (package.json, test config, CI config, git history) BEFORE recommending any framework features

#### Scenario: Never forces the full framework
- **WHEN** recommending integration steps
- **THEN** every recommendation is conditional ("if the project would benefit from X") and the user can adopt one maturity level at a time

### Requirement: CLAUDE.md cross-reference
CLAUDE.md SHALL include a prominent note near the top directing AI agents helping with setup to read ONBOARDING.md first.

#### Scenario: Agent helping with initial setup
- **WHEN** an AI agent loads CLAUDE.md while helping set up the framework for the first time
- **THEN** it finds a clear instruction to read ONBOARDING.md before applying the strict rules

### Requirement: .cursorrules and .windsurfrules
The framework SHALL provide `.cursorrules` and `.windsurfrules` at the repo root containing condensed onboarding instructions that point to ONBOARDING.md for the full protocol.

#### Scenario: Cursor user opens the repo
- **WHEN** a user opens the agentic-sdlc repo in Cursor
- **THEN** Cursor automatically loads `.cursorrules` which provides context about the framework and directs the agent to ONBOARDING.md

### Requirement: README.md restructured for discoverability
README.md SHALL lead with a concise value proposition, link to ONBOARDING.md prominently, and provide quick-start paths for different user types (AI-assisted, manual, learning).

#### Scenario: New user lands on GitHub page
- **WHEN** a user visits the GitHub repo for the first time
- **THEN** they see: what the framework does (3 sentences), how to start (point AI agent at repo OR run setup.mjs), and a link to ONBOARDING.md
