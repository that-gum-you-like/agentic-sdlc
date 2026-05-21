# Spec: automated-rollback-helper-behavior

**Date**: 2026-05-21
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: specs
**Capability**: NEW

---

## Overview

This capability defines the behavior of `agents/deploy-rollback.mjs` plus the two new notify.mjs triggers (`deployFailed`, `deployRolledBack`) and the deploy-pipeline.md.template additions.

---

## Requirements

### REQ-001: deploy-rollback.mjs Exists and Runs

**Statement:** The system shall provide `agents/deploy-rollback.mjs` as an executable Node script that reads `agents/project.json`, invokes the configured `rollbackCmd`, and triggers appropriate notifications.

**Acceptance Criteria:**
- [ ] File exists at `agents/deploy-rollback.mjs` with shebang `#!/usr/bin/env node`
- [ ] Zero npm dependencies (Node stdlib only)
- [ ] CLI accepts: no args (auto), `--dry-run`, `--confirm`, `--reason "<msg>"`
- [ ] Exit codes: 0 (success), 1 (no rollbackCmd), 2 (rollback failed), 3 (helper error)
- [ ] On exit code 1, triggers `deployFailed { reason: "no-rollback-configured" }`
- [ ] On exit code 2, triggers `deployFailed { reason: "rollback-command-failed", output: <captured> }`
- [ ] On exit code 0, triggers `deployRolledBack { reason: <flag value>, output: <captured-truncated-4KB> }`
- [ ] Total size <120 lines

**Dependencies:** none

**Complexity:** S

**Value:** Critical

**Notes:** Reuse `triggerNotification()` from notify.mjs — don't reimplement the trigger machinery.

---

### REQ-002: Debounce Prevents Notification Spam

**Statement:** The system shall enforce a minimum interval between successive `deployRolledBack` notifications for the same project (default 300 seconds, configurable via `project.json` `rollbackDebounce`).

**Acceptance Criteria:**
- [ ] Tracks last-fire timestamp in `pm/.last-rollback` (one timestamp per project — single-machine assumption)
- [ ] If current fire is within `rollbackDebounce` seconds of last fire: log a `warn` line, skip the notification, still execute the rollback command
- [ ] Override via `--no-debounce` flag for forced manual fires
- [ ] If `pm/.last-rollback` is missing or malformed: treat as no prior fire

**Dependencies:** REQ-001

**Complexity:** S

**Value:** Medium

**Notes:** Debouncing applies to notifications only, not to the rollback execution itself — a failing deploy should still get rolled back even if notifications are suppressed.

---

### REQ-003: notify.mjs Recognizes New Triggers

**Statement:** The system shall extend `agents/notify.mjs` to recognize two new trigger names: `deployFailed` and `deployRolledBack`.

**Acceptance Criteria:**
- [ ] `notify.mjs` line ~605-607 (Recognized trigger types comment) is updated to include both names
- [ ] `triggerNotification(triggerName, ...)` returns true/triggers the configured channel when called with either new name and the trigger is enabled in `project.json` `notification.triggers`
- [ ] No new external dependencies
- [ ] Existing 7 triggers continue to work unchanged

**Dependencies:** REQ-001

**Complexity:** S

**Value:** Critical

**Notes:** This is the contract for downstream consumers. notify.mjs is the only file requiring modification.

---

### REQ-004: deploy-pipeline.md.template Documents the Pattern

**Statement:** The system shall extend `agents/templates/deploy-pipeline.md.template` to document the failure-and-rollback flow as part of the recommended pipeline.

**Acceptance Criteria:**
- [ ] Stage 5 (POST-DEPLOY) section gains an "ON FAILURE" subsection pointing at stage 8
- [ ] Stage 6 (BROWSER VERIFY) section gains an "ON FAILURE" subsection pointing at stage 8
- [ ] New stage 8 (Rollback) section documents the `deploy-rollback.mjs` invocation
- [ ] New stage 9 (Notify Rollback) section describes the notification payload
- [ ] Final pipeline summary (the ASCII diagram near the top) updates to include "8. ROLLBACK ← AUTO" and "9. NOTIFY ROLLBACK"
- [ ] Template grows by <80 lines total

**Dependencies:** REQ-001, REQ-003

**Complexity:** S

**Value:** Critical

**Notes:** Template propagates to user projects via setup.mjs (copies under `agents/templates/`).

