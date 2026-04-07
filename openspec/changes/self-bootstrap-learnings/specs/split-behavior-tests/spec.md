# Split Behavior Tests Spec

**Change**: self-bootstrap-learnings
**Domain**: testing
**Status**: draft

## ADDED Requirements

### Requirement: Framework vs project test modes

`test-behavior.mjs` SHALL support `--framework` (template quality, script existence, adapter checks) and `--project` (agent-specific content, domain patterns) flags. When no flag is provided, both modes run. The framework repo runs `--framework` only in its CI pipeline.

#### Scenario: --framework passes on framework repo

WHEN `test-behavior.mjs --framework` runs in the agentic-sdlc framework repo
THEN all framework-level checks (template quality, script existence, adapter checks) pass with zero failures and zero project-level tests are executed.

#### Scenario: --project on framework repo shows expected failures

WHEN `test-behavior.mjs --project` runs in the agentic-sdlc framework repo
THEN it reports expected failures for project-level checks (no domain agents configured, no project-specific content) and exits with a non-zero code indicating those checks are not applicable.

#### Scenario: Default runs both for backward compatibility

WHEN `test-behavior.mjs` runs with no flags
THEN it executes both framework-level and project-level test suites and reports results for each suite separately.

#### Scenario: CI pipeline uses --framework for this repo

WHEN the agentic-sdlc CI pipeline runs behavior tests
THEN it invokes `test-behavior.mjs --framework` so that only framework-relevant checks are evaluated, avoiding false failures from missing project-level configuration.
