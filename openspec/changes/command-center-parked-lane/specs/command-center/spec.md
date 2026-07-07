# Spec: command-center-parked-lane

**Date**: 2026-07-06
**Author**: CTO-Opus (claude-opus-4-8[1m]) with Bryce
**Status**: specs
**Capability**: DELTA on command-center (extends command-center-visibility)

---

## Overview

Give the command-center board a Parked lane: OpenSpec changes flagged
`"parked": true` in `status.json` move (parent card + all sub-task cards) to
the kanban `scheduled` lane instead of `ready`/`todo`, reversibly and
idempotently. Deleted change directories retire their cards off the board
entirely.

---

### REQ-001: Parked marker on a change

**Statement:** The system shall treat an OpenSpec change as *parked* iff its
`openspec/changes/<name>/status.json` contains `"parked": true`, and
`scanChanges()` shall expose this as a boolean `parked` field on each change
descriptor.

**Acceptance Criteria:**
- [ ] `scanChanges()` returns `parked: true` for a change whose status.json has `"parked": true`
- [ ] Absent or falsy `parked` yields `parked: false` (all existing changes unaffected)
- [ ] `statusReport()` counts parked changes (`parked` field) without any mutating kanban call

**Dependencies:** none · **Complexity:** S · **Value:** High

**Scenario: flag read**
- GIVEN a change `delta` whose status.json contains `"parked": true`
- WHEN `scanChanges()` runs
- THEN the `delta` descriptor has `parked === true` and every other descriptor has `parked === false`

---

### REQ-002: Parked change cards land in the `scheduled` lane

**Statement:** The system shall place a parked change's parent card AND all of
its unchecked sub-task cards in the kanban `scheduled` lane via
`hermes kanban schedule <id> <reason>`, never in `ready`/`todo`; checked
sub-tasks shall continue to complete to `done`. New parent cards for parked
changes shall be titled `OpenSpec (Parked): <name>` with a PARKED banner in the
body; pre-existing cards shall receive the PARKED marker as the schedule-reason
comment.

**Acceptance Criteria:**
- [ ] Parent card of a parked change is scheduled (creation passes no `--initial-status`)
- [ ] New parked parent title is `OpenSpec (Parked): <name>`; body contains `PARKED`
- [ ] Every unchecked tasks.md item of a parked change is scheduled; none remains in todo
- [ ] Checked items of a parked change still `complete` to done and are NOT scheduled
- [ ] A non-parked change never receives a `schedule` call

**Dependencies:** REQ-001 · **Complexity:** M · **Value:** Critical

**Scenario: parking a change**
- GIVEN parked change `delta` with tasks `[ ] D1`, `[ ] D2`, `[x] D3`
- WHEN `fullSync()` runs
- THEN `schedule` is issued for the delta parent card, D1 and D2; `complete` for D3; and no schedule for any card of non-parked change `alpha`

---

### REQ-003: Idempotent parking (0 duplicates, 0 redundant moves)

**Statement:** The system shall re-run parking idempotently: a card already
scheduled (per the `parkedCards` state cache in `pm/command-center-links.json`
or the live board lane) shall not receive another `schedule` call, and re-runs
shall create no duplicate cards.

**Acceptance Criteria:**
- [ ] Second `fullSync()` pass issues zero `schedule` calls and zero `create` calls for parked cards
- [ ] `parkedCards` persists in `pm/command-center-links.json`
- [ ] A card whose live lane is already `scheduled` or `done` is never scheduled (schedule exits 1 on those lanes)

**Dependencies:** REQ-002 · **Complexity:** S · **Value:** High

**Scenario: re-run**
- GIVEN a completed first sync pass over a parked change
- WHEN `fullSync()` runs again with no source changes
- THEN the hermes call log contains no `schedule` and no parked-card `create` entries

---

### REQ-004: Un-park returns only sync-parked cards

**Statement:** The system shall, when a previously parked change loses its
`"parked": true` flag, `hermes kanban unblock` the cards it itself parked
(tracked in `parkedCards`) and drop them from the cache; cards scheduled by a
human and never recorded in `parkedCards` shall never be unblocked.

**Acceptance Criteria:**
- [ ] After removing the flag, the next pass unblocks the parent + previously parked sub-cards
- [ ] Cache entries are removed so a later re-park schedules again
- [ ] A scheduled card absent from `parkedCards` is never unblocked

**Dependencies:** REQ-002 · **Complexity:** S · **Value:** Medium

**Scenario: un-park**
- GIVEN parked-and-synced change `delta`, then `"parked": true` removed from its status.json
- WHEN `fullSync()` runs with the board showing delta's cards in `scheduled`
- THEN `unblock` is issued for the parent, D1 and D2 — and for no other card

---

### REQ-005: Deleted change directories retire their cards off the board

**Statement:** The system shall, when a synced change's directory vanishes,
(a) complete the parent card once if the change moved to
`openspec/changes/archive/<name>` (existing behavior), or (b) if the directory
was deleted outright, `hermes kanban archive` the parent card and every
`subtask:<name>:*` card and remove the change's entries from sync state.

**Acceptance Criteria:**
- [ ] Change moved to `archive/` → parent card completed once (unchanged)
- [ ] Change deleted → parent + all sub-task cards archived (off the board), any lane
- [ ] State entries (`changes`, `subtasks`, `phases`, caches) for the deleted change are removed
- [ ] Next pass issues zero further calls for the deleted change

**Dependencies:** none · **Complexity:** M · **Value:** High

**Scenario: outright deletion**
- GIVEN synced change `delta` with 3 sub-cards, whose directory is then deleted (not archived)
- WHEN `fullSync()` runs
- THEN `archive` is issued for the parent and all 3 sub-cards, and a further pass issues none

---

### REQ-006: Apply the board cleanup Bryce decided

**Statement:** The repository shall park `competitive-roadmap` and
`whatsapp-router-provider-swap` (`"parked": true` in their status.json), shall
delete `openspec/changes/whatsapp-claude-code-bridge/` entirely, and shall
leave `level-6-autonomous-activation` (and every other change) unparked.

**Acceptance Criteria:**
- [ ] Both parked changes' status.json carry `"parked": true` (router-swap gains a status.json)
- [ ] `whatsapp-claude-code-bridge/` no longer exists in the repo (git history preserves it)
- [ ] Live board after sync: both parked parents + their unchecked sub-cards in `scheduled`; whatsapp-claude-code-bridge cards gone; level-6 sub-tasks still in `todo`
- [ ] Parked convention documented in `docs/hermes-backlog-bridge.md`

**Dependencies:** REQ-002, REQ-005 · **Complexity:** S · **Value:** Critical
