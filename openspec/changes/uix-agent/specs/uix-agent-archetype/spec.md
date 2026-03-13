## ADDED Requirements

### Requirement: UIX agent archetype in capabilities template
The `capabilities.json.template` SHALL include a `uix` archetype entry with `designSystemAudit`, `accessibilityAudit`, and `visualReview` as required capabilities, and `storybookGovernance` as conditional ("when Storybook is installed in the project").

#### Scenario: Capabilities template includes uix archetype
- **WHEN** a developer reads `agents/templates/capabilities.json.template`
- **THEN** there SHALL be a `uix` key with `required: ["memoryRecall", "memoryRecord", "designSystemAudit", "accessibilityAudit", "visualReview", "costTracking"]` and `conditional: { "storybookGovernance": "when Storybook is installed in the project" }`

#### Scenario: UIX notExpected capabilities
- **WHEN** the `uix` archetype entry is read
- **THEN** `notExpected` SHALL include `["defeatTests", "deployPipeline", "openclawBrowser", "openclawNotify"]`

### Requirement: UIX domain patterns in domains template
The `domains.json.template` SHALL include a `uix` entry with file patterns and keywords for UI/UX routing.

#### Scenario: Domain patterns cover style and design files
- **WHEN** a task references files matching `**/*.stories.*`, `**/tokens/**`, `**/theme/**`, `**/design-system/**`, `**/*.css`, `**/*.scss`, or `**/*.styled.*`
- **THEN** the queue-drainer SHALL route the task to the `uix` agent

#### Scenario: Domain keywords match UI/UX concerns
- **WHEN** a task title or description contains keywords `accessibility`, `a11y`, `wcag`, `design system`, `visual`, `storybook`, `responsive`, `animation`, `typography`, `color`, `spacing`, or `contrast`
- **THEN** the queue-drainer SHALL score the `uix` agent for routing

### Requirement: setup.mjs recognizes the uix role
The `setup.mjs` bootstrap script SHALL recognize `uix` as a valid agent role and configure it as support-tier (haiku model, 50000 dailyTokens) in `budget.json`.

#### Scenario: Bootstrap with uix agent
- **WHEN** a user runs `setup.mjs` and assigns an agent the `uix` role (or a role containing "ui/ux", "design", or "uix")
- **THEN** the generated `budget.json` SHALL set that agent to `"model": "haiku"` and `"dailyTokens": 50000`

#### Scenario: Capabilities file uses uix archetype
- **WHEN** a user assigns the `uix` role during setup
- **THEN** the generated `capabilities.json` SHALL use the `uix` archetype template for that agent

### Requirement: UIX AGENT.md includes design-specific operating rules
The UIX agent's generated `AGENT.md` SHALL include additional operating rules specific to UI/UX review: design token checking, accessibility validation, visual hierarchy evaluation, and (conditionally) Storybook story verification.

#### Scenario: UIX agent micro cycle additions
- **WHEN** the UIX agent's `AGENT.md` is generated
- **THEN** the operating rules section SHALL include steps for: (1) check design token consistency, (2) validate accessibility (WCAG 2.1 AA), (3) evaluate visual hierarchy and responsive behavior via screenshots, (4) verify Storybook story coverage if Storybook is available

#### Scenario: UIX agent identity and role
- **WHEN** the UIX agent's `AGENT.md` is generated
- **THEN** the identity section SHALL describe the agent as a UI/UX Designer specializing in design system enforcement, accessibility compliance, visual polish, and component story governance
