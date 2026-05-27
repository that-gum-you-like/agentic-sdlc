# Tasks: replay-regression-ci-gate

**Date**: 2026-05-27
**Status**: tasks

---

## Prerequisites

- [x] proposal.md approved
- [x] design.md written
- [x] spec written
- [ ] `cost-tracker-otel` shipped (provides trace source) — soft dep; can capture traces manually too

---

## Implementation Tasks

- [ ] **T-101**: Define corpus JSON schema in `tests/replay-corpus/SCHEMA.md`
  - Complexity: S
  - Spec: REQ-001

- [ ] **T-102**: Capture 5 seed traces (one per major agent role) and check into `tests/replay-corpus/`
  - Complexity: M
  - Spec: REQ-002

- [ ] **T-103**: Write `tests/replay.test.mjs` harness
  - Complexity: L
  - Spec: REQ-003, REQ-004

- [ ] **T-104**: Add `npm run test:replay` script to `package.json`
  - Complexity: XS
  - Spec: REQ-005

- [ ] **T-105**: Add `replay-regression` job to `.github/workflows/test.yml`
  - Complexity: S
  - Spec: REQ-005

- [ ] **T-106**: Write `docs/replay-regression.md` — corpus curation workflow + failure-diagnosis guide
  - Complexity: S
  - Spec: REQ-006

- [ ] **T-107**: Mark `replay-regression` as required check on `main` branch protection
  - Complexity: XS
  - Spec: REQ-005

---

## Verification

- `npm run test:replay` passes locally
- CI run shows the new job
- Intentionally break a prompt → replay fails with a usable diff
- Restore prompt → replay passes
