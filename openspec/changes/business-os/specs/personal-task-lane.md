# Specs — personal-task-lane

**Date**: 2026-09-02
**Author**: Claude (Opus 5) with Bryce
**Status**: specs

Covers the `kind` field, the drain filter, and Telegram capture — so code work
and life admin share one ledger and Telegram is the only place Bryce must look.

---

## REQ-001 — Tasks carry a `kind`, defaulting to `code` by absence

**Statement:** `tasks/queue/*.json` gains `kind` ∈ `{code, chore, note}`. An
**absent** `kind` is read as `code` everywhere. No existing task file is
migrated.

**Acceptance:**
- `agents/schemas/task.schema.json` accepts all three values and accepts absence
- The 13 existing task files validate unchanged
- A test asserts `kind` is not a required field
- An unrecognized `kind` value fails validation rather than defaulting

**Dependencies:** None
**Complexity:** S
**Value:** HIGH

---

## REQ-002 — The drain claims only code tasks

**Statement:** `agents/queue-drainer.mjs` claims a task only when its `kind` is
`code` or absent. `chore` and `note` items are never claimed, never assigned to
an agent, and never counted toward drain capacity.

**Acceptance:**
- Given a mixed queue, the drainer claims exactly the `code` and absent-`kind`
  tasks
- A queue containing only `chore`/`note` items produces a clean "nothing to
  drain" result, not an error and not an idle-spin
- `queue-drainer status` reports code and non-code counts separately
- Existing drainer tests pass unmodified

**Dependencies:** REQ-001
**Complexity:** S
**Value:** CRITICAL — a `chore` claimed by an LLM agent with a test gate is a
guaranteed failing task that blocks the queue.

---

## REQ-003 — Non-code items are capturable from Telegram

**Statement:** A `sdlc-inbox` Hermes skill lets Bryce dictate an item to
Telegram and have it written to `tasks/queue/` as a `chore` or `note`, against a
named project or the `personal` entry by default.

**Acceptance:**
- The skill file exists under `~/.hermes/skills/sdlc-inbox/`, sourced from
  `skills/` in the repo (matching how `sdlc-mission` shipped)
- A captured item is a schema-valid task file with `kind` set, a title, and the
  project it belongs to
- Capture requires no `files[]`, no `test_status`, and no `estimatedTokens`
- An item naming an unknown project is captured against `personal` with the
  original text preserved, rather than rejected

**Dependencies:** REQ-001, `portfolio-registry/REQ-005`
**Complexity:** M
**Value:** HIGH

---

## REQ-004 — Non-code items are visible on the board and in the heartbeat

**Statement:** `chore` and `note` items sync to the kanban like any other card,
and open counts appear in the daily heartbeat.

**Acceptance:**
- Sync creates cards for non-code items idempotently
- The card is visually distinguishable by kind (tag or title prefix)
- The heartbeat reports open `chore`/`note` counts
- Completing a non-code card reconciles back to the task file's `status`,
  consistent with the existing `--reconcile` behavior

**Dependencies:** REQ-003, `liveness-heartbeat/REQ-001`
**Complexity:** S
**Value:** MEDIUM

---

## Invariants

- A non-code task never enters an LLM agent's work queue.
- Absence of `kind` always means `code`; the default is never re-interpreted.
- The queue remains the single ledger — no parallel personal task store.

## Out of Scope

- Recurring reminders, calendars, or due-date scheduling.
- Natural-language date parsing.
- Any notion of a personal task the system completes on Bryce's behalf.
