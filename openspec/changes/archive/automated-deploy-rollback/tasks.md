# Tasks: automated-deploy-rollback

**Date**: 2026-05-21
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: tasks

---

## Overview

Implement the 5 REQs in spec/automated-rollback-helper-behavior.md. All work is in this Claude session. Total estimated effort: ~60 minutes.

---

## Prerequisites

- [x] proposal.md approved
- [x] design.md written
- [x] spec written
- [x] `agents/notify.mjs` exists with `triggerNotification()` helper

---

## Implementation Tasks

- [ ] **T-101**: Create `agents/deploy-rollback.mjs` helper
  - File: `agents/deploy-rollback.mjs`
  - Spec: REQ-001, REQ-002
  - Complexity: S
  - Implements: CLI parsing, project.json read, rollbackCmd execution, debounce check, notify.mjs trigger invocation, exit codes

- [ ] **T-102**: Add `deployFailed` and `deployRolledBack` to notify.mjs recognized triggers
  - File: `agents/notify.mjs`
  - Spec: REQ-003
  - Complexity: S
  - Edit: extend the "Recognized trigger types" comment + ensure the trigger map handles new names (no-op if not configured)

- [ ] **T-103**: Extend `deploy-pipeline.md.template` with stages 8-9 + ON FAILURE subsections
  - File: `agents/templates/deploy-pipeline.md.template`
  - Spec: REQ-004
  - Complexity: S
  - Edit: ~70 lines added covering ON FAILURE handlers (stage 5, 6) and new stage 8 (Rollback) + 9 (Notify rollback)

- [ ] **T-104**: Create `docs/rollback-pattern.md`
  - File: `docs/rollback-pattern.md`
  - Spec: REQ-005
  - Complexity: S
  - Covers: what rollbackCmd does, examples per platform (Vercel, Netlify, Railway, custom), how to test, notification trigger setup

- [ ] **T-105**: Write tests for deploy-rollback.mjs
  - File: `tests/deploy-rollback.test.mjs`
  - Covers: REQ-001, REQ-002 (all 5 scenarios)
  - Complexity: S
  - Mock execution of rollbackCmd; mock notify.mjs trigger calls; verify exit codes

- [ ] **T-106**: Smoke test — run the helper against a fake project
  - Command: `cd /tmp/rollback-test && node ~/agentic-sdlc/agents/deploy-rollback.mjs --dry-run`
  - Verify: dry-run output looks sensible
  - Complexity: S

- [ ] **T-107**: Update BACKLOG.md — move #12 to Promoted to Changes
  - File: `openspec/BACKLOG.md`
  - Edit: add row to Promoted table, remove the "### 12." block from Remaining Ideas

- [ ] **T-108**: Archive the change
  - Move: `mv openspec/changes/automated-deploy-rollback openspec/changes/archive/automated-deploy-rollback`
  - Update `status.json` to `complete`

---

## Completion Criteria

- [ ] T-101..T-108 checked off
- [ ] Tests in T-105 pass
- [ ] Smoke test (T-106) passes
- [ ] BACKLOG #12 promoted
- [ ] Commit + push to origin/main

---

## Notes

**Future:** Per-environment rollback (`rollbackCmd:staging`, `rollbackCmd:prod`) deferred — current scope is single rollbackCmd per project. Project authors can branch in their script if needed.

**Cross-machine debounce:** Single-machine assumption. If a project deploys from multiple machines (rare), `pm/.last-rollback` would need to be in a shared location — out of scope.
