# Spec: supply-chain-security-program — Reporting, Notification & Liveness

**Date**: 2026-09-15
**Author**: Claude (Opus 5) with Bryce
**Status**: specs
**Requirement band**: `SCS-REQ-020` – `SCS-REQ-029`

---

## Overview

What sentinel produces and how it speaks. This capability carries the requirement that most
determines whether the whole program survives contact with three months of daily use: it must be
quiet enough to stay trusted, and it must never let a dead timer look like a clean run.

---

## Requirements

### SCS-REQ-020: Dated report per run

**Statement:** The system shall write a dated markdown report per run, consistent with the existing
`pm/red-team-reports/` convention and sharing its severity vocabulary.

**Acceptance Criteria:**
- [ ] Written to `pm/security-reports/sentinel-<YYYY-MM-DD>-<A|B>.md`
- [ ] Severity buckets are exactly `low` / `medium` / `high`, matching `red-team-tester.mjs`
- [ ] Sections: summary counts, findings by severity, cross-model diff (Run B), evidence pointers, run metadata
- [ ] Run metadata records model, duration, cost, prompt hash, and per-repo commit scanned
- [ ] **A zero-finding run still writes a full report**
- [ ] Edge case: two runs on the same date and label do not overwrite each other silently

**Dependencies:** SCS-REQ-010
**Complexity:** S
**Value:** HIGH
**Notes:** Shared vocabulary so a reader can hold a red-team report and a sentinel report side by side.

---

### SCS-REQ-021: HIGH-only notification with baseline suppression

**Statement:** The system shall notify only on HIGH findings not already present in the accepted
baseline, through the existing `notify.mjs` path.

**Acceptance Criteria:**
- [ ] Only HIGH findings trigger notification; MEDIUM and LOW live in the report
- [ ] A finding whose stable id is in `agents/sentinel/baseline.json` never notifies
- [ ] One notification per run, summarizing counts and pointing at the report — never one per finding
- [ ] Notification goes through `notify.mjs`; no new notification path is invented
- [ ] `--dry-run` suppresses both writes and notifications
- [ ] Edge case: 50 HIGH findings produce one message, not 50

**Dependencies:** SCS-REQ-020
**Complexity:** S
**Value:** CRITICAL
**Notes:** Alert fatigue is the failure mode that kills this. A runaway cron has destroyed trust in
this channel before; the Hermes cron Docker path trap spammed Telegram every 15 minutes for weeks.

---

### SCS-REQ-022: Stable finding identity

**Statement:** The system shall assign each finding a stable id derived from scanner, repo, and
subject, so that the same underlying issue is recognised across runs.

**Acceptance Criteria:**
- [ ] The same issue yields the same id on consecutive runs
- [ ] An id survives unrelated line-number churn in the same file
- [ ] Ids are what `baseline.json` and cross-run diffing key on
- [ ] Edge case: two distinct findings from one scanner in one file receive distinct ids

**Dependencies:** SCS-REQ-020
**Complexity:** M
**Value:** HIGH
**Notes:** Without stable identity, baselining and the cross-model diff are both impossible.

---

### SCS-REQ-023: Cross-model diff

**Statement:** The system shall report, on the second run of each day, which findings each model
found that the other did not.

**Acceptance Criteria:**
- [ ] The Run B report names findings unique to Run A, unique to Run B, and common to both
- [ ] Each asymmetric finding names the model that saw it
- [ ] The diff is marked non-comparable when prompt hashes or scanned commits differ
- [ ] Edge case: Run A missing entirely produces a stated "no comparison available", not an empty diff

**Dependencies:** SCS-REQ-014, SCS-REQ-022
**Complexity:** M
**Value:** HIGH
**Notes:** This diff is the deliverable that justifies two models, not a side effect.

---

### SCS-REQ-024: Liveness and staleness

**Statement:** The system shall record run liveness and shall alert when sentinel has not completed
successfully within an expected window.

**Acceptance Criteria:**
- [ ] `pm/sentinel-state.json` records `lastSuccessfulRun` per label, with cost and duration history
- [ ] `health-check.mjs` gains a `sentinel` check reading that state
- [ ] No successful run in 36 hours → the daily health check reports degraded and notifies
- [ ] A clean run and a dead timer are distinguishable from the report directory alone
- [ ] Edge case: first-ever run with no prior state reports "never run", not "stale"

