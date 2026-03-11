## ADDED Requirements

### Requirement: Playwright e2e test infrastructure
The system SHALL have Playwright installed as a dev dependency with a configuration file targeting the web export at `http://localhost:8081`.

#### Scenario: Playwright config exists
- **WHEN** a developer runs `npx playwright test`
- **THEN** Playwright reads `playwright.config.ts` and targets `http://localhost:8081`

#### Scenario: Dev server auto-start
- **WHEN** `npx playwright test` is invoked and no server is running on port 8081
- **THEN** Playwright's `webServer` config starts `npx expo start --web --port 8081` automatically

### Requirement: Login flow e2e test
The system SHALL have an e2e test that verifies the login page renders and demo mode buttons work.

#### Scenario: Login page loads
- **WHEN** Playwright navigates to the root URL
- **THEN** the page displays "LinguaFlow", email/password inputs, and "Student Demo" / "Creator Demo" buttons

#### Scenario: Student demo mode entry
- **WHEN** the user clicks "Student Demo"
- **THEN** the app navigates to the student feed screen

### Requirement: Quiz flow e2e test
The system SHALL have an e2e test covering the student quiz flow from feed to results.

#### Scenario: Complete quiz flow
- **WHEN** a student is in demo mode and navigates through feed → video → quiz → answer all questions → submit
- **THEN** the quiz results screen displays with a score and XP earned

### Requirement: Creator flow e2e test
The system SHALL have an e2e test verifying the creator dashboard loads.

#### Scenario: Creator demo dashboard
- **WHEN** the user enters Creator Demo mode
- **THEN** the creator dashboard screen loads with analytics sections visible

### Requirement: npm script for e2e tests
The system SHALL expose e2e tests via `npm run test:e2e`.

#### Scenario: e2e script in package.json
- **WHEN** a developer runs `npm run test:e2e`
- **THEN** Playwright runs all tests in `__tests__/e2e/`
