# Design: command-center-parked-lane

**Date**: 2026-07-06
**Change**: command-center-parked-lane

---

## Decisions

### D1 — `scheduled` lane IS the Parked lane
Hermes lanes are fixed; `scheduled` is empty and semantically "waiting on time,
not human input" — exactly what parked means here. Documented in
`docs/hermes-backlog-bridge.md` so the convention is discoverable.

### D2 — Parked marker lives in `status.json`
`"parked": true` — one flag, versioned with the change, no new files.
`scanChanges()` surfaces it as `parked: !!status.parked` on each descriptor.

### D3 — Park overrides phase mapping
In `syncChanges()`, a parked change targets
`{ lane: 'scheduled', verb: 'schedule' }` regardless of phase. Card creation for
a parked change never passes `--initial-status`; the card is scheduled right
after creation. Title at creation: `OpenSpec (Parked): <name>`; body carries a
`📦 PARKED` banner. Cards created before the change was parked keep their title
but receive `SCHEDULED: PARKED — …` as an on-card comment (free side effect of
the `schedule <id> <reason>` verb).

### D4 — Sub-task cards: unchecked → scheduled, checked → done
`syncSubtasks()`: for a parked change, unchecked items are parked next to the
parent; checked items keep completing to `done` (finished work stays finished —
`schedule` would fail on a done card anyway).

### D5 — Idempotency: `state.parkedCards` + live-lane check
`hermes kanban schedule` exits 1 on an already-scheduled card, so `parkCard()`
skips when (a) the card id is in the `parkedCards` state cache (mirrors the
existing `completedCards` pattern — avoids re-spawning the CLI every 15-min
pass) or (b) the live board already shows the card in `scheduled`/`done`.

### D6 — Un-park is symmetric and conservative
`unparkCard()` only acts on cards recorded in `parkedCards` — a card a human
manually scheduled is never touched. It removes the cache entry and, if the
card is still in `scheduled`, issues `hermes kanban unblock` (Hermes re-gates
to ready/todo by dependency state).

### D7 — Vanished change: archive/ ⇒ complete, deleted ⇒ board-archive
The existing vanish loop distinguishes the two cases by
`fs.existsSync(openspec/changes/archive/<name>)`:
- **archived**: parent card completed once (unchanged behavior).
- **deleted**: parent + every `subtask:<name>:*` card `hermes kanban archive`d
  (any lane → gone from the board), then all state entries for the change are
  dropped so the pass is naturally idempotent.

## Alternatives rejected

- **`blocked` lane for parked** — semantically wrong ("waiting on human input")
  and already used by real blockers.
- **Skip syncing parked changes entirely** — cards would go stale on the board
  rather than move; parked work would be invisible, which is the problem
  parking is meant to avoid.
- **Delete + BACKLOG.md entry instead of parking** — loses the written
  proposal/design/specs; parking is reversible by design.
