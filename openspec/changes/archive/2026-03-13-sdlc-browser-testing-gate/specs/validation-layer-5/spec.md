## ADDED Requirements

### Requirement: Layer 5 Browser Verification
The validation patterns document SHALL define a Layer 5 (Browser Verification) that tests the system from the user's perspective in a real browser, complementing Layers 1-4 which operate at the code level.

#### Scenario: Validation patterns include Layer 5
- **WHEN** an agent reads the validation patterns document
- **THEN** Layer 5 is defined with principles, required scenarios, and when-to-run guidance

### Requirement: Layer 5 Required Scenarios
Layer 5 SHALL define required browser test scenarios: refresh resilience, demo/seed mode journey, navigation completeness, state persistence, and error state handling.

#### Scenario: Framework prescribes refresh resilience testing
- **WHEN** a project implements Layer 5
- **THEN** every route group is tested for hard browser refresh survival

#### Scenario: Framework prescribes navigation completeness
- **WHEN** a project implements Layer 5
- **THEN** every UI link/button is verified to navigate to a screen with content

### Requirement: Built Artifact Testing
Layer 5 SHALL require that browser tests run against the built production artifact, not the development server, to catch build-specific issues.

#### Scenario: E2E tests target production build
- **WHEN** browser E2E tests run in the deploy pipeline
- **THEN** they run against the compiled/exported build output
- **AND** not against the hot-reloading dev server
