# Spec: OpenSpec Discovery Phase

**Change**: self-bootstrap-learnings
**Status**: draft
**Created**: 2026-04-07

## ADDED Requirements

### Requirement: Discovery section in OpenSpec proposals

The OpenSpec proposal template SHALL include a `## Discovery` section documenting what files, patterns, and tests were read before writing the proposal. This ensures proposals are grounded in the current state of the codebase rather than assumptions.

#### Scenario: New proposal includes discovery findings

WHEN an agent creates a new OpenSpec proposal
THEN the proposal SHALL include a `## Discovery` section
AND the section SHALL list the files and patterns examined during research
AND the section SHALL summarize key findings that informed the proposal.

#### Scenario: Discovery references specific file paths and line numbers

WHEN a `## Discovery` section is written
THEN it SHALL reference specific file paths (absolute or repo-relative)
AND it SHALL reference specific line numbers or code patterns where relevant
AND it SHALL NOT contain vague or unverifiable claims about the codebase state.
