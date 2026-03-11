## ADDED Requirements

### Requirement: Conditional Browser E2E in Micro Cycle
The agent micro cycle SHALL include a conditional step: "Run browser E2E" that triggers when frontend files (screens, navigation, components) are modified. Backend-only changes skip this step.

#### Scenario: Frontend change triggers browser E2E
- **WHEN** an agent modifies screen, navigation, or component files
- **THEN** the micro cycle requires running browser E2E tests before committing

#### Scenario: Backend change skips browser E2E
- **WHEN** an agent modifies only service, utility, or configuration files with no frontend impact
- **THEN** the micro cycle does not require browser E2E

### Requirement: Testing Tier 5 Definition
CLAUDE.md SHALL define a Tier 5 (Browser E2E) in the testing tiers table, specifying when to run, what it checks, and that it gates production deploys.

#### Scenario: Testing tiers reference includes browser E2E
- **WHEN** an agent reads the testing tiers in CLAUDE.md
- **THEN** Tier 5 is defined with scope (screens, navigation, state), tools (browser automation), and gate (must pass before deploy)

### Requirement: Done Checklist Includes Browser Verification
The Done checklist template SHALL include a browser verification step requiring the agent to exercise every changed feature in a real browser, capture screenshots, visually confirm each screenshot, and only report done after verification passes.

#### Scenario: Agent verifies changes in browser before reporting done
- **WHEN** an agent completes frontend implementation and deploys
- **THEN** the Done checklist requires browser verification with screenshot proof
- **AND** the agent fixes and re-deploys if verification reveals issues
- **AND** stakeholder notification happens only after verification passes
