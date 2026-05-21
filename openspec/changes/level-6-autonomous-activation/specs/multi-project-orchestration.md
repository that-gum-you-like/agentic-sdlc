# Spec: multi-project-orchestration

**Date**: 2026-05-21
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: specs
**Capability**: NEW

---

## Overview

This capability provides a central registry of projects (`projects.json`) and an orchestrator (`multi-project-orchestrator.mjs`) that iterates enabled projects when a systemd timer fires. It includes a CLI (`projects.mjs`) for enable/disable/list/add/remove. The orchestrator is the single entry point for every cron-fired cycle, replacing per-project timers.

---

## Requirements

### REQ-001: projects.json Registry Schema

**Statement:** The system shall maintain a central `~/agentic-sdlc/projects.json` registry conforming to the documented schema, validated on every read.

**Acceptance Criteria:**
- [ ] File path is `~/agentic-sdlc/projects.json` (repo root, not in agents/)
- [ ] Top-level shape: `{ version: 1, projects: ProjectEntry[] }`
- [ ] Each entry has required fields: `name` (unique, kebab-case), `path` (absolute), `enabled` (boolean), `priority` (number, default 0)
- [ ] Optional fields: `description`, `orchestrationAdapter` (one of "file-based"/"paperclip"/"claude-code-native"), `lastRun` (Record<cycle, ISO timestamp>), `lastSuccess` (same)
- [ ] On read, any entry failing schema is logged as `error` and skipped (orchestrator continues with remaining entries)
- [ ] On write, the file is updated atomically (write to tempfile, rename) to prevent partial-state corruption

**Dependencies:** scheduled-self-improvement/REQ-001

**Complexity:** S

**Value:** Critical

**Notes:** Schema validation uses `agents/schema-validator.mjs` (existing).

---

### REQ-002: projects.mjs CLI

**Statement:** The system shall provide `agents/projects.mjs` with the following subcommands: `list`, `enable`, `disable`, `add`, `remove`, `status`.

**Acceptance Criteria:**
- [ ] `projects list` outputs a table with columns: name, path, enabled, priority, last-run (most recent across cycles), last-success (most recent)
- [ ] `projects enable <name>` sets `enabled: true` for the named project; errors if name not found
- [ ] `projects disable <name>` sets `enabled: false`; errors if name not found
- [ ] `projects add <name> --path <abs-path> [--priority N] [--description "..."]` appends a new entry; errors if name already exists, path doesn't exist, or path lacks `agents/project.json`
- [ ] `projects remove <name>` soft-deletes (sets enabled=false, retains in registry); `projects remove <name> --purge` hard-deletes
- [ ] `projects status` outputs queue depth + last-success age for each project as a health summary
- [ ] All subcommands exit non-zero on error and print clear messages to stderr

**Dependencies:** REQ-001

**Complexity:** S

**Value:** Critical

**Notes:** CLI is the primary interface for Bryce to toggle which projects drain.

---

### REQ-003: multi-project-orchestrator.mjs Iteration

**Statement:** The system shall provide `agents/multi-project-orchestrator.mjs --cycle <name>` which iterates enabled projects in `projects.json` and runs the named cycle for each.

**Acceptance Criteria:**
- [ ] Reads `projects.json`, filters to `enabled === true`, sorts by `priority` descending
- [ ] For each project, sets `SDLC_PROJECT_DIR=<project.path>` env var and spawns the cycle script
- [ ] Cycle name → script mapping is declared in `agents/orchestrator-cycles.json`:
  - `queue-drain` → `agents/queue-drainer.mjs run`
  - `seed-queue` → `agents/seed-queue-from-openspec.mjs`
  - `daily-review` → `agents/cycles/daily-review.mjs`
  - `weekly-review` → `agents/cycles/weekly-review.mjs`
  - `alignment-monitor` → `agents/alignment-monitor.mjs`
  - `capability-monitor` → `agents/capability-monitor.mjs check`
  - `cost-tracker` → `agents/cost-tracker.mjs report`
  - `garden-roadmap` → `agents/garden-roadmap.mjs --status`
  - `metrics` → `agents/metrics.mjs`
