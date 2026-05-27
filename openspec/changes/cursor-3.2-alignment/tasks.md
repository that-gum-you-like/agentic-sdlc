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

- [ ] **T-102**: Write `docs/april-vs-cursor-multitask.md` (TL;DR table + sections per design)
  - Complexity: M
  - Spec: REQ-001

- [ ] **T-103**: Extend `docs/cursor-background-agents.md` with the self-hosted vs. local decision table
  - Complexity: S
  - Spec: REQ-002

- [ ] **T-104**: Add 2-line pointer entries to `.cursor/rules/sdlc-housekeeping.mdc`
  - Complexity: XS
  - Spec: REQ-003

- [ ] **T-105**: Cross-link from `agents/templates/planning/april/AGENT.md` to the new comparison doc
  - Complexity: XS
  - Spec: REQ-001

---

## Verification

- Both docs render correctly
- A Cursor session asks "should I use multitask?" and the agent surfaces the comparison doc
