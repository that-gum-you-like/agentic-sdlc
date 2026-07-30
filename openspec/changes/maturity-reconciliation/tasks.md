# Tasks — maturity-reconciliation

## Implementation

- [x] **T1**: `agents/maturity-assess.mjs` — `pass()`/`fail()` evidence
  records; renderer reads `e.ok` with a string fallback to the legacy heuristic
  - Complexity: S · Spec: REQ-002
- [x] **T2**: `agents/maturity-assess.mjs` — deploy detection recognises
  `agents/deploy-runner.mjs` and a `project.json` `deploy` block; Dockerfile
  check left alone
  - Complexity: S · Spec: REQ-003, REQ-005
- [x] **T3**: `docs/curriculum-conformance.md` — nine rows Missing/Partial →
  Solid with real owners; replace the obsolete "Remaining gap list" section;
  header and tables agree
  - Complexity: S · Spec: REQ-001

## Verification

- [x] **T4**: `tests/maturity-assess.test.mjs` — evidence polarity (positive
  "No …" renders ✅, real failure renders ❌, legacy string still works) and
  deploy detection (runner-only tree detected, empty tree not)
  - Complexity: S · Spec: REQ-002, REQ-003
- [x] **T5**: `tests/curriculum-conformance.test.mjs` — the drift guard, plus
  parser coverage for decorated statuses and archive-only rows
  - Complexity: M · Spec: REQ-004
- [x] **T6**: Re-run `maturity-assess.mjs`; confirm Deployment & Release rose
  off 2.0/5, the zero-dep evidence lines render ✅, and no weight or threshold
  changed in the diff
  - Complexity: S · Spec: REQ-005
- [x] **T7**: `npm test` green (unit + four-layer-validate + behavior)
  - Complexity: S · Spec: all
