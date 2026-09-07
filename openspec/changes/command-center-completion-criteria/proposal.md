# Proposal: command-center-completion-criteria

**Date**: 2026-09-07
**Author**: hermes-drain (autonomous drain worker)
**Status**: proposed

---

## Problem

The kanban board carries 100+ stale cards. `parseSubtasks` in
`agents/command-center-sync.mjs` turns EVERY markdown checkbox in a change's
`tasks.md` into a kanban card, including the ones under a `## Completion
Criteria` heading. Those are verification statements, not work items — which
is why the board shows cards reading `Auto-memory updated`, `Backup file
openclaw.json.bak.5 exists` and `All Phase 1 tasks checked off`.

Two compounding defects in `parseSubtasks`:

1. **Criteria leakage** — a heading matching
   `/completion criteria|acceptance criteria|definition of done/i` does not
   stop item collection. Once a `/task/i` heading has been seen (e.g.
   `## Implementation Tasks`), `underTasks` stays `true` through every later
   non-matching heading, so the criteria checkboxes are collected as subtasks.
2. **Sub-heading reset** — ANY `##`/`###` heading unconditionally re-evaluates
   `underTasks`. A `### Phase 1` sub-heading inside `## Implementation Tasks`
   resets it to `false`, so the collected task-section items are dropped and
   the code falls back to *every* checklist item in the file (prerequisites,
   criteria, notes) — the other half of the 428-subtask pile-up.

428 subtasks exist across 29 changes; a large share are these two classes.

## Discovery

- `parseSubtasks` is exported for tests and used by `syncSubtasks` (child cards)
  and `statusReport` (counts) — the fix must keep both call sites working.
- All 6 real `## Completion Criteria` sections in `openspec/changes/*/tasks.md`
  are level-2 headings placed after `## Implementation Tasks` (the pattern is
  `## Implementation Tasks` → `### Phase N` subsections → `## Completion
  Criteria` → `## Notes`).
- The framework's own `openspec/changes/command-center-bridge/tasks.md` uses a
  `## Done Checklist (framework repo)` section with 4 checkboxes — not matched
  by the criteria regex, so it remains outside this change's scope.
- Tests live in `tests/command-center-sync.test.mjs` (42 tests, fake-hermes
  PATH shim); `parseSubtasks` unit tests already exist there.

## Proposed Solution

Fix `parseSubtasks` in `agents/command-center-sync.mjs`:

1. **Skip criteria sections**: checkboxes under a heading matching
   `/completion criteria|acceptance criteria|definition of done/i` are never
   collected — not into the task-section list AND not into the everything-
   fallback list (so a change with only criteria yields zero subtasks, not a
   fallback of its criteria).
2. **Resume at the same-or-higher level**: the criteria skip ends at the next
   heading of the same or higher level (fewer or equal `#`); deeper
   sub-headings remain inside the criteria section.
3. **Level-aware sections**: a `###` sub-heading belongs to its parent section
   instead of resetting it — a new section starts only at a heading of the
   same or higher level. This restores the documented contract ("items under a
   heading matching /task/i count") and makes the real
   `openspec/changes/business-os/tasks.md` yield exactly its 40 T-xxx items.

Add unit tests covering: criteria after tasks → only implementation items;
criteria at end of file → none; only-criteria change → zero, never a throw;
criteria variants (`Acceptance Criteria`, `Definition of Done`) with
resumption; nested `### Phase` inheritance; and the real business-os tasks.md
exact T-xxx set.

## Value Analysis

- **Value**: HIGH — removes the chronic board-hygiene failure that pushes real
  work items off the board and generates 60+-day-old stale cards; unblocks the
  "board as source of truth" workflows the command-center changes depend on.
- **Cost**: LOW — one pure function (~30 lines changed), zero new
  dependencies, no I/O or lifecycle changes; behavior for files without
  criteria headings is preserved except the `###` reset fix, which aligns with
  the documented contract.
- **Risk**: LOW — pure parsing change; existing 41 tests plus 6 new ones gate
  it; verified against the real tasks.md corpus.
- **Alternatives considered**: filter criteria items after parsing (rejected —
  still leaks prereq/notes via the fallback and cannot "resume" correctly);
  config flag to disable subtasks (rejected — hides the bug instead of fixing
  it).

## Out of Scope

- `## Done Checklist` sections (not matched by the criteria regex).
- The 428 already-created stale cards (board reconciliation is separate work).
- Other parsers of tasks.md (e.g. `seed-queue-from-openspec.mjs`) — they read
  a different shape and were not implicated.