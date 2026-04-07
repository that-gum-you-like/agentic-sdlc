## ADDED Requirements

### Requirement: Escalation protocol template
The framework SHALL include `agents/templates/escalation-protocol.md.template` defining a multi-tier escalation path: peer → domain lead → CTO → CEO → Board. Each tier specifies the handoff mechanism and timeout before auto-escalation.

#### Scenario: Peer escalation
- **WHEN** an agent encounters a blocker in a peer's domain
- **THEN** the agent posts the blocker in the relevant domain channel with specific context and tags the peer agent

#### Scenario: Timeout-based auto-escalation
- **WHEN** a blocker remains unresolved after the tier's timeout (default: 30 minutes for peer, 2 hours for domain lead, 4 hours for CTO)
- **THEN** the escalation automatically advances to the next tier
- **AND** the notification includes the full escalation history

#### Scenario: Board escalation for infrastructure issues
- **WHEN** a blocker is a system-level issue (permissions, API access, infrastructure) that no agent can resolve
- **THEN** the escalation skips to Board tier immediately with an infrastructure tag

### Requirement: Escalation status tracking
Task JSON files SHALL support a `blockedBy` field with structured escalation data: `{ "reason": "...", "tier": "peer|lead|cto|ceo|board", "escalatedAt": "ISO8601", "history": [] }`.

#### Scenario: Escalation visible in queue status
- **WHEN** `queue-drainer.mjs status` runs and a task has active escalation
- **THEN** the output shows the task's escalation tier, duration, and who it's waiting on

### Requirement: Platform-agnostic escalation
The escalation protocol SHALL work via the orchestration adapter interface, not Paperclip-specific status transitions. Channel posting uses the notification adapter.

#### Scenario: Escalation works with file-based adapter
- **WHEN** the project uses `file-based` orchestration
- **THEN** escalations are tracked in task JSON files and notifications go through the configured notification provider
