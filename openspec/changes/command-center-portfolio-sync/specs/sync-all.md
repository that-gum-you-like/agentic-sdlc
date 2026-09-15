# Specs — portfolio-wide board sync (`sync --all`)

**Date**: 2026-09-07
**Author**: hermes-drain (autonomous drain worker)
**Status**: specs

Covers `sync --all` in `agents/command-center-sync.mjs` and the
`SDLC_PROJECT_NAMESPACE` support in `agents/kanban-bridge.mjs` — the
mechanism that puts every enabled portfolio project's queue and OpenSpec
changes on the shared Hermes board without card-key collisions.

**Governing principle: one generic sync for the whole portfolio.** A
bootstrapped mission appears on the board when its portfolio entry is
`enabled: true`; no per-mission cron timer should ever be required, and no
two projects' cards may share an idempotency key.

---

## REQ-001 — `sync --all` walks every enabled portfolio project

**Statement:** `command-center-sync.mjs sync --all` reads `portfolio.json` and
runs one full sync pass per project with `enabled: true` whose `path` exists
and contains a `tasks/queue` directory.

**Acceptance:**
- Two enabled fixture projects with distinct `path`s both get a full sync
  pass (their queue tasks are created as cards).
- A project with `enabled: false` (valid path or not) is never synced.
- A project absent from `portfolio.json` is never synced, regardless of any
  `tasks/queue` on disk.

**Dependencies:** none

---

## REQ-002 — Idempotency keys are namespaced per project

**Statement:** under `--all`, every kanban idempotency key minted for a
project is prefixed with that project's name (`<project>:<key>`), for queue
cards (kanban-bridge), OpenSpec change cards, subtask cards, backlog cards,
run-history cards, and portfolio cards.

**Acceptance:**
- Two fixture projects that both have a change named `alpha` produce cards
  with keys `<projA>:openspec:alpha` and `<projB>:openspec:alpha` — never a
  bare `openspec:alpha`.
- Two fixture projects whose queues both contain task id `A-1` produce keys
  `<projA>:A-1` and `<projB>:A-1` — never a bare `A-1`.
- Subtask cards follow the same rule (`<proj>:subtask:alpha:1`).
- With `SDLC_PROJECT_NAMESPACE` unset (the default `sync` path), every key is
  byte-for-byte what it was before this change (existing observed keys:
  `openspec:alpha`, `subtask:alpha:1`, `backlog:root`, `runs:root`,
  `portfolio:agentic-sdlc`, bare task ids).

**Dependencies:** REQ-001 (the runner sets the namespace)

---

## REQ-003 — Missing project paths warn and skip, never abort

**Statement:** a portfolio entry with `enabled: true` whose `path` is missing
or does not resolve to a directory containing `tasks/queue` is skipped; the
runner records a warning naming the project and continues with the remaining
projects.

**Acceptance:**
- `syncAllProjects()` returns the warning in its `warnings` array and still
  syncs the other enabled projects.
- The runner process does not throw and exits non-zero only if a project's
  sync pass itself failed.

**Dependencies:** none

---

## REQ-004 — Per-project state stays per-project

**Statement:** each `--all` pass writes its state (`pm/command-center-links.json`,
`pm/kanban-links.json`, `pm/runs.json`) into the synced project's own `pm/`
directory; no state is shared or mixed between projects.

**Acceptance:**
- After `sync --all` over two fixture projects, each fixture's `pm/` contains
  its own links/state files referencing only its own project's card ids.
- The framework repo's own `pm/` state (from the default `sync` path) is not
  modified by the fixture runs.

**Dependencies:** REQ-001

---

## REQ-005 — The bespoke per-mission sync timer is removed

**Statement:** `agents/cron-schedule.json` no longer contains
`nels-workshop-kanban-sync`, and the generic `kanban-sync` entry runs
`command-center-sync.mjs sync --all`.

**Acceptance:**
- `agents/cron-schedule.json` contains no `nels-workshop-kanban-sync` entry.
- The `kanban-sync` entry's `script` is
  `node ~/agentic-sdlc/agents/command-center-sync.mjs sync --all`.
- Other bespoke timers for still-disabled projects (e.g.
  `willtopaint-kanban-sync`) are untouched.

**Dependencies:** REQ-001