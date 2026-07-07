# Tasks: command-center-visibility

**Date**: 2026-07-06
**Author**: Fable (claude-fable-5) with Bryce
**Status**: tasks

---

## Overview

Build `agents/command-center-sync.mjs` (orchestrator: changes + sub-tasks +
backlog + runs + approvals + existing bridges), tests with the fake-hermes
shim, and rewire the kanban-sync scheduler job. See design.md and
specs/command-center/spec.md.

## Prerequisites

- [x] Design approved
- [x] Hermes CLI facts confirmed (`--parent`, `show --json` comments shape, immutable titles, `link`)
- [x] Run-ledger sources identified (cycle-history, pr-auto-review.log, drain-logs)

## Implementation Tasks

- [x] **T1 — change scanner** (REQ-001): read `openspec/changes/*` (skip archive), parse status.json phase + proposal excerpt, build card body with read-path + approval instructions.
- [x] **T2 — change upsert + phase comments** (REQ-001): idempotency-key `openspec:<name>`, lane by phase, `phase: a → b` comment on transition, state in `pm/command-center-links.json`.
- [x] **T3 — sub-task cards** (REQ-002): parse tasks.md checklist under `/task/i` headings (fallback: all), upsert children via `--parent`, complete checked items.
- [x] **T4 — backlog catalog** (REQ-003): parse BACKLOG.md `### <id>. <title>`, parent `backlog:root`, skip `R-*`, done for SHIPPED/COMPLETED.
- [x] **T5 — approvals** (REQ-004): scan change-card comments, record once to `pm/approvals.json`, stamp status.json, confirm as `--author sdlc-sync`.
- [x] **T6 — runs ledger + card** (REQ-005): normalize three sources → `pm/runs.json`, comment new runs on `runs:root` (≤20/pass, seen-cursor).
- [x] **T7 — composition + linking** (REQ-006): run kanban-bridge.sync + agent-registry in-process; `hermes kanban link` queue cards to change cards; section isolation (one failure ≠ abort).
- [x] **T8 — scheduler rewire** (REQ-006): cron-schedule template kanban-sync → single orchestrator command; regenerate unit via scheduler-install.
- [x] **T9 — tests**: `tests/command-center-sync.test.mjs` — fake hermes shim (+`show` canned via `$HERMES_SHOW_FILE`), scenarios for REQ-001..006 incl. idempotent re-run and approval single-fire.
- [x] **T10 — verify live**: run sync against the real repo, `hermes kanban list --json` shows changes + sub-cards + backlog + runs card; `hermes dashboard` spot-check; four-layer-validate green.

## Work Stream Summary

| Work Stream | Agent | Tasks | Parallel With |
|-------------|-------|-------|---------------|
| Orchestrator core | fable | T1–T7 | — |
| Scheduler + verify | fable | T8, T10 | after core |
| Tests | fable | T9 | after core |

## Done Checklist (framework repo)

- [x] openspec (this change)
- [x] tests pass
- [x] commit
- [x] push
