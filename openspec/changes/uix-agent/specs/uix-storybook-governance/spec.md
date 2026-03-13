## ADDED Requirements

### Requirement: Storybook story coverage enforcement
The UIX agent SHALL verify that every shared component (components used in 2+ screens) has a corresponding Storybook story file (`*.stories.*`).

#### Scenario: Shared component missing story
- **WHEN** a component file is imported by 2 or more screen files and no `*.stories.*` file exists alongside it
- **THEN** the agent SHALL flag the missing story and recommend creating one covering default, loading, error, and empty states

#### Scenario: All shared components have stories
- **WHEN** every shared component has a corresponding story file
- **THEN** the agent SHALL report story coverage as complete

### Requirement: Story state coverage
The UIX agent SHALL verify that Storybook stories cover key component states: default, loading, error, empty, and (where applicable) interactive states.

#### Scenario: Story only covers default state
- **WHEN** a story file exports only a single `Default` story with no args/variants
- **THEN** the agent SHALL flag it and recommend adding stories for other states (loading, error, empty, disabled)

#### Scenario: Story covers multiple states
- **WHEN** a story file exports stories for default plus at least 2 other states
- **THEN** the agent SHALL report state coverage as adequate

### Requirement: Story-code sync validation
The UIX agent SHALL detect when a component's props interface has changed but its stories haven't been updated to reflect new or removed props.

#### Scenario: New prop not covered in stories
- **WHEN** a component gains a new prop (visible in its type/interface definition) that no existing story exercises
- **THEN** the agent SHALL flag the drift and recommend adding a story variant that exercises the new prop

#### Scenario: Story references removed prop
- **WHEN** a story passes a prop that no longer exists in the component's interface
- **THEN** the agent SHALL flag the stale story

### Requirement: Conditional activation based on Storybook presence
The storybookGovernance capability SHALL only activate when Storybook is installed in the project (detectable via `@storybook/*` in `package.json` dependencies or a `.storybook/` config directory).

#### Scenario: Storybook not installed
- **WHEN** the project has no `@storybook/*` dependency and no `.storybook/` directory
- **THEN** the agent SHALL skip all Storybook governance checks and report `skipReason: "Storybook not installed"` in the capability checklist

#### Scenario: Storybook is installed
- **WHEN** the project has `@storybook/*` in `package.json` or a `.storybook/` directory exists
- **THEN** the agent SHALL execute all Storybook governance checks
