# Design: command-center-completion-criteria

**Date**: 2026-09-07
**Author**: hermes-drain (autonomous drain worker)
**Status**: design

---

## Problem

`parseSubtasks(tasksMd)` mixes verification statements into work items. Two
defects (see proposal.md):

1. A `/task/i` section stays "active" through every later heading, so
   `## Completion Criteria` checkboxes are collected as subtasks.
2. Every sub-heading resets the section flag, so `### Phase N` blocks inside
   `## Implementation Tasks` empty the task list and the fallback pulls in
   every checkbox in the file (prerequisites, criteria, notes).

## Goals

- Checkboxes under a criteria heading are NEVER returned — not in the primary
  list, not in the fallback.
- A criteria section ends at the next heading of the same or higher level
  (fewer or equal `#`); deeper sub-headings stay inside it.
- Nested sub-headings inherit the enclosing section instead of resetting it.
- Existing behavior for non-criteria files preserved (fallback when no task
  section has items; `checked` state; markdown stripped via `cleanTitle`).
- No new dependencies; pure function; both call sites (`syncSubtasks`,
  `statusReport`) unchanged.

## Design

### Heading model

Lines matching `/^(#{2,3})\s+(.*)$/` are headings with `level = #`-count and
`title`. State carried across lines:

| var | meaning |
|-----|---------|
| `underTasks` | whether the current section is a task section (`/task/i` on its heading) |
| `sectionLevel` | heading level of the current section (0 = none yet) |
| `inCriteria` | inside a criteria section |
| `criteriaLevel` | heading level of the criteria section that opened |

**Section change**: a heading starts a new section only when
`level <= sectionLevel || sectionLevel === 0` (same or higher level). A deeper
heading (`level > sectionLevel`) is a sub-heading and keeps the current
`underTasks` — this is what fixes the `### Phase N` reset.

**Criteria entry**: a heading whose title matches
`/completion criteria|acceptance criteria|definition of done/i` opens a
criteria section at its level: `inCriteria = true`, `criteriaLevel = level`,
`underTasks = false`.

**Criteria exit**: while `inCriteria`, a heading with `level <= criteriaLevel`
closes the section and the heading is then processed normally (criteria check
first, then section change). A deeper heading (`level > criteriaLevel`) is a
criteria sub-heading: skip it and stay inside.

**Checkbox handling**: `- [ ]` / `- [x]` lines are ignored entirely while
`inCriteria` — they are pushed to neither `inTaskSection` nor `all`, so the
fallback can never resurrect them.

### Output

`inTaskSection` wins when non-empty; else `all` (unchanged). Both lists exclude
criteria items. Items get `n: 1..N` numbering (unchanged).

## Decisions

1. **Criteria items excluded from the fallback too.** `all` is the "no task
   section" fallback; a change containing only criteria must yield zero
   subtasks per REQ-003, so criteria items cannot sit in `all`.
2. **Sub-headings inherit the section.** This is the documented contract
   ("items under a heading matching /task/i count") and the only way the real
   business-os file (task section split into `### Phase 0..7`) parses to
   exactly its T-xxx items. A `### Something Tasks` sub-heading under a
   non-task section stays non-task (markdown hierarchy wins over the heading
   text).
3. **Heading regex stays `#{2,3}`.** Real tasks.md corpus uses only `#`, `##`,
   `###`, and the existing tests exercise level 2–3. Level-1 (`# Tasks: x`)
   and level-4+ headings are deliberately untouched — no behavior change
   outside the fix.
4. **No config flag.** The parser should never emit verification statements as
   work items; making it opt-in would leave the default broken.

## Verification

- Unit tests in `tests/command-center-sync.test.mjs` (6 new):
  criteria section never leaks; end-of-file criteria yields none; only-criteria
  change yields zero and does not throw; criteria variants + resumption at
  next task heading; `### Phase` inheritance with checked state preserved; real
  `openspec/changes/business-os/tasks.md` returns exactly its 40 `T-xxx` ids.
- `npm test` full suite (unit + four-layer-validate + test-behavior) green.
- Cross-check: `command-center-bridge/tasks.md`'s `## Done Checklist` (not a
  criteria heading) does not match the criteria regex and its items are not
  under a `/task/i` section, so they are excluded from the result exactly as
  before the change — unchanged behavior, out of scope by design.