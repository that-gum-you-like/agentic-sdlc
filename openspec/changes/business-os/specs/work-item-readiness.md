# Specs — work-item-readiness

**Date**: 2026-09-02
**Author**: Claude (Opus 5) with Bryce
**Status**: specs

Covers the lifecycle that decides **what the autonomous dev loop is allowed to
pick up**. Requested by Bryce 2026-09-02: "we should be able to essentially
create documentation / work items and mark them as ready for development and
the dev team mark them ready for review."

**Governing principle: writing something down is not authorizing it.** A change
existing in `openspec/changes/` must never be sufficient reason for an agent to
start building it.

---

## REQ-001 — Changes carry an explicit readiness state

**Statement:** `status.json` gains `readiness` ∈
`{draft, ready-for-dev, in-dev, ready-for-review, done}`. **Absent means
`draft`.** Authoring a proposal, design, or spec never implies readiness;
promotion to `ready-for-dev` is a deliberate act by Bryce.

**Acceptance:**
- Schema accepts the five values and accepts absence
- Absence resolves to `draft` in every consumer, asserted by test
- An unrecognized value fails validation rather than defaulting to anything
- `portfolio.mjs`-style CLI support: readiness can be set without hand-editing
  JSON

**Dependencies:** None
**Complexity:** S
**Value:** CRITICAL

---

## REQ-002 — The seeder only seeds `ready-for-dev`

**Statement:** `agents/seed-queue-from-openspec.mjs` seeds a change only when
`isSeedable(status)` **and** `readiness === 'ready-for-dev'`. The existing
phase/status gate is retained; readiness is an additional, narrowing condition.

**Acceptance:**
- A change in phase `tasks`/`implement` with `readiness` absent seeds **nothing**
- The same change with `readiness: "ready-for-dev"` seeds its open tasks
- `--dry-run` reports skipped changes with the reason `not-ready` distinctly
  from the existing phase-based skip reason
- Regression: the 9 changes currently in a seedable phase seed nothing until
  explicitly promoted

**Dependencies:** REQ-001
**Complexity:** S
**Value:** CRITICAL — without this, enabling the drain floods the queue with
~43 open tasks from `level-6-autonomous-activation` alone, plus seven other
changes that are out of scope for the current body of work.

---

## REQ-003 — The dev loop advances readiness as it works

**Statement:** The autonomous loop moves a change's readiness forward:
`ready-for-dev → in-dev` when its first task is claimed,
`in-dev → ready-for-review` when its tasks are complete and a PR is open, and
`ready-for-review → done` on merge. Transitions are recorded, never skipped.

**Acceptance:**
- Claiming the first task of a `ready-for-dev` change sets `in-dev`
- Completing the last open task with an open PR sets `ready-for-review`
- Merge sets `done`; a `done` change is no longer seedable
- An illegal transition (e.g. `draft → ready-for-review`) is refused and logged
- Transitions are idempotent — replaying one is a no-op, not an error

**Dependencies:** REQ-002
**Complexity:** M
**Value:** HIGH — this is what makes the board a status system rather than a
list, and it is what lets Bryce see "the dev team has this ready for review."

---

## REQ-004 — Readiness is visible and settable from the board and Telegram

**Statement:** A change's readiness appears on its command-center card, and can
be promoted from `draft` to `ready-for-dev` by Bryce without editing JSON.

**Acceptance:**
- `command-center-sync` renders readiness on the parent card for each change
- A `ready` comment on a change card promotes it, mirroring the existing
  `approve` comment mechanism in `command-center-sync.mjs`
- Promotion is recorded in `status.json` and survives the next sync
- Only promotion to `ready-for-dev` is exposed this way; `in-dev` and
  `ready-for-review` are set by the loop, not by hand

**Dependencies:** REQ-003
**Complexity:** M
**Value:** MEDIUM

---

## REQ-005 — Out-of-scope work is parked, explicitly and reversibly

**Statement:** Every change not part of the current body of work is set to
`readiness: draft` with a one-line note recording why, so the drain cannot pick
it up and a human can see the intent.

**Acceptance:**
- All eight currently-seedable out-of-scope changes are `draft`:
  `auto-review-merge`, `autonomous-deploy-pipeline`, `command-center-bridge`,
  `level-6-autonomous-activation`, `operator-desktop-launcher`,
  `pilot-autonomous-replication`, `replay-regression-ci-gate`,
  `telegram-activation`
- `business-os` is the only change at `ready-for-dev`
- A dry-run seed after parking reports exactly the `business-os` tasks
- Parking is a data change only — no change is deleted, archived, or rewritten

**Dependencies:** REQ-002
**Complexity:** S
**Value:** CRITICAL

---

## Invariants

- Absent readiness always means `draft`. The default is never permissive.
- Readiness is orthogonal to phase: a change can be phase `tasks` and still
  `draft`. Phase describes authorship progress; readiness describes
  authorization.
- No agent ever promotes a change to `ready-for-dev`; only Bryce does.
- Parking never destroys work.

## Out of Scope

- Priority ordering or scheduling within `ready-for-dev`.
- Per-task readiness (the unit of authorization is the change).
- Estimation, story points, or velocity.
