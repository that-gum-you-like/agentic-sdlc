## ADDED Requirements

### Requirement: Setup.mjs role detection and template selection
`setup.mjs` SHALL detect execution agent roles by keyword matching against all template frontmatter `role_keywords` fields. When a match is found, it SHALL auto-select the template, suggest default file patterns, and assign the matching capability profile.

#### Scenario: Recognized role auto-configures
- **WHEN** a user enters role "Backend Developer" during setup
- **THEN** `setup.mjs` matches keyword `backend` to `backend-developer` template
- **AND** suggests default patterns `services/, stores/, hooks/, migrations/`
- **AND** assigns `backend-developer` capability profile from the template frontmatter
- **AND** appends the `backend-developer.md` addendum to the agent's AGENT.md

#### Scenario: Unrecognized role falls back to generic
- **WHEN** a user enters a role that matches no template keywords
- **THEN** `setup.mjs` uses the base `AGENT.md.template` without addendum
- **AND** assigns the `backend` capability profile as default
- **AND** warns: "No specialized template found for role 'X'. Using generic template."

#### Scenario: CTO role uses replacement instead of addendum
- **WHEN** a user enters role matching `cto` or `orchestrat`
- **THEN** `setup.mjs` uses the CTO template as a full replacement for `AGENT.md.template`
- **AND** does NOT append the CTO template as an addendum

#### Scenario: User can override template selection
- **WHEN** `setup.mjs` selects a template based on role keywords
- **THEN** it displays the selection and asks for confirmation before applying

### Requirement: Frontmatter parsing in setup.mjs
`setup.mjs` SHALL parse YAML frontmatter from execution agent templates to extract `role_keywords`, `default_patterns`, `archetype`, and `capabilities`.

#### Scenario: Frontmatter stripped from AGENT.md output
- **WHEN** `setup.mjs` appends a template addendum to an agent's AGENT.md
- **THEN** the YAML frontmatter (between `---` markers) is stripped from the output
- **AND** only the markdown content below the frontmatter is appended

### Requirement: Capability profiles for all 15 roles
`capabilities.json.template` SHALL include capability profiles for all 15 execution agent archetypes plus the existing planning and UIX profiles.

#### Scenario: All roles have capability profiles
- **WHEN** `setup.mjs` creates `capabilities.json` for a project
- **THEN** every agent is assigned a capability profile matching its detected archetype
- **AND** the profile defines `required`, `conditional`, and `notExpected` capabilities

### Requirement: Domain pattern defaults for all 15 roles
Each execution agent template SHALL define `default_patterns` in its frontmatter. `setup.mjs` SHALL offer these as the default answer when prompting for file patterns.

#### Scenario: Default patterns pre-filled
- **WHEN** `setup.mjs` prompts for file patterns for a backend developer
- **THEN** the prompt shows default: `services/, stores/, hooks/, migrations/, api/`
- **AND** the user can accept, modify, or clear the defaults

### Requirement: Agent routing docs updated
`framework/agent-routing.md` SHALL include all 15 execution agent roles in the routing flowchart and decision table, alongside existing planning agent routing.

#### Scenario: Complete routing guide
- **WHEN** a user reads `framework/agent-routing.md`
- **THEN** they can determine which agent handles any given task type
- **AND** all 15 execution roles plus 5 planning roles plus model-manager are documented

### Requirement: Execution agents documentation
The framework SHALL provide `docs/execution-agents.md` explaining how to choose, customize, and extend execution agent templates.

#### Scenario: Documentation covers template customization
- **WHEN** a user reads `docs/execution-agents.md`
- **THEN** they understand: how to pick agents for their project, how to customize templates post-setup, how to create new templates from the addendum pattern, and the difference between addendum templates and replacement templates (CTO)
