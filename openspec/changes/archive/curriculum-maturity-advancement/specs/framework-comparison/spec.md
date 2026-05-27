## ADDED Requirements

### Requirement: Comparison document
The system SHALL provide `docs/comparison.md` mapping framework concepts to equivalent features in LangGraph, Autogen, CrewAI, OpenAI Swarm, and Claude Agent SDK. The document MUST cover: task routing, agent prompts, memory systems, coordination patterns, validation, and unique features.

#### Scenario: Comparison document exists
- **WHEN** the framework repo is cloned
- **THEN** `docs/comparison.md` exists AND contains a comparison table with at least 8 concept rows AND 5 framework columns

### Requirement: Concept mapping completeness
The comparison SHALL cover at minimum:
- Task queue / routing → LangGraph conditional edges, Autogen GroupChat, Swarm handoffs
- AGENT.md → Autogen AssistantAgent system_message, CrewAI Agent role
- domains.json → LangGraph router, CrewAI task delegation
- 5-layer memory → LangGraph checkpoints, Autogen memory
- Micro cycle → ReACT loop variants
- OpenSpec → (no equivalent — unique)
- Defeat tests → (no equivalent — unique)
- REM Sleep → (no equivalent — unique)

#### Scenario: Unique features highlighted
- **WHEN** a reader reviews the comparison
- **THEN** features unique to our framework (OpenSpec, defeat tests, REM sleep, pattern-hunt, maturation tracking) are clearly marked as "No equivalent" in other frameworks

### Requirement: When-to-use guidance
The document SHALL include a "When to use which" section with clear recommendations: when our framework is the best choice vs. when LangGraph, Autogen, or other tools are more appropriate.

#### Scenario: Honest trade-off guidance
- **WHEN** a reader evaluates frameworks
- **THEN** the comparison honestly states limitations of our framework (e.g., "requires Claude Code", "file-based coordination limits real-time use") alongside strengths

### Requirement: Evolution timeline reference in AGENT.md template
The `agents/templates/AGENT.md.template` SHALL include an "## Evolution Timeline" section documenting the expected 6-week maturation cycle from the curriculum (Week 1: mistakes → Week 6: new patterns emerge, cycle repeats).

#### Scenario: Template includes evolution section
- **WHEN** a new agent is created from the template
- **THEN** the generated AGENT.md contains "## Evolution Timeline" with week-by-week expectations
