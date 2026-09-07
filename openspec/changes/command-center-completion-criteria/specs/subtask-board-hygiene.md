# Specs — subtask board hygiene

**Date**: 2026-09-07
**Author**: hermes-drain (autonomous drain worker)
**Status**: specs

Covers `parseSubtasks` in `agents/command-center-sync.mjs` — the parser that
turns a change's `tasks.md` checkboxes into kanban child cards.

**Governing principle: verification statements are never work items.** A
checkbox under a heading matching
`/completion criteria|acceptance criteria|definition of done/i` must never
appear as a subtask, whether the file has a task section or not.

---

## REQ-001 — Criteria sections never produce subtasks

**Statement:** `parseSubtasks(tasksMd)` skips every checkbox under a heading
whose title matches `/completion criteria|acceptance criteria|definition of
done/i`. Items collected under a `/task/i` heading before the criteria section
are unaffected.

**Acceptance:**
- A tasks.md with `## Implementation Tasks` followed by `## Completion
  Criteria` returns only the implementation items
- None of the returned items' `text` contains a criteria phrase
- Checked/unchecked state of the kept items is preserved

**Dependencies:** none
**Complexity:** S
**Value:** HIGH

---

## REQ-002 — Criteria skip resumes at the same-or-higher level

**Statement:** the criteria skip ends at the next heading of the same or
higher level (fewer or equal `#`). A deeper sub-heading remains inside the
criteria section. Parsing resumes normally (including re-entering a task
section) once the section closes.

**Acceptance:**
- A `### Acceptance Criteria` inside `## Implementation Tasks` skips only its
  items; checkboxes under a later `## More Tasks` heading are collected again
- A sub-heading deeper than the criteria heading (e.g. `####` under
  `### Acceptance Criteria`) does not close the section
- A criteria section at the end of the file — with no task section anywhere —
  yields zero subtasks

**Dependencies:** REQ-001
**Complexity:** S
**Value:** HIGH

---

## REQ-003 — Criteria items are excluded from the fallback too

**Statement:** when no `/task/i` section has items, `parseSubtasks` falls back
to "every checklist item in the file" — but criteria-section items are never
part of that fallback.

**Acceptance:**
- A change whose tasks.md contains ONLY a criteria section returns zero
  subtasks and does not throw
- A change with a criteria section plus non-criteria items outside any task
  section returns the non-criteria items via the fallback

**Dependencies:** REQ-001
**Complexity:** S
**Value:** HIGH

---

## REQ-004 — Nested sub-headings inherit their parent section

**Statement:** a `###`-level sub-heading belongs to the section opened by the
enclosing `##` heading; it does not reset section state. A new section starts
only at a heading of the same or higher level.

**Acceptance:**
- Items under `### Phase 1` / `### Phase 2` inside `## Implementation Tasks`
  are all collected (the real business-os shape), with checked state preserved
- Items under a sub-heading of a non-task section (e.g. `## Prerequisites`)
  remain excluded
- `parseSubtasks` on the real `openspec/changes/business-os/tasks.md` returns
  exactly the file's `T-xxx` implementation items and none of the
  `## Completion Criteria` phrases

**Dependencies:** REQ-001
**Complexity:** S
**Value:** HIGH