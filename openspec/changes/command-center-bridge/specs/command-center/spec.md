# Spec: command-center-bridge

**Date**: 2026-07-06
**Author**: CTO-Opus (claude-opus-4-8[1m]) with Bryce
**Status**: specs
**Capability**: NEW

---

## Overview

Sync the SDLC file-based backlog and agent registry into the Hermes kanban board
that the web dashboard reads, so the command center shows real work. Idempotent,
zero-dep, tested. Realizes the "one ledger, many interfaces" design in
`docs/hermes-backlog-bridge.md`.

---

### REQ-001: Idempotent backlog sync

**Statement:** The system shall provide `agents/kanban-bridge.mjs sync` that reads
every `tasks/queue/*.json` (and `tasks/completed/*.json` if present) and upserts
each task into the Hermes kanban via `hermes kanban create` using the SDLC task
`id` as `--idempotency-key`.

**Acceptance Criteria:**
- [ ] Each task becomes exactly one kanban card; re-running creates no duplicates
- [ ] `title→title`, `description→--body`, `assignee→--assignee`, `priority→--priority`
- [ ] The created/returned kanban id is parsed from `--json` output and cached to
      a link map (`pm/kanban-links.json`) keyed by SDLC id
- [ ] Zero npm dependencies (stdlib only; shells out to `hermes kanban`)
- [ ] `import`-ing the module triggers no CLI side effects (rule #9 `__isMainModule` guard)

**Dependencies:** none · **Complexity:** M · **Value:** Critical

---

### REQ-002: Status reconciliation (forward)

**Statement:** The system shall set each synced card's lane to match SDLC
`status` using the mapping `pending|ready→todo`, `in_progress→running`,
`blocked→blocked`, `completed→done`.

**Acceptance Criteria:**
- [ ] A `completed` SDLC task ends in the kanban `done` lane
- [ ] A `blocked` SDLC task ends in the `blocked` lane
- [ ] Mapping lives in one exported pure function `mapStatus(sdlcStatus)`
- [ ] Re-sync of an unchanged task issues no redundant lane change

**Dependencies:** REQ-001 · **Complexity:** S · **Value:** High

---

### REQ-003: Status reconciliation (reverse, opt-in)

**Statement:** The system shall, under `kanban-bridge.mjs sync --reconcile`,
reflect kanban `done`/`blocked` lane changes back into the corresponding task
JSON `status`, and shall never modify task content or delete tasks.

**Acceptance Criteria:**
- [ ] A card moved to `done` in the UI sets its task JSON `status` to `completed`
- [ ] Only `status` (and `completed_at` when transitioning to done) is written
- [ ] Without `--reconcile`, task JSON files are never modified
- [ ] Unknown/unlinked cards are ignored, not errored

**Dependencies:** REQ-001 · **Complexity:** M · **Value:** Medium

---

### REQ-004: Agent surfacing

**Statement:** The system shall provide `agents/agent-registry.mjs` that emits
`pm/agents.json` — a normalized snapshot of each agent from `budget.json`
(`name, model, permissions, dailyTokens, activeModel`) enriched with today's
spend from the cost ledger when available.

**Acceptance Criteria:**
- [ ] `pm/agents.json` lists all `budget.json` agents with the fields above
- [ ] Missing cost data degrades to `spentToday: 0`, never throws
- [ ] Valid JSON; regenerating is idempotent
- [ ] CLI-guarded (rule #9)

**Dependencies:** none · **Complexity:** S · **Value:** High

---

### REQ-005: Dry-run status report

**Statement:** The system shall provide `kanban-bridge.mjs status` that prints,
without mutating anything, how many tasks would be created / updated / already in
sync.

**Acceptance Criteria:**
- [ ] `status` performs no `hermes kanban create/complete/block` calls
- [ ] Output shows per-lane counts and a to-create / to-update tally
- [ ] Exit code 0 on success

**Dependencies:** REQ-001 · **Complexity:** S · **Value:** Medium

---

## Acceptance Criteria (Scenarios)

### Scenario 1: First sync populates the empty board

**Verifies:** REQ-001, REQ-002

**WHEN** the kanban board is empty and `node agents/kanban-bridge.mjs sync` runs
against the 13 current tasks

**THEN** the board contains 13 cards with correct lanes (completed→done)

**AND** `pm/kanban-links.json` maps each SDLC id to its kanban id

---

### Scenario 2: Re-sync is idempotent

**Verifies:** REQ-001

**WHEN** `sync` runs a second time with no task changes

**THEN** no new cards are created (idempotency-key dedup)

**AND** the card count is unchanged

---

### Scenario 3: Reverse reconcile updates the ledger

**Verifies:** REQ-003

**WHEN** a card is moved to `done` in the dashboard and `sync --reconcile` runs

**THEN** the corresponding `tasks/queue/<id>.json` `status` becomes `completed`

**AND** no other field in the task JSON is changed

---

### Scenario 4: Error case — Hermes CLI unavailable

**Verifies:** REQ-001

**WHEN** the `hermes` binary is not found on PATH during `sync`

**THEN** the bridge exits non-zero with a clear message naming the missing binary

**AND** no task JSON files are modified

---

### Scenario 5: Edge case — task with no assignee/priority

**Verifies:** REQ-001

**WHEN** a task JSON omits `assignee` or `priority`

**THEN** the card is still created (those flags omitted) without error

---

## Invariants

- Re-running `sync` any number of times converges to the same board state.
- Task JSON content (title, description, files, tags) is never mutated by the bridge.
- No npm dependencies are added; all embedding/CLI work is local.

## Out of Scope

- Telegram and GitHub-write activation (token-blocked sibling changes).
- Real-time/event-driven push (periodic sync only).

## Test Mapping

| Scenario | Test File | Test Name |
|----------|-----------|-----------|
| Scenario 1 | `tests/kanban-bridge.test.mjs` | first sync maps status to lanes |
| Scenario 2 | `tests/kanban-bridge.test.mjs` | re-sync creates no duplicates |
| Scenario 3 | `tests/kanban-bridge.test.mjs` | reconcile writes only status |
| Scenario 4 | `tests/kanban-bridge.test.mjs` | missing hermes binary fails clean |
| Scenario 5 | `tests/kanban-bridge.test.mjs` | task without assignee still syncs |

---

## Next Step

Proceed to tasks phase.