- [ ] Updates `projects.json` entry's `lastRun[cycle]` before invoking; updates `lastSuccess[cycle]` on exit code 0
- [ ] Emits structured logs with `correlationId` shared across all project invocations within a single timer fire
- [ ] Exits 0 if at least one project succeeded; exits 1 if all projects failed

**Dependencies:** REQ-001, structured-observability/REQ-001

**Complexity:** M

**Value:** Critical

**Notes:** Cycle name → script mapping in JSON (not hardcoded) so adding cycles later doesn't require code changes.

---

### REQ-004: File Lock Prevents Overlapping Cycles

**Statement:** The system shall acquire an exclusive advisory file lock before iterating projects and release it on exit, preventing two orchestrator instances from running the same cycle concurrently.

**Acceptance Criteria:**
- [ ] Lock file is `~/.agentic-sdlc/orchestrator.lock` (created on first run)
- [ ] Lock is per-cycle: lock file content is `{cycle, pid, startedAt}` JSON
- [ ] If a lock for the same cycle is held by an alive process, the new invocation logs a `warn` and exits 0 (not an error — overlap is expected during long cycles)
- [ ] If the lock file references a dead pid (older than 30 minutes), it's reclaimed
- [ ] Lock is released on normal exit and SIGINT/SIGTERM

**Dependencies:** REQ-003

**Complexity:** S

**Value:** High

**Notes:** Uses `fs.openSync` with `wx` flag and pid liveness check — no external locking library needed (zero-dep mandate).

---

### REQ-005: Per-Project Debounce

**Statement:** The system shall skip a project within an orchestrator run if its `lastSuccess[cycle]` is within 80% of the cycle's cadence.

**Acceptance Criteria:**
- [ ] Cadence per cycle is declared in `orchestrator-cycles.json` (e.g. `queue-drain: 3600` seconds)
- [ ] Skip threshold = 80% of cadence (e.g. queue-drain skips if last success within 2880s)
- [ ] Skipped projects emit `info` log line with `data: { reason: "debounce", lastSuccess }`
- [ ] Force-flag `--no-debounce` bypasses the check (for manual runs)

**Dependencies:** REQ-003

**Complexity:** S

**Value:** Medium

**Notes:** Prevents double-runs when a slow cycle nearly overlaps the next tick.

---

### REQ-006: Initial Registry Bootstrap

**Statement:** The system shall provide an initial `projects.json` containing the two known projects (agentic-sdlc, linguaflow) with appropriate defaults.

**Acceptance Criteria:**
- [ ] `projects.json` initial state at end of Phase 1:
  ```json
  {
    "version": 1,
    "projects": [
      { "name": "agentic-sdlc", "path": "/home/bryce/agentic-sdlc", "enabled": true, "priority": 10, "description": "The framework itself" },
      { "name": "linguaflow", "path": "/home/bryce/languageapp", "enabled": false, "priority": 5, "description": "Paused per Bryce's SDLC-for-job focus" }
    ]
  }
  ```
- [ ] Phase 1 commit includes this file
- [ ] `projects list` shows both projects on first run

**Dependencies:** REQ-001, REQ-002

**Complexity:** S

**Value:** Critical

**Notes:** Linguaflow path is `~/languageapp` per memory.

---

### REQ-007: Cycle Failure Does Not Block Other Projects

**Statement:** The system shall isolate cycle failures per project — a failure for one project must not prevent subsequent projects from running.

**Acceptance Criteria:**
- [ ] Each project's invocation is wrapped in try/catch
- [ ] Failure logs an `error` line and continues iteration
- [ ] `lastSuccess[cycle]` is NOT updated for failed projects
- [ ] After iteration, orchestrator exit code = 0 if any succeeded, 1 if none
- [ ] An aggregated summary at end of run: `{ totalProjects, succeeded, failed, skipped }`

**Dependencies:** REQ-003

**Complexity:** S

**Value:** High

**Notes:** Prevents one bad project from grinding the whole loop to a halt.

---

### REQ-008: orchestrationAdapter Override

**Statement:** When a project entry has `orchestrationAdapter` set, the orchestrator shall pass it through to the cycle script via `SDLC_ORCHESTRATION_ADAPTER` env var, overriding the project's own default.

