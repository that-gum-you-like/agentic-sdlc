# Spec: Frontmatter Validation

**Change**: self-bootstrap-learnings
**Status**: draft
**Created**: 2026-04-07

## ADDED Requirements

### Requirement: Supported frontmatter subset documented and validated

`docs/execution-agents.md` SHALL document the supported YAML frontmatter features for agent templates. A validation test SHALL verify that all 15 templates only use supported features. `setup.mjs` SHALL output a clear error message on parse failure.

#### Scenario: Template with unsupported YAML fails validation

WHEN the frontmatter validation test encounters a template
AND the template uses a YAML feature not in the supported subset
THEN the test SHALL fail
AND the failure message SHALL name the unsupported feature and the file that uses it.

#### Scenario: All 15 current templates pass validation

WHEN the frontmatter validation test runs against all 15 current templates
THEN every template SHALL pass validation
AND no unsupported YAML features SHALL be detected.

#### Scenario: Parse error names the file and supported features

WHEN `setup.mjs` fails to parse a template's YAML frontmatter
THEN the error message SHALL name the specific file that failed
AND the error message SHALL list the supported frontmatter features
AND the error message SHALL be actionable enough for the user to fix the issue without consulting additional documentation.
