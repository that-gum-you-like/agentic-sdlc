# Design: command-center-bridge

**Date**: 2026-07-06
**Author**: CTO-Opus (claude-opus-4-8[1m]) with Bryce
**Status**: design

---

## Overview

Make the already-running `hermes dashboard` show the real SDLC backlog and agents
by syncing the file-based ledger into the Hermes SQLite kanban the UI reads. Two
small, tested, zero-dep Node scripts plus optional cycle wiring.

## Architecture

```
tasks/queue/*.json ──►  kanban-bridge.mjs  ──►  hermes kanban  ──►  kanban.db ──► dashboard
      (SDLC ledger)      (idempotent upsert)     (CLI, dedup)      (UI store)     (web UI)
                              ▲   │ --reconcile (status only)
                              └───┘  reflect done/blocked back into task JSON

budget.json + cost ledger ──► agent-registry.mjs ──► pm/agents.json ──► dashboard "agents" view
```

## Key decisions

1. **Shell out to `hermes kanban`, do not touch `kanban.db` directly.** The CLI
   is the supported, stable contract; writing SQLite directly would couple us to
   Hermes' internal schema. Trade-off: one subprocess per task — fine at this
   scale (tens of tasks), and `--json` gives us the created id.
2. **Idempotency via `--idempotency-key <task.id>`.** The SDLC task id is the
   stable natural key. Re-running the bridge every drain tick returns existing
   ids instead of duplicating — the whole sync is safe to run on a timer.
3. **Status is the only thing reconciled in reverse.** `--reconcile` maps kanban
   `done`/`blocked` back to task JSON `status`, never edits titles/descriptions/
   deletes. Keeps the file ledger authoritative for content, the board
   authoritative for lane state a human sets by clicking.
4. **Status mapping** — single source of truth in one function:
   `pending|ready → todo`, `in_progress → running`, `blocked → blocked`,
   `completed → done`.
5. **Agents surfaced as a derived artifact (`pm/agents.json`), not a new store.**
   Read `budget.json` + the cost ledger, emit a normalized snapshot. Cheap to
   regenerate; nothing else has to change.
6. **Cycle wiring is opt-in.** A documented `sdlc-sched-kanban-sync` timer (or a
   step in the drain) — off by default so the bridge never surprises an existing
   deployment.

## Data flow / mapping

| SDLC task field | Kanban create arg |
|---|---|
| `id` | `--idempotency-key` |
| `title` | positional `title` |
| `description` | `--body` |
| `assignee` | `--assignee` |
| `priority` (HIGH/MED/LOW) | `--priority` |
| `status` | initial lane + post-create reconcile verb |

## Non-goals

- Telegram activation, GitHub write (token-blocked, separate changes).
- Salvage scrub/lift of the recovered sandbox files (separate change).
- Real-time push; a periodic sync (timer/tick) is sufficient.
- Rewriting the queue-drainer or how work is assigned.

## Risks

- **Kanban assignee names may not match SDLC agent names** → pass through as-is;
  unknown assignees still create valid cards (assignee is advisory).
- **`hermes kanban` interface drift** → isolate all CLI calls behind one wrapper
  function so a future interface change is a one-place fix; test parses `--json`.
