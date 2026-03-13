## ADDED Requirements

### Requirement: Umami analytics provider
The analytics service SHALL implement an `UmamiProvider` class that conforms to the existing `AnalyticsProvider` interface and sends events to a self-hosted Umami instance.

#### Scenario: Umami provider activated via env vars
- **WHEN** `UMAMI_URL` and `UMAMI_WEBSITE_ID` environment variables are set
- **THEN** the analytics service uses `UmamiProvider` instead of `InMemoryProvider`

#### Scenario: Fallback to InMemoryProvider
- **WHEN** `UMAMI_URL` is not set
- **THEN** the analytics service uses `InMemoryProvider` (current behavior unchanged)

#### Scenario: Track event via Umami
- **WHEN** `trackEvent('quiz_completed', { score: 85 })` is called with UmamiProvider active
- **THEN** the provider sends a POST request to `${UMAMI_URL}/api/send` with the event payload

#### Scenario: Track screen view via Umami
- **WHEN** `trackScreenView('home')` is called
- **THEN** the provider sends a page view event to Umami with the screen name as page path

### Requirement: C1/C2 question bank expansion
The CEFR question bank seed SHALL contain at least 100 items at C1 level and 100 items at C2 level, covering all 4 skills (reading, grammar, vocabulary, listening) and multiple question types.

#### Scenario: C1 question count
- **WHEN** the question bank seed is filtered by level C1
- **THEN** at least 100 items are returned

#### Scenario: C2 question count
- **WHEN** the question bank seed is filtered by level C2
- **THEN** at least 100 items are returned

#### Scenario: C1/C2 skill coverage
- **WHEN** C1 or C2 items are grouped by skill
- **THEN** all 4 skills (reading, grammar, vocabulary, listening) have at least 10 items each