**Dependencies:** SCS-REQ-020
**Complexity:** M
**Value:** CRITICAL
**Notes:** A timer that fails silently is worse than no timer. This is the requirement that makes
silence unambiguous.

---

### SCS-REQ-025: Live-compromise escalation

**Statement:** The system shall treat evidence of an actual live compromise as a distinct, immediate
escalation that is never suppressed by baseline or dry-run.

**Acceptance Criteria:**
- [ ] A confirmed live-compromise class (active exfiltration in an install script, a credential
      known-published, a backdoor in executed framework code) notifies immediately with evidence
- [ ] Escalation fires even under `--dry-run`
- [ ] Escalation is never suppressed by `baseline.json`
- [ ] The system takes no remediation action and makes no quiet fix
- [ ] Edge case: escalation still delivers if the report write fails

**Dependencies:** SCS-REQ-021
**Complexity:** S
**Value:** CRITICAL
**Notes:** Per the brief: stop, do not fix it quietly, notify immediately with evidence.

---

### SCS-REQ-026: Scheduled twice-daily execution

**Statement:** The system shall run twice daily via `sdlc-sched-*` systemd user timers generated
from `agents/cron-schedule.json`.

**Acceptance Criteria:**
- [ ] Two entries added: `sentinel-run-a` at 06:30 and `sentinel-run-b` at 18:30
- [ ] Units are generated by `scheduler-install.mjs`; no unit file is hand-written
- [ ] Units set PATH explicitly and do not depend on an interactive environment
- [ ] Both timers are observed firing and producing a report before the change is marked done
- [ ] Edge case: a missed run is caught up by `Persistent=true` without double-running

**Dependencies:** SCS-REQ-030
**Complexity:** S
**Value:** HIGH
**Notes:** 06:00 and 18:00 were requested but 06:00 already carries `daily-review` and
`health-check-daily`; 06:30/18:30 are clear and avoid the `*/15` drain ticks.

---

## Acceptance Criteria (Scenarios)

### Scenario 1: A clean run is still visible
**Verifies:** SCS-REQ-020, SCS-REQ-024
**WHEN** a run completes with zero findings
**THEN** a full report is written recording what was scanned and that nothing was found
**AND** `lastSuccessfulRun` is updated, and no notification is sent

### Scenario 2: A dead timer is caught
**Verifies:** SCS-REQ-024
**WHEN** no sentinel run has succeeded in 40 hours
**THEN** the daily health check reports sentinel degraded and notifies
**AND** the message distinguishes "stale" from "never run"

### Scenario 3: A known-accepted finding stays quiet
**Verifies:** SCS-REQ-021, SCS-REQ-022
**WHEN** a HIGH finding already recorded in `baseline.json` recurs
**THEN** it appears in the report
**AND** it sends no notification

### Scenario 4: Error Case — notification delivery fails
**Verifies:** SCS-REQ-021, SCS-REQ-025
**WHEN** `notify.mjs` fails to deliver
**THEN** the failure is recorded in the run state and the report is still written
**AND** the next run's health check surfaces the delivery failure

### Scenario 5: Edge Case — many HIGH findings at once
**Verifies:** SCS-REQ-021
**WHEN** a run produces 50 unbaselined HIGH findings
**THEN** exactly one notification is sent, carrying counts and the report path

---

## Invariants

- Silence always means "ran and found nothing", never "did not run".
- Exactly one notification per run, except live-compromise escalation.
- No secret value ever appears in a report or notification.
- Reports are append-only history; a run never overwrites a previous run's report.

---

## Out of Scope

- A web dashboard view of findings (the command-center bridge is separate work).
- Notification routing anywhere other than the existing `notify.mjs` Telegram path.

---

## Test Mapping

| Scenario | Test File | Test Name |
|----------|-----------|-----------|
| Scenario 1 | `tests/sentinel-report.test.mjs` | `zero-finding run writes a full report and updates liveness` |
| Scenario 2 | `tests/sentinel-liveness.test.mjs` | `health check reports stale after 36h` |
| Scenario 3 | `tests/sentinel-report.test.mjs` | `baselined HIGH reports but does not notify` |
| Scenario 4 | `tests/sentinel-report.test.mjs` | `notification failure is recorded, report still written` |
| Scenario 5 | `tests/sentinel-report.test.mjs` | `50 HIGH findings produce exactly one notification` |

---

## Next Step

Proceed to tasks phase using `openspec-continue-change`.
