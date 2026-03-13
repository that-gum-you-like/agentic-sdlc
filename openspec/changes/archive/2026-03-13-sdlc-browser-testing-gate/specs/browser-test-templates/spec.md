## ADDED Requirements

### Requirement: Browser Test Scenario Template
The framework SHALL provide a template (`agents/templates/browser-tests.md.template`) documenting common browser test patterns that projects should implement.

#### Scenario: New project uses template to bootstrap browser tests
- **WHEN** a developer bootstraps a new project with the SDLC framework
- **THEN** the browser test template provides patterns for refresh resilience, user journeys, navigation completeness, state persistence, demo mode verification, and error resilience

### Requirement: Template Covers Critical Scenarios
The template SHALL include at minimum 6 test pattern categories: refresh resilience, user journey flows, navigation completeness, state persistence, demo/seed mode verification, and error state handling.

#### Scenario: Template includes refresh resilience pattern
- **WHEN** a developer reads the browser test template
- **THEN** it describes how to test that each route group survives a hard browser refresh

#### Scenario: Template includes state persistence pattern
- **WHEN** a developer reads the browser test template
- **THEN** it describes how to test that user interactions survive navigation and page reload
