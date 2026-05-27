# Tasks: cursor-3.2-alignment

**Date**: 2026-05-27
**Status**: tasks

---

## Prerequisites

- [x] proposal.md approved
- [x] design.md written
- [x] spec written

---

## Implementation Tasks

- [ ] **T-101**: Verify Cursor 3.2 `/multitask` is GA (vs. beta/staged rollout) at implementation time; note version in doc
  - Complexity: XS
  - Spec: REQ-001
  - **Status**: Partially done — the doc cites "Cursor 3.2 (April 2026, per InfoQ)" and includes an explicit "verify against Cursor's current docs before relying on this for production decisions" header at the top. Live GA-status verification deferred — needed only when a user is about to depend on the doc operationally.

- [x] **T-102**: Write `docs/april-vs-cursor-multitask.md` (TL;DR table + sections per design)
  - Complexity: M
  - Spec: REQ-001

- [x] **T-103**: Extend `docs/cursor-background-agents.md` with the self-hosted vs. local decision table
  - Complexity: S
  - Spec: REQ-002

- [x] **T-104**: Add 2-line pointer entries to `.cursor/rules/sdlc-housekeeping.mdc`
  - Complexity: XS
  - Spec: REQ-003

- [x] **T-105**: Cross-link from `agents/templates/planning/april/AGENT.md` to the new comparison doc
  - Complexity: XS
  - Spec: REQ-001

---

## Verification

- Both docs render correctly
- A Cursor session asks "should I use multitask?" and the agent surfaces the comparison doc
