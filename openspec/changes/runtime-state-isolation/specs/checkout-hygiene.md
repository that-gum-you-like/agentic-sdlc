# Specs — checkout-hygiene

**Date**: 2026-11-12
**Author**: Claude with Bryce
**Status**: specs

Covers `agents/checkout-doctor.mjs`, `agents/hermes-drain.sh`, `agents/drain-supervisor.mjs`, `agents/health-check.mjs`. Band 040-049.

Prefix `RS` (see `openspec/REQUIREMENT-PREFIXES.md`). Scenarios are Given/When/Then and transcribe directly into the named test files. Node stdlib only; no new dependency; no OpenAI.

---

## RS-REQ-040 — `checkout-doctor` reports, read-only

**Statement:** `checkout-doctor.mjs [--json] [--repo <path>]` shall report paths not owned by the current uid, untracked non-ignored paths, tracked modifications, branch, ahead/behind, and state-dir ownership, and shall modify nothing.

**Acceptance:** for each foreign path it prints the exact `sudo chown` command for a human to run and never runs it; `--json` is stable and machine-parseable; ownership lookup is injectable for tests; an unreadable path is reported, not skipped silently.

**Scenario:** GIVEN a root-owned `tasks/completed/` and an untracked `agents/secrets.mjs` WHEN it runs THEN both appear as findings with the owner and the suggested command.
**Scenario:** GIVEN a clean, owned, up-to-date tree WHEN it runs THEN it exits 0 with no findings.

**Test:** `tests/checkout-doctor.test.mjs` | **Complexity:** M | **Value:** HIGH | **Dependencies:** none

---

## RS-REQ-041 — Findings reach the operator once

**Statement:** `health-check.mjs` shall run `checkout-doctor` and, on any foreign-owned path, raise the existing non-ok notification, deduped per path set.

**Acceptance:** a new foreign path alerts within one tick; the unchanged set does not re-alert inside the dedupe window.

**Scenario:** GIVEN a new root-owned file appears WHEN the next health check runs THEN one notification names it.

**Test:** `tests/health-check.test.mjs` | **Complexity:** S | **Value:** MEDIUM | **Dependencies:** RS-REQ-040

---

## RS-REQ-042 — The drain never runs as root

**Statement:** `hermes-drain.sh` and `drain-supervisor.mjs` shall exit immediately with rc 98 and a one-line message when the effective uid is 0, and notify once.

**Acceptance:** uid is injectable for tests; the dry-run path also refuses; no file is created before the check; the message says which unit or invocation to run as the user instead.

**Scenario:** GIVEN uid 0 WHEN `hermes-drain.sh` starts THEN it exits 98 before creating a mutex, clone or log.

**Test:** `tests/hermes-drain.test.mjs`, `tests/drain-supervisor-review.test.mjs` | **Complexity:** S | **Value:** HIGH | **Dependencies:** none | **Lane:** interactive

---

## RS-REQ-043 — Framework tools never write to a foreign-owned location

**Statement:** the resolver in `state-dir.mjs` and the archive/migration tools shall check ownership before creating files in a directory and refuse, with a clear message, when the directory is owned by another uid.

**Acceptance:** the error names the path, the owner and the human-run fix; nothing is partially written.

**Scenario:** GIVEN a root-owned `tasks/queue/` WHEN `archive` would stamp a file THEN it reports the permission problem and writes nothing.

**Test:** `tests/state-dir.test.mjs`, `tests/queue-drainer-archive.test.mjs` | **Complexity:** S | **Value:** MEDIUM | **Dependencies:** RS-REQ-010

---

## Invariants

- The doctor and the update script share one ownership helper.
- No tool escalates privilege.

## Out of Scope

- Finding out how root gained a write path (open question 1); disposing of `agents/secrets.mjs` (separate change).