**Acceptance Criteria:**
- [ ] If `projects.json` entry has `orchestrationAdapter: "paperclip"`, `SDLC_ORCHESTRATION_ADAPTER=paperclip` is set when invoking the cycle script
- [ ] If not set, no override env var is exported (cycle script uses its own project.json)
- [ ] Allows Bryce to test Paperclip orchestration on the agentic-sdlc project without changing agentic-sdlc's own project.json

**Dependencies:** REQ-003

**Complexity:** S

**Value:** Medium

**Notes:** Future-proofing for the work-demo Paperclip use case.

---

## Acceptance Criteria (Scenarios)

### Scenario 1: Two Projects, One Enabled

**Verifies:** REQ-001, REQ-003, REQ-006

**WHEN** `projects.json` has agentic-sdlc enabled and linguaflow disabled, and `multi-project-orchestrator.mjs --cycle queue-drain` is invoked

**THEN** `queue-drainer.mjs run` is spawned exactly once with `SDLC_PROJECT_DIR=/home/bryce/agentic-sdlc`

**AND** `queue-drainer.mjs` is NOT spawned for linguaflow

**AND** `projects.json` entry for agentic-sdlc gets `lastRun.queue-drain` updated

---

### Scenario 2: Disable Then Enable

**Verifies:** REQ-002

**WHEN** Bryce runs `node agents/projects.mjs disable agentic-sdlc` then `node agents/projects.mjs enable agentic-sdlc`

**THEN** After the disable, the next orchestrator run for any cycle skips agentic-sdlc

**AND** After the enable, the next orchestrator run includes agentic-sdlc

**AND** Other projects' state is unchanged

---

### Scenario 3: One Project Fails, Other Succeeds

**Verifies:** REQ-007

**WHEN** Both projects are enabled, and the queue-drainer cycle for project A fails (non-zero exit) while project B's succeeds

**THEN** Project B's `lastSuccess.queue-drain` is updated

**AND** Project A's `lastSuccess.queue-drain` is NOT updated (only `lastRun`)

**AND** Orchestrator exit code is 0 (at least one succeeded)

**AND** A log line at `error` level records project A's failure

---

### Scenario 4: Error Case — Concurrent Orchestrator Invocations

**Verifies:** REQ-004

**WHEN** Two `multi-project-orchestrator --cycle queue-drain` processes are started within the same second

**THEN** The first acquires the lock and runs normally

**AND** The second sees the held lock, logs a warn, and exits 0 without spawning any cycle scripts

---

### Scenario 5: Edge Case — Stale Lock from Dead Process

**Verifies:** REQ-004

**WHEN** The orchestrator was previously killed via SIGKILL leaving a lock file with a now-dead pid older than 30 minutes

**THEN** A new orchestrator invocation detects the stale lock, reclaims it, and runs normally

**AND** A log line records the stale-lock reclamation

---

## Invariants

- `projects.json` is always valid JSON (atomic writes prevent partial states)
- A project's `path` must exist and contain `agents/project.json` to be added — orphaned entries are not creatable
- The orchestrator never holds the lock across cycle script invocations longer than needed (lock is per-orchestrator-run, not per-project-spawn)
- Disabled projects are never invoked by the orchestrator regardless of priority

---

## Out of Scope

- Per-cycle per-project enable/disable (a project is either enabled for all cycles or none)
- Cross-project task dependencies (each project's queue is isolated)
- Cluster/multi-machine orchestration (single-machine assumption)

---

## Test Mapping

| Scenario | Test File | Test Name |
|---|---|---|
| Scenario 1 | `tests/multi-project-orchestrator.test.mjs` | "iterates only enabled projects" |
| Scenario 2 | `tests/projects-cli.test.mjs` | "enable/disable toggles" |
| Scenario 3 | `tests/multi-project-orchestrator.test.mjs` | "isolates per-project failures" |
| Scenario 4 | `tests/orchestrator-lock.test.mjs` | "rejects concurrent invocations" |
| Scenario 5 | `tests/orchestrator-lock.test.mjs` | "reclaims stale lock" |
