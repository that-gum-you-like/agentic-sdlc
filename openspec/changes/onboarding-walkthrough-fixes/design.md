## Context

Walkthrough audit found 12 friction points — all documentation gaps. Code handles edge cases correctly but docs don't guide agents through them.

## Goals / Non-Goals

**Goals:** Fill every documentation gap found during walkthrough. Pure text changes.
**Non-Goals:** Script refactoring, new features beyond `--human` flag on discover.

## Decisions

### D1: All fixes are additive text — no content removed
Every fix adds guidance, nothing is deleted or restructured. Level guides get appended sections, ONBOARDING.md gets new subsections, README gets requirement notes.

### D2: setup.mjs --human flag outputs a summary line before JSON
When `--human` is passed alongside `--discover`, print a 1-line human summary above the JSON: `"TypeScript/React Native project at Level 5 (has memory). Suggested: backend, reviewer, frontend."` JSON output unchanged.

## Risks / Trade-offs

None — pure documentation additions.
