## ADDED Requirements

### Requirement: WCAG 2.1 AA color contrast validation
The UIX agent SHALL verify that text-to-background color contrast ratios meet WCAG 2.1 AA minimums: 4.5:1 for normal text, 3:1 for large text (18px+ or 14px+ bold).

#### Scenario: Insufficient contrast ratio detected
- **WHEN** the UIX agent evaluates a component where foreground text color against its background color produces a contrast ratio below the WCAG 2.1 AA threshold
- **THEN** the agent SHALL flag the specific color pair and recommend a compliant alternative

#### Scenario: Contrast passes AA threshold
- **WHEN** all text-to-background pairs in a component meet or exceed the AA threshold
- **THEN** the agent SHALL report the component as passing contrast validation

### Requirement: Semantic HTML validation
The UIX agent SHALL verify that interactive elements use semantic HTML: buttons for actions, links for navigation, headings in correct hierarchy (no skipped levels), lists for list content, landmarks for page structure.

#### Scenario: Div used as button without role
- **WHEN** a `<div>` or `<span>` has an `onClick` handler but no `role="button"`, no `tabIndex`, and no keyboard event handler
- **THEN** the agent SHALL flag it and recommend using a `<button>` element or adding proper ARIA attributes and keyboard handling

#### Scenario: Heading hierarchy skip
- **WHEN** a page jumps from `<h2>` to `<h4>` without an `<h3>`
- **THEN** the agent SHALL flag the skipped heading level

### Requirement: ARIA attribute validation
The UIX agent SHALL verify that ARIA attributes are used correctly: `aria-label` on icon-only buttons, `aria-hidden` on decorative elements, `aria-live` on dynamic content regions, `role` attributes match element behavior.

#### Scenario: Icon button missing accessible name
- **WHEN** a button contains only an icon (no visible text) and has no `aria-label` or `aria-labelledby`
- **THEN** the agent SHALL flag it as inaccessible to screen readers

### Requirement: Focus management validation
The UIX agent SHALL verify that modal dialogs trap focus, focus returns to trigger on close, and all interactive elements are reachable via keyboard Tab navigation.

#### Scenario: Modal without focus trap
- **WHEN** a modal component does not include focus trap logic (either native `<dialog>` or a focus trap library)
- **THEN** the agent SHALL flag it and recommend implementing focus management

### Requirement: Touch target size validation
The UIX agent SHALL verify that interactive elements (buttons, links, inputs) have touch targets of at least 44x44 CSS pixels per WCAG 2.5.8.

#### Scenario: Small touch target detected
- **WHEN** an interactive element's computed size is below 44x44px
- **THEN** the agent SHALL flag it and recommend increasing the tap area (via padding, min-width/min-height, or a larger hit area)
