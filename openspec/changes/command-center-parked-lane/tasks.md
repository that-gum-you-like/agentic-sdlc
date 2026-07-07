# Tasks: command-center-parked-lane

## Prerequisites

- [x] Verify `hermes kanban schedule` semantics (lanes it accepts, exit codes, reason-comment side effect)
- [x] Verify `hermes kanban archive` removes cards from `list` output from any lane

## Implementation Tasks

- [x] **T1 — parked marker**: `scanChanges()` exposes `parked`; `statusReport()` counts parked changes (REQ-001)
- [x] **T2 — parkCard/unparkCard helpers**: `parkedCards` state cache + live-lane guard; unpark only sync-parked cards (REQ-003, REQ-004)
- [x] **T3 — syncChanges parking**: parked target overrides phase mapping; `(Parked)` title + banner on create; schedule after create/lookup; unpark when flag removed (REQ-002)
- [x] **T4 — syncSubtasks parking**: unchecked items of a parked change scheduled next to parent; checked items still complete (REQ-002)
- [x] **T5 — deleted-change retirement**: vanish loop distinguishes `archive/` move (complete parent) from outright deletion (archive parent + sub-cards, purge state) (REQ-005)
- [x] **T6 — tests**: extend `tests/command-center-sync.test.mjs` — parked create/schedule set, non-parked untouched, idempotent re-run, un-park, deletion retirement, archive-move completion (REQ-001..005)
- [x] **T7 — park/remove the decided set**: `"parked": true` for competitive-roadmap + whatsapp-router-provider-swap; `git rm -r whatsapp-claude-code-bridge/`; level-6 untouched (REQ-006)
- [x] **T8 — docs**: Parked convention (`scheduled` lane = Parked; flag; un-park path) in `docs/hermes-backlog-bridge.md` (REQ-006)
- [x] **T9 — verify live**: run sync twice against the real board; confirm lane counts, 0 duplicates/redundant moves; `four-layer-validate.mjs` + existing suites green
