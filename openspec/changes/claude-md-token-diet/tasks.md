# Tasks: claude-md-token-diet

**Date**: 2026-05-27
**Status**: tasks

---

## Prerequisites

- [x] proposal.md approved
- [x] design.md written
- [x] spec written

---

## Implementation Tasks

- [ ] **T-101**: Audit `CLAUDE.md` sections — classify each `##` header as keep-verbatim / keep-summary / move-to-appendix
  - Complexity: M
  - Spec: REQ-001

- [ ] **T-102**: Write `agents/claude-md-split.mjs` (one-shot, reproducible)
  - Complexity: M
  - Spec: REQ-001

- [ ] **T-103**: Run split script, produce new `CLAUDE.md` + `docs/appendix/*.md`
  - Complexity: S
  - Spec: REQ-001

- [ ] **T-104**: Verify `wc -l CLAUDE.md` ≤ 500
  - Complexity: XS
  - Spec: REQ-001

- [ ] **T-105**: Audit `AGENTS.md` — flag padding for deletion
  - Complexity: S
  - Spec: REQ-002

- [ ] **T-106**: Slim `AGENTS.md` to ≤150 lines
  - Complexity: S
  - Spec: REQ-002

- [ ] **T-107**: Run battery of 3 standard micro-cycle tasks; confirm agent behavior unchanged
  - Complexity: M
  - Spec: VERIFY

---

## Verification

- `wc -l CLAUDE.md` ≤ 500
- `wc -l AGENTS.md` ≤ 150
- Every moved section reachable via the pointer list in `CLAUDE.md`
- 3 standard tasks complete with no missing-context failures
