## ADDED Requirements

### Requirement: Deploy Pipeline E2E Gate Documentation
The framework SHALL document a deploy pipeline pattern where browser E2E tests run against the built artifact before deploying to production, with failures aborting the deploy.

#### Scenario: Deploy pipeline pattern includes E2E gate
- **WHEN** a project follows the framework's deploy pipeline guidance
- **THEN** the pipeline runs browser E2E against the local build before uploading to production
- **AND** E2E failures abort the deploy

### Requirement: Case Study Documentation
The framework SHALL document the "6,600 tests pass, 6 browser bugs ship" failure as a case study in `framework/case-studies.md`, including root cause analysis and the fix (adding browser E2E as a maturity requirement).

#### Scenario: Case study educates future users
- **WHEN** a developer reads the case studies document
- **THEN** they understand why code-level tests alone are insufficient for frontend applications
- **AND** they learn the pattern of adding browser E2E as a deploy gate
