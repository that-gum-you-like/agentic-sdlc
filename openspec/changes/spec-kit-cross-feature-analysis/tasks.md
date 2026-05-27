# Tasks: spec-kit-cross-feature-analysis

**Date**: 2026-05-27
**Status**: tasks

---

## Prerequisites

- [x] proposal.md approved
- [x] design.md written
- [x] spec written

---

## Implementation Tasks

- [ ] **T-101**: Write `agents/cross-feature-analyze.mjs` — extraction + pair-wise intersect + report
  - Complexity: M
  - Spec: REQ-001, REQ-002, REQ-003

- [ ] **T-102**: Add `tests/cross-feature-analyze.test.mjs` — fixture with 3 mock changes, verify report
  - Complexity: S
  - Spec: REQ-001, REQ-002

- [ ] **T-103**: Run analyzer against current 22 active changes; verify it produces a reasonable report (no false-positive flood)
  - Complexity: S
  - Spec: VERIFY

- [ ] **T-104**: Create `.claude/skills/openspec-cross-feature/SKILL.md` skill
  - Complexity: S
  - Spec: REQ-004

- [ ] **T-105**: Write `docs/cross-feature-analysis.md` — workflow + report-reading guide
  - Complexity: S
  - Spec: REQ-005

- [ ] **T-106** (optional): Wire `openspec-new-change` to run analyzer post-proposal
  - Complexity: S
  - Spec: REQ-006 (optional)

---

## Verification

- Analyzer correctly flags the current 22-change corpus
- New skill works end-to-end
