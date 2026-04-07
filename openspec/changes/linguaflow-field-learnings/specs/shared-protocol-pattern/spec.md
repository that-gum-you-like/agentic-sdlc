## ADDED Requirements

### Requirement: SHARED_PROTOCOL.md template
The framework SHALL include `agents/templates/SHARED_PROTOCOL.md.template` containing the common sections that all agents share: memory protocol, heartbeat procedure, communication standards, quality gates, and escalation procedure.

#### Scenario: Template contains all shared sections
- **WHEN** a user reads the SHARED_PROTOCOL.md.template
- **THEN** it contains sections for: Memory Protocol (read before/write after), Heartbeat Procedure (8 steps), Communication Standards (commit format, channel posting), Quality Gates (tests, review, spec match), and Escalation Protocol

### Requirement: Agent prompts reference shared protocol
The `AGENT.md.template` SHALL include a single-line reference to SHARED_PROTOCOL.md instead of duplicating shared content. Agent-specific prompts contain ONLY: identity, domain, domain-specific rules, and failures.

#### Scenario: New agent created with shared protocol reference
- **WHEN** `setup.mjs` creates a new agent's AGENT.md
- **THEN** the file contains `<!-- See agents/SHARED_PROTOCOL.md for memory protocol, heartbeat, communication, quality gates, escalation -->` instead of duplicating those sections
- **AND** the AGENT.md is at least 70 tokens shorter than it would be with inline duplication

### Requirement: Setup.mjs scaffolds shared protocol
`setup.mjs` SHALL create `agents/SHARED_PROTOCOL.md` from the template during project setup.

#### Scenario: Shared protocol created on setup
- **WHEN** `setup.mjs` runs for a new project
- **THEN** `agents/SHARED_PROTOCOL.md` exists with all shared sections populated
