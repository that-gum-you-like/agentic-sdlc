# Spec: command-center-visibility

**Date**: 2026-07-06
**Author**: Fable (claude-fable-5) with Bryce
**Status**: specs
**Capability**: EXTENDS command-center (command-center-bridge)

---

## Overview

Extend the command-center bridge so the Hermes dashboard catalogs every
OpenSpec change (readable + approvable), every change's tasks.md sub-tasks as
child cards, the BACKLOG.md ideas, and recent agent/job run history — one
idempotent orchestrator run by the existing 15-minute timer.

---

### REQ-001: OpenSpec change cards

**Statement:** The system shall provide `agents/command-center-sync.mjs sync`
that upserts one kanban card per non-archived `openspec/changes/<name>/`
directory, keyed `--idempotency-key openspec:<name>`, whose body includes a
proposal excerpt (Problem + Value Analysis), the current phase, how to read
the full change (`openspec show <name>` + file path), and how to approve it.

**Acceptance Criteria:**
- [ ] Every dir under `openspec/changes/` except `archive/` yields exactly one card; re-running creates no duplicates
- [ ] Card body names the phase from `status.json` and the `openspec show <name>` read path
- [ ] Lane follows phase: implement/verify → running (via `--initial-status running` at create), archive phase → done, earlier phases → default
- [ ] A phase transition detected between passes posts a comment `phase: <old> → <new>` on the card
- [ ] Zero npm dependencies; rule #9 `__isMainModule` CLI guard

**Dependencies:** none · **Complexity:** M · **Value:** Critical

---

### REQ-002: Sub-task cards with parent→child structure

**Statement:** The system shall parse each synced change's `tasks.md` checklist
items and upsert each as a child card of the change card via `--parent`, keyed
`subtask:<change>:<n>`, with checked items completed.

**Acceptance Criteria:**
- [ ] Each `- [ ]`/`- [x]` item under a `/task/i` heading becomes a card created with `--parent <change-card-id>`
- [ ] Checked items end in the `done` lane; unchecked items do not
- [ ] Re-sync creates no duplicate sub-cards (idempotency key includes change + ordinal)
- [ ] A tasks.md without a `/task/i` heading falls back to all checklist items

**Dependencies:** REQ-001 · **Complexity:** M · **Value:** Critical

---

### REQ-003: Backlog catalog

**Statement:** The system shall upsert `openspec/BACKLOG.md` "Remaining Ideas"
(`### <id>. <title>` headings) as child cards of a single "OpenSpec Backlog"
parent card, keyed `backlog:<id>`.

**Acceptance Criteria:**
- [ ] One parent card (`backlog:root`) exists; each idea is its child
- [ ] Ideas marked SHIPPED/COMPLETED in the heading end in `done`
- [ ] Rejected ideas (id starting `R-`) are not synced
- [ ] Re-running creates no duplicates

**Dependencies:** none · **Complexity:** S · **Value:** High

---

### REQ-004: Approval from the board

**Statement:** The system shall, on every `sync`, read each change card's
comments; a human comment matching `/^\s*(approved?|lgtm|ship it)\b/i` (author
≠ `sdlc-sync`) shall be recorded exactly once into `pm/approvals.json` and
stamped into the change's `status.json` as
`approved/approvedBy/approvedAt`, with a confirmation comment posted back.

**Acceptance Criteria:**
- [ ] An "approve" comment results in `status.json` gaining `approved: true` with author + timestamp, other fields preserved
- [ ] `pm/approvals.json` records `{change, kanbanId, approvedBy, approvedAt}`
- [ ] A second sync pass does not double-record or re-comment
- [ ] The sync's own confirmation comments (author `sdlc-sync`) never trigger detection
- [ ] Cards with no comments cause no writes

**Dependencies:** REQ-001 · **Complexity:** M · **Value:** Critical

---

### REQ-005: Run history

**Statement:** The system shall normalize `pm/cycle-history.json`,
`pm/pr-auto-review.log`, and `pm/drain-logs/*.log` into `pm/runs.json`
(newest-first, capped at 200) and surface each new run as a comment on a
single "Agent run history" card (`runs:root`), capped per pass.

**Acceptance Criteria:**
- [ ] `pm/runs.json` contains entries `{key, kind, ts, ok, detail}` from all three sources
- [ ] New runs appear as comments on the runs card; re-sync posts no duplicate comments (seen-run cursor in state)
- [ ] At most 20 run comments are posted per pass
- [ ] Missing/malformed ledger files degrade to "no entries", never throw

**Dependencies:** none · **Complexity:** M · **Value:** High

---

### REQ-006: Queue-task linking + composition

**Statement:** The system shall run the existing kanban-bridge sync and
agent-registry write in-process, and shall link queue-task cards to their
change card (`hermes kanban link`) when a task's tags or description name the
change; the scheduler template's kanban-sync job shall invoke the single
orchestrator command.

**Acceptance Criteria:**
- [ ] `command-center-sync.mjs sync` performs the kanban-bridge queue sync and writes `pm/agents.json` (no separate `&&` command needed)
- [ ] A queue task tagged with a change name is linked under that change card exactly once (state-tracked; link errors swallowed)
- [ ] `agents/templates/cron-schedule.json.template` kanban-sync `script` is a single `node` command invoking the orchestrator
- [ ] A failure in one sync section does not abort the remaining sections (partial results + nonzero-safe reporting)

**Dependencies:** REQ-001, REQ-002 · **Complexity:** M · **Value:** High
