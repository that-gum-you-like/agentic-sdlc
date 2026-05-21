# Spec: structured-observability

**Date**: 2026-05-21
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: specs
**Capability**: NEW

---

## Overview

This capability provides structured logging (`agents/log.mjs`) used by all scripts and a daily metrics aggregator (`agents/metrics.mjs`) producing `pm/METRICS.md` and `pm/metrics.json`. Together they raise the Observability maturity dimension from 3.0 to 5.0 by making cycle activity, costs, throughput, drift alerts, and skip rates all machine-queryable.

---

## Requirements

### REQ-001: JSONL Structured Logger

**Statement:** The system shall provide `agents/log.mjs` exporting `debug`, `info`, `warn`, `error` functions that write one JSON object per line to `pm/logs/YYYY-MM-DD.jsonl` (UTC day).

**Acceptance Criteria:**
- [ ] Each log line is valid JSON, terminated by `\n`
- [ ] Required keys: `ts` (ISO 8601 UTC), `level` (`"debug"|"info"|"warn"|"error"`), `script` (filename of caller), `correlationId` (UUID v4), `msg` (string)
- [ ] Optional keys: `agent` (string), `cycle` (string), `data` (any JSON-serializable object)
- [ ] `correlationId` defaults to a per-process UUID v4 set on module load, overridable via `setCorrelationId(id)` for orchestrator-driven invocations
- [ ] Atomic appends (single write call per line) — no partial-line corruption under concurrent writes
- [ ] Writes are non-blocking from the caller's perspective (`fs.appendFile` with callback discarded; errors logged to stderr but not thrown)

**Dependencies:** none

**Complexity:** S

**Value:** Critical

**Notes:** Zero-dep — pure Node stdlib. Caller calls `import { info, warn, error } from './log.mjs'` and uses `info('script-action', { data })`.

---

### REQ-002: 10 Scripts Instrumented

**Statement:** The system shall instrument the 10 most-called scripts to emit `info`-level log lines on entry and exit, plus `warn`/`error` lines for skips and failures.

**Acceptance Criteria:**
- [ ] Instrumented scripts: `queue-drainer.mjs`, `cycles/daily-review.mjs`, `cycles/weekly-review.mjs`, `cost-tracker.mjs`, `notify.mjs`, `four-layer-validate.mjs`, `capability-monitor.mjs`, `alignment-monitor.mjs`, `pattern-hunt.mjs`, `seed-queue-from-openspec.mjs`
- [ ] Each script emits one `info` log line on entry with `data: { args, cwd }`
- [ ] Each script emits one `info` log line on exit with `data: { durationMs, exitCode }`
- [ ] Each script emits one `warn` line per skip with `data: { reason }`
- [ ] Each script emits one `error` line per failure with `data: { errorName, stack }`
- [ ] No existing functionality is changed — instrumentation is purely additive

**Dependencies:** REQ-001

**Complexity:** M

**Value:** Critical

**Notes:** Each instrumentation is ~5 lines per script. Total ~50 lines of additive code across 10 files.

---

### REQ-003: Daily Metrics Aggregator

**Statement:** The system shall provide `agents/metrics.mjs` which reads logs and cost data and produces `pm/METRICS.md` (human-readable) and `pm/metrics.json` (machine-readable).

**Acceptance Criteria:**
- [ ] Reads `pm/logs/<yesterday>.jsonl` (UTC day) plus `pm/cost-tracker.jsonl`
- [ ] Computes per-project metrics: tasks attempted, tasks completed, tasks failed, average time-to-completion, total tokens spent, drift alerts count, skip count by cycle
- [ ] Writes `pm/METRICS.md` with sections: Summary, Per-Project Detail, Cycle Health, Token Budget Status, Drift Alerts
- [ ] Writes `pm/metrics.json` with the structured equivalent (machine-parseable)
- [ ] Idempotent — running twice for the same day produces the same output
- [ ] Run daily at 06:37 via `sdlc-metrics.timer`

**Dependencies:** REQ-001, REQ-002

**Complexity:** M

**Value:** Critical

**Notes:** Aggregator runs over yesterday's logs, not today's (today is still being written).

---

### REQ-004: Drift Alert Surfacing

**Statement:** The system shall surface capability-drift alerts (from `capability-monitor.mjs`) and pattern-detection alerts (from `pattern-hunt.mjs`) into the daily metrics output.

**Acceptance Criteria:**
- [ ] `capability-monitor.mjs check` writes drift events as `warn` log lines via log.mjs
- [ ] `pattern-hunt.mjs` writes detected anti-pattern occurrences as `warn` log lines via log.mjs
- [ ] `metrics.mjs` aggregates these and lists them in `pm/METRICS.md` under "Drift Alerts" and "Pattern Detections" sections
- [ ] If drift alert count > 3 for a single agent in a 24h window, an additional `error` line triggers a notify.mjs send

