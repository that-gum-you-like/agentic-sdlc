# Tasks: command-center-portfolio-sync

**Date**: 2026-09-07
**Author**: hermes-drain (autonomous drain worker)
**Status**: tasks

---

## Overview

Add `sync --all` to the command-center sync: every enabled portfolio project
with a real `tasks/queue` gets a full, per-project-namespaced board sync, so
bootstrapped missions appear without hand-written per-mission cron timers. See
design.md and specs/sync-all.md. Queue task: CC-003 (autonomous drain).

## Prerequisites

- [x] Root cause confirmed: `QUEUE_DIR` resolves from one `PROJECT_DIR`, so
      `sync` walks only the framework repo
- [x] Idempotency key inventory taken (bridge: task id; sync: openspec/
      subtask/backlog/runs/portfolio prefixes)
- [x] Cron schedule surveyed — `nels-workshop-kanban-sync` is the bespoke
      entry to remove; `kanban-sync` is the timer that takes over `--all`

## Implementation Tasks

- [x] **T1 — bridge namespace** (REQ-002): `kanban-bridge.mjs` reads
      `SDLC_PROJECT_NAMESPACE`; `nsKey()` prefixes idempotency keys and
      `pm/kanban-links.json` link-map keys; `reverseReconcile` strips the
      namespace before resolving a task file. Default path unchanged.
- [x] **T2 — sync namespace** (REQ-002): `command-center-sync.mjs` applies
      `nsKey()` to every idempotency key it mints (change, subtask, backlog,
      runs, portfolio) and to the bridge link-map lookup in `linkQueueTasks`.
- [x] **T3 — `sync --all` runner** (REQ-001, REQ-003, REQ-004): exported
      `syncAllProjects()` iterates `portfolio.json`; enabled projects with an
      existing `<path>/tasks/queue` are synced in a child process scoped by
      `SDLC_PROJECT_DIR` + `SDLC_PROJECT_NAMESPACE`; missing paths warn and
      skip; `PORTFOLIO_PATH` is not inherited by children. CLI:
      `sync --all`.
- [x] **T4 — cron** (REQ-005): remove `nels-workshop-kanban-sync`; switch
      `kanban-sync` to `sync --all`; leave disabled-project timers untouched.
- [x] **T5 — tests** (REQ-001..REQ-005): three new cases in
      `tests/command-center-sync.test.mjs` — (1) two fixture projects sync
      without key collision, (2) missing path warns and continues, (3) a
      project absent from the portfolio is not synced.
- [x] **T6 — full suite**: `npm test` green (unit + four-layer-validate +
      test-behavior).

## Work Stream Summary

| Work Stream | Agent | Tasks | Parallel With |
|-------------|-------|-------|---------------|
| Namespacing | hermes-drain | T1–T2 | — |
| Runner + cron | hermes-drain | T3–T4 | T5 |
| Tests | hermes-drain | T5 | T3–T4 |
| Suite + PR | hermes-drain | T6 | — (last) |

## Done Checklist (framework repo)

- [x] openspec (this change: proposal → design → specs → tasks)
- [x] tests pass (unit + defeat + behavior)
- [x] commit
- [x] push (PR opened for human review — not merged by the drain)

## Completion Criteria

This change is complete when:

- [ ] `sync --all` namespaces keys per project on a shared board
- [ ] A missing portfolio path warns and never aborts the run
- [ ] Reviewers confirm the diff is focused on the sync + cron

---

## Notes

- The drain never merges; the PR arising from branch `agent/drain/CC-003`
  awaits human review (draft).
- Existing board cards created under un-namespaced keys are not migrated by
  this change — see proposal.md "Out of Scope".