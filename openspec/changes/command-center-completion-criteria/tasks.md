# Tasks: command-center-completion-criteria

**Date**: 2026-09-07
**Author**: hermes-drain (autonomous drain worker)
**Status**: tasks

---

## Overview

Stop `parseSubtasks` from turning completion-criteria checkboxes (and, via the
sub-heading reset, prerequisites/notes) into kanban cards. See design.md and
specs/subtask-board-hygiene.md. Queue task: CC-001 (autonomous drain).

## Prerequisites

- [x] Root cause confirmed in `parseSubtasks` (two defects: criteria leak + `###` reset)
- [x] Real corpus surveyed — all 6 criteria sections are level-2 headings after `## Implementation Tasks`
- [x] Test home identified: `tests/command-center-sync.test.mjs`

## Implementation Tasks

- [x] **T1 — criteria skip** (REQ-001, REQ-002): `parseSubtasks` ignores
      checkboxes under headings matching
      `/completion criteria|acceptance criteria|definition of done/i` and
      resumes at the next same-or-higher-level heading.
- [x] **T2 — level-aware sections** (REQ-004): `###` sub-headings inherit
      their parent section; a new section starts only at a same-or-higher
      heading.
- [x] **T3 — fallback exclusion** (REQ-003): criteria items are never part of
      the no-task-section fallback; only-criteria changes yield zero, never a
      throw.
- [x] **T4 — tests**: 6 new cases in `tests/command-center-sync.test.mjs`
      (criteria leak, end-of-file criteria, only-criteria, criteria variants +
      resumption, `### Phase` inheritance, real business-os T-xxx exact set).
- [x] **T5 — full suite**: `npm test` green (unit + four-layer-validate +
      test-behavior).

## Work Stream Summary

| Work Stream | Agent | Tasks | Parallel With |
|-------------|-------|-------|---------------|
| Parser fix | hermes-drain | T1–T3 | Tests |
| Tests | hermes-drain | T4 | Parser fix |
| Suite + PR | hermes-drain | T5 | — (last) |

## Done Checklist (framework repo)

- [x] openspec (this change: proposal → design → specs → tasks)
- [x] tests pass (unit + defeat + behavior)
- [x] commit
- [x] push (PR opened for human review — not merged by the drain)

## Completion Criteria

This change is complete when:

- [ ] `parseSubtasks` emits no completion-criteria cards for any real change
- [ ] Business-os tasks.md still surfaces exactly its implementation items
- [ ] Reviewers confirm the diff is focused on the parser

---

## Notes

- The drain never merges; PR # arising from branch `agent/drain/CC-001` awaits
  human review.
- The 428 stale cards already on the board are reconciled separately —
  deleting board cards is out of scope here.