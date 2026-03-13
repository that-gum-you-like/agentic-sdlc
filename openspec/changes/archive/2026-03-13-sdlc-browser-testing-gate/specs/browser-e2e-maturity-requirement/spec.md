## ADDED Requirements

### Requirement: Browser E2E in Level 4 Quality Checklist
The maturity model Level 4 (Quality) new-project checklist SHALL include browser E2E testing of critical user flows, refresh resilience, and a deploy gate that requires E2E to pass before production.

#### Scenario: Level 4 audit flags missing browser E2E
- **WHEN** a project is assessed against Level 4 maturity
- **THEN** the audit checks for browser E2E tests covering critical user flows
- **AND** flags a gap if no browser-based tests exist

### Requirement: User Journey Coverage in Level 5 Evolution Checklist
The maturity model Level 5 (Evolution) checklist SHALL require user journey coverage for new features, dead link auditing, and state persistence testing.

#### Scenario: Level 5 audit requires journey tests for new features
- **WHEN** a project at Level 5 adds a new frontend feature
- **THEN** the maturity model requires a corresponding browser journey test
- **AND** the audit verifies coverage exists
