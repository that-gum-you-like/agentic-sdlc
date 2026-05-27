# Tasks: anthropic-native-compaction

**Date**: 2026-05-27
**Status**: tasks

---

## Prerequisites

- [x] proposal.md approved
- [x] design.md written
- [x] spec written
- [x] `agents/adapters/anthropic.mjs` exists
- [x] `agents/memory-manager.mjs` exists

---

## Implementation Tasks

- [ ] **T-101**: Extend `agents/adapters/anthropic.mjs` to accept `compaction` param + emit feature flag
  - Complexity: S
  - Spec: REQ-001

- [ ] **T-102**: Verify the current Anthropic compaction header/param syntax against live API docs (it may have changed since `compact-2026-01-12`)
  - Complexity: XS
  - Spec: REQ-001

- [ ] **T-103**: Add `shouldCompactInFlight()` + `buildCallParams()` helpers to `agents/memory-manager.mjs`
  - Complexity: S
  - Spec: REQ-002

- [ ] **T-104**: Wire `queue-drainer.mjs` (and any other long-horizon caller) to route via `buildCallParams()`
  - Complexity: S
  - Spec: REQ-002

- [ ] **T-105**: Add OTel span attributes for compaction events (depends on `cost-tracker-otel`)
  - Complexity: S
  - Spec: REQ-003

- [ ] **T-106**: Add tests in `tests/anthropic-compaction.test.mjs` — feature flag, no-op on other adapters, header presence
  - Complexity: S
  - Spec: REQ-001, REQ-002

- [ ] **T-107**: Run A/B long-horizon test (20-task drain) with compaction on vs off; record token & compliance delta
  - Complexity: M
  - Spec: VERIFY

- [ ] **T-108**: Document layered memory model in `docs/memory-protocol.md`
  - Complexity: S
  - Spec: REQ-004

---

## Verification

- Tests pass
- A/B test shows lower end-of-session tokens with compaction on
- Non-Anthropic adapter paths unchanged (regression suite passes)
