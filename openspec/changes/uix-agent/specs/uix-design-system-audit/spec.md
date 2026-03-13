## ADDED Requirements

### Requirement: Design token consistency checking
The UIX agent SHALL audit component code for consistent use of project-defined design tokens (spacing, color, typography, border radius, shadow) rather than hard-coded values.

#### Scenario: Hard-coded color detected
- **WHEN** the UIX agent reviews a component file containing a hard-coded color value (e.g., `#3B82F6`, `rgb(59, 130, 246)`) that has an equivalent design token
- **THEN** the agent SHALL flag it and recommend the corresponding token name

#### Scenario: Consistent token usage confirmed
- **WHEN** the UIX agent reviews a component file where all color, spacing, and typography values reference design tokens
- **THEN** the agent SHALL report the file as passing the design system audit

#### Scenario: No design tokens defined in project
- **WHEN** the UIX agent cannot locate a design token file (tokens, theme, or design-system directory)
- **THEN** the agent SHALL skip the design token audit and note the skip reason in the capability checklist

### Requirement: Typography scale enforcement
The UIX agent SHALL verify that font sizes, weights, and line heights follow the project's defined typography scale.

#### Scenario: Off-scale font size detected
- **WHEN** a component uses a font size not in the project's typography scale
- **THEN** the agent SHALL flag it and suggest the nearest scale value

### Requirement: Spacing consistency enforcement
The UIX agent SHALL verify that margin, padding, and gap values follow the project's spacing scale (e.g., 4px increments, rem-based scale).

#### Scenario: Arbitrary spacing value detected
- **WHEN** a component uses a spacing value (margin, padding, gap) that doesn't align with the spacing scale
- **THEN** the agent SHALL flag it and suggest the nearest scale-aligned value

### Requirement: Component visual pattern consistency
The UIX agent SHALL check that similar components (buttons, cards, inputs, modals) use consistent visual patterns — same border radius, shadow depth, padding, and state styles.

#### Scenario: Inconsistent button styles across components
- **WHEN** two button components in the same project use different border radius or padding values
- **THEN** the agent SHALL flag the inconsistency and recommend unifying to the design system's button token
