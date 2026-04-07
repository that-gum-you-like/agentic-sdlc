# Spec: Documentation Mode Micro Cycle

**Change**: self-bootstrap-learnings
**Status**: draft
**Created**: 2026-04-07

## ADDED Requirements

### Requirement: Documentation mode micro cycle

`CLAUDE.md` and `AGENT.md.template` SHALL document a "documentation mode" variant of the micro cycle: implement batch, validate batch, commit batch. This mode applies when tasks produce non-testable artifacts such as templates, documentation, or configuration files.

#### Scenario: Template-only tasks use batch mode

WHEN an agent picks a task that produces only non-testable artifacts (templates, docs, config)
THEN the agent SHALL use the documentation mode micro cycle: implement the full batch of related artifacts, validate them as a group, and commit as a single batch
AND this SHALL be documented as an acceptable workflow in both `CLAUDE.md` and `AGENT.md.template`.

#### Scenario: Code tasks still use standard micro cycle

WHEN an agent picks a task that produces testable code
THEN the agent SHALL use the standard micro cycle: pick task, implement, write tests, run tests, commit if passing, next
AND the documentation mode SHALL NOT apply.

#### Scenario: Iteration cycles documentation reflects both modes

WHEN a contributor reads the iteration cycles section of `CLAUDE.md`
THEN they SHALL find both the standard micro cycle and the documentation mode micro cycle described
AND each mode SHALL clearly state when it applies and what the steps are.
