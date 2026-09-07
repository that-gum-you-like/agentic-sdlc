# Proposal: command-center-portfolio-sync

**Date**: 2026-09-07
**Author**: hermes-drain (autonomous drain worker)
**Status**: proposed

---

## Problem

`kanban-bridge.mjs` resolves `QUEUE_DIR` from a single `PROJECT_DIR`, so
`command-center-sync.mjs sync` only ever walks the framework repo's own
`tasks/queue`. A bootstrapped mission's queue is invisible to the board no
matter how many timers run.

nels-workshop's 11 tasks were absent from the board until a bespoke second
timer (`nels-workshop-kanban-sync` in `agents/cron-schedule.json`) was added
on 2026-09-07, passing `SDLC_PROJECT_DIR=/home/bryce/nels-workshop`. Every
future mission needs that same manual timer — a trap: each mission bootstrap
adds one more hand-written cron entry, and each entry syncs with UNNAMESPACED
idempotency keys, so two projects whose task queues both contain an `A-1` (or
whose openspec changes are both named `alpha`) would collide on the shared
board.

## Value Analysis

- **One generic timer, N missions.** `sync --all` replaces the manual
  per-mission timer pattern; a newly bootstrapped mission is on the board the
  moment its portfolio entry flips `enabled: true` — zero new cron entries (so
  the `nels-workshop-kanban-sync` and `willtopaint-kanban-sync` bespoke
  timers can be retired as missions come online).
- **Collision-proof board.** Namespacing the idempotency key with the project
  name (`<project>:openspec:<name>`, `<project>:<task-id>`, …) means the same
  task id or change name in two projects produces two distinct cards — card
  ids can never collide or silently overwrite across projects.
- **Fail-open on bad paths.** A project whose `path` is missing/unreliable is
  skipped with a warning, never an abort — one broken portfolio entry cannot
  take the whole board sync down (matching `syncPortfolio`'s existing
  degradation philosophy).
- **Zero new dependencies.** Pure Node stdlib (`child_process.spawnSync`),
  same zero-dep stance as the rest of the framework.

## Discovery

- `command-center-sync.mjs` already reads `portfolio.json` for
  `syncPortfolio` (REQ-004 in `openspec/changes/business-os/specs/portfolio-registry.md`),
  so the portfolio load path exists.
- The cron schedule's `kanban-sync` entry runs `command-center-sync.mjs sync`
  every 15 minutes — the natural future home for `--all`.
- `nels-workshop-kanban-sync` (bespoke, `SDLC_PROJECT_DIR`-scoped) exists in
  `agents/cron-schedule.json` and must be removed when `--all` lands, exactly
  as `willtopaint-kanban-sync`'s description anticipates ("remove once CC-003
  lands").
- Idempotency keys in `command-center-sync.mjs`: `openspec:<name>`,
  `subtask:<name>:<n>`, `backlog:root`/`backlog:<id>`, `runs:root`,
  `portfolio:<name>`. In `kanban-bridge.mjs`: the raw task id. All need the
  project-name prefix under `--all`.
- State (`pm/command-center-links.json`, `pm/kanban-links.json`) is already
  scoped per project dir via `SDLC_PROJECT_DIR` — per-project state needs no
  change; only the SHARED board's idempotency keys need namespacing.
- Tests live in `tests/command-center-sync.test.mjs` (fake-`hermes` PATH
  shim); the `--all` tests can drive real child processes against fixture
  project dirs with the same shim on PATH.

## Proposed Solution

1. **kanban-bridge.mjs**: honor `SDLC_PROJECT_NAMESPACE` (set by the
   `--all` runner). All kanban idempotency keys and the `pm/kanban-links.json`
   link-map keys become `<namespace>:<key>`; `reverseReconcile` strips the
   namespace before mapping a card back to a task file. When the env var is
   absent (the default `sync` path), behavior is byte-for-byte unchanged.
2. **command-center-sync.mjs**: same namespace prefix applied to every
   idempotency key it mints (change, subtask, backlog, runs, portfolio
   cards) and to the bridge link-map lookup in `linkQueueTasks`.
3. **`sync --all`**: new CLI mode. Reads `portfolio.json`, iterates projects
   with `enabled: true` **and** an existing `<path>/tasks/queue`, and runs one
   full sync pass per project in a child process with
   `SDLC_PROJECT_DIR=<path>` + `SDLC_PROJECT_NAMESPACE=<name>`. Missing paths
   are skipped with a warning, never an abort.
4. **cron-schedule.json**: remove `nels-workshop-kanban-sync`; switch
   `kanban-sync` to `sync --all`.

## Out of Scope

- Retiring board cards created under the old un-namespaced keys (one-time
  migration cleanup; the board is human-owned).
- Changing `willtopaint-kanban-sync` — willtopaint stays `enabled: false`;
  its bespoke timer remains until the project is re-enabled.