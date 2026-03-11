## ADDED Requirements

### Requirement: An integration test tier SHALL exist between unit and e2e
A `test:integration` npm script MUST exist in package.json pointing to `__tests__/integration/`. Integration tests verify that services, stores, and hooks work together correctly.

#### Scenario: Integration test script runs
- **WHEN** `npm run test:integration` is executed
- **THEN** Jest runs tests matching `__tests__/integration/**/*.test.ts`

#### Scenario: At least one integration test exists
- **WHEN** the integration test directory is checked
- **THEN** at least one test file exists that tests service-to-store or service-to-hook interaction

#### Scenario: Pre-commit hook includes integration tests
- **WHEN** a commit is attempted with changes to service or store files
- **THEN** related integration tests run as part of the pre-commit check
