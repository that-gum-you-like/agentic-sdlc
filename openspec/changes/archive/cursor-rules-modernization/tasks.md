# Tasks: cursor-rules-modernization

**Date**: 2026-05-27
**Status**: tasks

---

## Prerequisites

- [x] proposal.md approved
- [x] design.md written
- [x] spec written

---

## Implementation Tasks

- [x] **T-101**: Diff `.cursorrules` against union of `.cursor/rules/*.mdc`; migrate any unique content into a `.mdc` file
  - Complexity: S
  - Spec: REQ-001

- [x] **T-102**: Delete `.cursorrules`
  - Complexity: XS
  - Spec: REQ-001

- [x] **T-103**: Split `sdlc-task-execution.mdc` into `sdlc-task-claim.mdc` and `sdlc-task-implement.mdc`
  - Complexity: M
  - Spec: REQ-002

- [x] **T-104**: Extract Memory protocol + Anti-patterns from `agentic-sdlc.mdc` into two new glob-scoped files
  - Complexity: M
  - Spec: REQ-003

- [x] **T-105**: Verify all `.mdc` files comply with caps (50/150 lines)
  - Complexity: XS
  - Spec: REQ-002, REQ-003

- [x] **T-106**: `.windsurfrules` decision — usage check, then keep-with-header or delete
  - Complexity: S
  - Spec: REQ-004

- [ ] **T-107**: Open Cursor test session, verify rules load + agent behavior unchanged
  - Complexity: S
  - Spec: VERIFY
  - **Status**: Deferred to Bryce — requires opening an actual Cursor session. Cap verification done (all 7 rules pass), full test suite passes (60/60), but live Cursor rule loading not yet manually confirmed.

---

## Verification

- All `.cursor/rules/*.mdc` files pass `wc -l` cap check
- A standard micro-cycle task runs to completion with no rule-related warnings
