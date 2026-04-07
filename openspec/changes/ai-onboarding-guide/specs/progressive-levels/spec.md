## ADDED Requirements

### Requirement: Per-level integration guides
The framework SHALL provide `docs/levels/level-{1-6}-*.md` — one self-contained guide per maturity level. Each guide works independently (user at Level 3 doesn't need to read Level 1).

#### Scenario: User wants to add task queue (Level 3)
- **WHEN** a user's project already has AI-assisted coding (Level 1-2) and wants to add multi-agent orchestration
- **THEN** `docs/levels/level-3-orchestrated.md` provides: prerequisites check, what files to create, which agents to add, how to configure the queue, and validation steps

#### Scenario: Each guide has validation checkpoint
- **WHEN** a user completes a level's integration steps
- **THEN** the guide provides a "you're done when" checklist with concrete verification commands

### Requirement: Level guides reference framework docs, not duplicate
Level guides SHALL link to existing framework documentation for detailed reference rather than duplicating content.

#### Scenario: Level 5 memory setup
- **WHEN** a user integrates the memory system
- **THEN** the guide provides the setup steps and links to `docs/memory-protocol.md` for the full 5-layer memory reference
