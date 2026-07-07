# Proposal: command-center-parked-lane

**Date**: 2026-07-06
**Author**: CTO-Opus (claude-opus-4-8[1m]) with Bryce
**Status**: proposed

---

## Problem

The command-center kanban board's **Todo lane holds 145 cards** — every unchecked
`- [ ]` item from every OpenSpec change's `tasks.md`, synced by
`agents/command-center-sync.mjs`. A large share of those come from changes that
are deliberately deferred (parked/aspirational), so Todo is not a clean
"what's actually left" list. There is no way to defer a change without either
deleting it (loses the spec) or letting its tasks pollute the active lane.

Separately, `whatsapp-claude-code-bridge` no longer belongs in the framework at
all (Bryce handles the WhatsApp↔Claude Code bridge through Hermes) — but when a
change directory is deleted outright, the sync today only *completes* the parent
card, stranding its unchecked sub-task cards in Todo forever.

## Discovery

- Hermes kanban lanes are **fixed** (`triage · todo · scheduled · ready ·
  running · blocked · done`) — a new "Parked" lane cannot be added. The
  `scheduled` lane is currently empty and semantically "parked, waiting on
  time, not human input" (`hermes kanban schedule --help`; `schedule_task` in
  `kanban_db.py`). It is the natural Parked lane.
- `hermes kanban schedule <id> [reason]` moves a card from
  `todo/ready/running/blocked` → `scheduled` and appends the reason as a
  `SCHEDULED: <reason>` comment. It **fails (exit 1) on an already-scheduled or
  done card**, so the sync must never issue redundant schedule calls.
- `hermes kanban unblock <id>` returns a `blocked`/`scheduled` card to
  `ready` (or `todo` if parents are incomplete) — the un-park path.
- `hermes kanban archive <id>` works from any non-archived lane and archived
  cards disappear from `hermes kanban list` — the removal path.

## Proposed Solution

1. **Parked marker**: a change is parked iff its `status.json` contains
   `"parked": true`. Nothing else changes about the change — spec, design and
   tasks stay in the repo.
2. **Sync behavior** (`agents/command-center-sync.mjs`): a parked change's
   parent card AND all its sub-task cards land in the `scheduled` lane (the
   board's Parked lane). Unchecked tasks of a parked change never sit in Todo.
   New parent cards are titled `OpenSpec (Parked): <name>`; pre-existing cards
   get an unmistakable `SCHEDULED: PARKED — …` comment via the schedule reason.
   Fully idempotent: re-runs create 0 duplicates and issue 0 redundant lane
   moves (guarded by a `parkedCards` state cache + live-lane check).
3. **Un-park**: removing `"parked": true` makes the next sync pass `unblock`
   the cards this sync previously parked (never cards a human scheduled).
4. **Removed change**: when a change directory vanishes and is NOT in
   `openspec/changes/archive/`, the sync `archive`s its parent card and every
   sub-task card off the board (previous behavior — complete the parent only —
   is kept for properly archived changes).
5. **Apply now**: park `competitive-roadmap` and `whatsapp-router-provider-swap`;
   remove `openspec/changes/whatsapp-claude-code-bridge/` entirely
   (git history preserves it). `level-6-autonomous-activation` stays active in
   Todo — its unchecked tasks ARE the Level 6 maturity backlog.

## Value Analysis

- **Signal restored**: Todo drops from 145 to roughly the set of tasks Bryce
  actually intends to execute; deferred work stays visible in one dedicated
  lane instead of vanishing or polluting the active list.
- **Reversible**: parking is one status.json flag; un-parking is deleting it.
  No spec content is lost.
- **Board hygiene**: deleted changes no longer strand orphan sub-task cards in
  Todo — the one currently-broken lifecycle path gets closed.
- **Cost**: ~60 lines in one existing script + tests; zero new dependencies;
  no new schema, no new lane, no Hermes changes.

## Risks

- `scheduled` lane is repurposed; if Hermes automation ever auto-dispatches
  scheduled cards, parked cards could wake up. Mitigated: Hermes documents
  `scheduled` as "intentionally not dispatchable".
- Un-park uses `unblock`, which re-gates to ready/todo per dependency state —
  cards may return to a different lane than they left. Acceptable: the sync's
  normal lane logic re-converges on the next pass.
