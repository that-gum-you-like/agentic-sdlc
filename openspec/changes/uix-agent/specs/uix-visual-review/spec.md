## ADDED Requirements

### Requirement: Screenshot-based visual hierarchy evaluation
The UIX agent SHALL use browser screenshots to evaluate visual hierarchy: primary actions are visually prominent, secondary actions are subordinate, information density is appropriate, and whitespace creates clear grouping.

#### Scenario: Visual hierarchy review on a screen
- **WHEN** the UIX agent takes a screenshot of a screen or component
- **THEN** the agent SHALL evaluate and report on: (1) whether the primary CTA is the most visually prominent element, (2) whether information grouping is clear via whitespace and proximity, (3) whether the visual weight distribution guides the user's eye correctly

### Requirement: Responsive behavior validation
The UIX agent SHALL evaluate screenshots at multiple viewport widths (mobile 375px, tablet 768px, desktop 1280px) to verify responsive behavior.

#### Scenario: Layout breaks at mobile viewport
- **WHEN** the UIX agent takes a screenshot at 375px width and content overflows, overlaps, or becomes unreadable
- **THEN** the agent SHALL flag the specific breakpoint and describe the layout issue

#### Scenario: All viewports render correctly
- **WHEN** screenshots at 375px, 768px, and 1280px all show content properly laid out with no overflow, overlap, or truncation
- **THEN** the agent SHALL report responsive behavior as passing

### Requirement: Interaction state coverage
The UIX agent SHALL verify that interactive elements have visible state changes for hover, focus, active, and disabled states.

#### Scenario: Button missing focus state
- **WHEN** a button element has no visible `:focus` or `:focus-visible` style distinct from its default state
- **THEN** the agent SHALL flag the missing focus indicator

#### Scenario: All interactive states present
- **WHEN** all buttons, links, and inputs in a component have distinct hover, focus, active, and disabled styles
- **THEN** the agent SHALL report interaction states as complete

### Requirement: Visual review uses existing browser infrastructure
The UIX agent SHALL use the project's existing browser automation infrastructure (Playwright, OpenClaw browser, or equivalent) for screenshots. No new browser tooling SHALL be introduced.

#### Scenario: Screenshot via existing Tier 5 tooling
- **WHEN** the UIX agent needs to take a screenshot for visual review
- **THEN** the agent SHALL use the same browser automation tool configured for the project's Tier 5 E2E tests
