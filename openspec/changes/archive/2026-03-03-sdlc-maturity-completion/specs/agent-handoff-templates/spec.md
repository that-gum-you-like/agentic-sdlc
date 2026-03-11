## ADDED Requirements

### Requirement: Handoff template file
The system SHALL provide `agents/handoff-template.md` defining the required sections for any agent submission to #reviews.

#### Scenario: Template contains required sections
- **WHEN** the template file is read
- **THEN** it includes sections for: Task ID, Files Changed, Tests Added/Modified, Self-Assessment (against Richmond's checklist), and Known Risks

### Requirement: Agent AGENT.md references handoff template
All 6 agent AGENT.md files SHALL reference the handoff template in their "Submits to #reviews" interface section.

#### Scenario: Roy references template
- **WHEN** Roy's AGENT.md is read
- **THEN** the Interfaces section includes a reference to `agents/handoff-template.md` for submissions

#### Scenario: All agents reference template
- **WHEN** all 6 AGENT.md files are checked
- **THEN** each one that submits to #reviews references the handoff template

### Requirement: Behavior test validates handoff reference
The behavior test suite SHALL include a check that all submitting agents reference the handoff template.

#### Scenario: Behavior test passes
- **WHEN** `node agents/test-behavior.mjs` is run
- **THEN** a check confirms agents referencing #reviews also reference `handoff-template.md`
