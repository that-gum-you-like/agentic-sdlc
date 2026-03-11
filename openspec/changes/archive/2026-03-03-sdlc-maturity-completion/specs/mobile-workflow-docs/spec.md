## ADDED Requirements

### Requirement: Mobile workflow documentation
The system SHALL provide `docs/MOBILE_WORKFLOW.md` documenting how to manage LinguaFlow development from a mobile device using claude.ai/code.

#### Scenario: Document covers task creation
- **WHEN** the document is read
- **THEN** it explains how to add requirements via claude.ai chat that become OpenSpec changes

#### Scenario: Document covers task review
- **WHEN** the document is read
- **THEN** it explains how to review agent work, check PM Dashboard, and approve/reject via mobile

#### Scenario: Document covers kick-off
- **WHEN** the document is read
- **THEN** it explains how to start an autonomous session from mobile (`claude --continue --dangerously-skip-permissions`)

### Requirement: Quick reference commands
The document SHALL include a "Quick Commands" section with copy-pasteable commands for common mobile operations.

#### Scenario: Quick commands section exists
- **WHEN** the Quick Commands section is read
- **THEN** it includes commands for: check status, start autonomous session, view dashboard, deploy, check cost report