---

### REQ-005: docs/rollback-pattern.md User Documentation

**Statement:** The system shall provide a user-facing `docs/rollback-pattern.md` explaining how to wire `rollbackCmd` into a project.

**Acceptance Criteria:**
- [ ] File exists at `docs/rollback-pattern.md`
- [ ] Covers: what `rollbackCmd` should do, how to test it with `--dry-run`, examples for Vercel / Netlify / Railway / custom git-revert
- [ ] Lists the two notification triggers and shows sample `project.json` snippets enabling them
- [ ] Warns the user that the framework cannot verify `rollbackCmd` is correct — manual test required
- [ ] <250 lines

**Dependencies:** REQ-001, REQ-004

**Complexity:** S

**Value:** High

**Notes:** Without this doc, adoption is impossible.

---

## Acceptance Criteria (Scenarios)

### Scenario 1: Happy Path Rollback

**Verifies:** REQ-001, REQ-002, REQ-003

**WHEN** A project has `rollbackCmd: "echo rolled-back"` in `agents/project.json`, and `node agents/deploy-rollback.mjs --reason "smoke-test-failure"` is invoked

**THEN** The script executes `echo rolled-back`, captures its output

**AND** Triggers `deployRolledBack` notification with `{ reason: "smoke-test-failure", output: "rolled-back\n" }`

**AND** Exits 0

**AND** Writes a `pm/.last-rollback` timestamp

---

### Scenario 2: No rollbackCmd Configured

**Verifies:** REQ-001

**WHEN** A project has no `rollbackCmd` field, and `node agents/deploy-rollback.mjs --reason "smoke-test-failure"` is invoked

**THEN** The script triggers `deployFailed { reason: "no-rollback-configured" }` notification

**AND** Exits 1

**AND** Does not write `pm/.last-rollback`

---

### Scenario 3: Rollback Command Itself Fails

**Verifies:** REQ-001

**WHEN** `rollbackCmd: "false"` (or any command that exits non-zero) and the helper is invoked

**THEN** Triggers `deployFailed { reason: "rollback-command-failed", output: <stderr> }`

**AND** Exits 2

**AND** Logs the captured stderr to `pm/logs/rollback-<timestamp>.log` if output > 4KB

---

### Scenario 4: Edge Case — Debounce Suppresses Repeat Notifications

**Verifies:** REQ-002

**WHEN** The helper is invoked twice within 300 seconds (default `rollbackDebounce`)

**THEN** First invocation triggers `deployRolledBack` notification normally

**AND** Second invocation executes the rollback command AGAIN, but the notification is suppressed (warn-logged "debounced")

**AND** `pm/.last-rollback` is updated by the first fire and read by the second

---

### Scenario 5: Edge Case — --dry-run Does Not Execute

**Verifies:** REQ-001

**WHEN** `node agents/deploy-rollback.mjs --dry-run --reason "test"` is invoked with a valid `rollbackCmd: "rm -rf important-dir"`

**THEN** The script prints what it would run, in order

**AND** Does NOT execute `rollbackCmd` (`important-dir` still exists)

**AND** Does NOT trigger any notification

**AND** Exits 0

---

## Invariants

- The helper NEVER executes `rollbackCmd` with `--dry-run` set
- A failed `rollbackCmd` ALWAYS triggers `deployFailed` (notification is best-effort but invocation attempt is mandatory)
- `pm/.last-rollback` is the only file the helper writes to outside `pm/logs/`
- Existing 7 notify.mjs triggers are unchanged in behavior

---

## Out of Scope

- Cross-machine debounce coordination
- Source code revert / git operations
- Multi-environment rollback variants
- Auto-detecting hosting platform from project metadata

---

## Test Mapping

| Scenario | Test File | Test Name |
|---|---|---|
| Scenario 1 | `tests/deploy-rollback.test.mjs` | "happy path triggers deployRolledBack" |
| Scenario 2 | `tests/deploy-rollback.test.mjs` | "missing rollbackCmd exits 1 and triggers deployFailed" |
| Scenario 3 | `tests/deploy-rollback.test.mjs` | "failing rollback command exits 2 and triggers deployFailed" |
| Scenario 4 | `tests/deploy-rollback.test.mjs` | "debounce suppresses notification within window" |
| Scenario 5 | `tests/deploy-rollback.test.mjs` | "dry-run does not execute or notify" |