**Dependencies:** REQ-002, REQ-003

**Complexity:** S

**Value:** High

**Notes:** Surfacing closes the loop — drift detection becomes drift response.

---

### REQ-005: Log Rotation Without External Tools

**Statement:** The system shall rotate logs purely via filename (one file per UTC day) and prune files older than 30 days.

**Acceptance Criteria:**
- [ ] Filename pattern: `pm/logs/YYYY-MM-DD.jsonl`
- [ ] On `metrics.mjs` run, files older than 30 days are deleted
- [ ] Pruning is logged at `info` level with `data: { deleted: string[] }`
- [ ] No external rotation tool (logrotate, etc.) required
- [ ] Per-day max file size is not enforced — relying on natural daily boundaries

**Dependencies:** REQ-001

**Complexity:** S

**Value:** Medium

**Notes:** 30-day retention is a sensible default for a personal-scale framework.

---

### REQ-006: Observable Cron Health in pm/DASHBOARD.md

**Statement:** The system shall ensure `pm/DASHBOARD.md` (refreshed by `cycles/daily-review.mjs`) includes a "Cron Health" section showing last-run/next-run for every sdlc-* timer.

**Acceptance Criteria:**
- [ ] `daily-review.mjs` queries `systemctl --user list-timers sdlc-*` and parses the output
- [ ] `pm/DASHBOARD.md` Cron Health section shows: timer name, last-run (relative time), next-run (relative time), state
- [ ] If any timer hasn't fired in >2x its cadence, it's flagged red
- [ ] If `systemctl` is unavailable (test runner), the section is omitted with a note

**Dependencies:** REQ-001, scheduled-self-improvement/REQ-002

**Complexity:** S

**Value:** High

**Notes:** Dashboard is the first place Bryce looks each morning — cron health belongs there.

---

## Acceptance Criteria (Scenarios)

### Scenario 1: Single Log Write Survives Concurrent Callers

**Verifies:** REQ-001

**WHEN** Two scripts running in parallel each call `info("event", { data: i })` 100 times concurrently

**THEN** `pm/logs/<today>.jsonl` contains exactly 200 valid JSON lines

**AND** No line is truncated or interleaved with another

---

### Scenario 2: Metrics Aggregation Captures Yesterday's Cycle

**Verifies:** REQ-003

**WHEN** Yesterday a full set of cycles ran (5 queue-drains, 1 daily-review, etc.)

**THEN** `metrics.mjs` produces a `pm/METRICS.md` with a "Cycle Health" section listing each cycle's run count

**AND** `pm/metrics.json` has the same data in structured form

**AND** Running metrics.mjs again produces identical files (idempotent)

---

### Scenario 3: Drift Alert Triggers Notification

**Verifies:** REQ-004

**WHEN** `capability-monitor.mjs` detects 4 drift events for agent "roy" within 24h

**THEN** The 4th drift event triggers a notify.mjs send

**AND** `pm/METRICS.md` lists all 4 drift events under "Drift Alerts"

---

### Scenario 4: Error Case — Logs Directory Missing

**Verifies:** REQ-001

**WHEN** `pm/logs/` directory does not exist and a script calls `info("event")`

**THEN** The directory is created automatically

**AND** The log line is written successfully

**AND** No error is thrown to the caller

---

### Scenario 5: Edge Case — Old Logs Pruned

**Verifies:** REQ-005

**WHEN** `pm/logs/` contains 60 daily files (60 days of logs) and `metrics.mjs` runs

**THEN** Files older than 30 days are deleted

**AND** Exactly 30 files remain

**AND** A log line records what was pruned

---

## Invariants

- A log line is either fully written or not written — no partial lines on disk
- `correlationId` ties together all log lines from a single orchestrator invocation
- `pm/logs/` writes are append-only (never overwrite existing lines)
- `pm/METRICS.md` is human-readable plain markdown (no embedded HTML or scripts)

---

## Out of Scope

- Real-time log streaming or websocket dashboards
- Log aggregation across multiple machines (single-machine assumption)
- Log shipping to external services (Datadog, etc.)
- Custom log levels beyond debug/info/warn/error

---

## Test Mapping

| Scenario | Test File | Test Name |
|---|---|---|
| Scenario 1 | `tests/log.test.mjs` | "concurrent writes do not interleave" |
| Scenario 2 | `tests/metrics.test.mjs` | "aggregates yesterday's cycle counts" |
| Scenario 3 | `tests/drift-alert.test.mjs` | "4 drift events triggers notify" |
| Scenario 4 | `tests/log.test.mjs` | "creates logs dir on first write" |
| Scenario 5 | `tests/metrics.test.mjs` | "prunes logs older than 30 days" |
