# Proposal: command-center-bridge

**Date**: 2026-07-06
**Author**: CTO-Opus (claude-opus-4-8[1m]) with Bryce
**Status**: proposed

---

## Problem

Bryce wants an **agent command center** — click in, see and manage the backlog
and agents — reachable four ways over one shared body of work (web dashboard,
Hermes CLI, Telegram, Claude Code). The web UI already exists and runs
(`hermes dashboard`, verified serving HTTP 200), but it renders an **empty
board**: the dashboard reads Hermes' SQLite kanban (`kanban.db`), while the SDLC
backlog lives in the file-based queue (`tasks/queue/*.json`) and OpenSpec
changes. The two never sync.

The `docs/hermes-backlog-bridge.md` design names the "three runtimes, one ledger"
principle but there is **no bridge implementation** — no script moves SDLC work
into the board the UI shows. Until one exists, the command center's core promise
("click in and see the backlog + agents") is unmet.

## Discovery

- **SDLC task schema** (`tasks/queue/*.json`): `{ id, title, description,
  assignee, priority, status (pending|in_progress|blocked|completed),
  test_status, blockedBy[], tags[], ... }`.
- **Hermes kanban CLI** supports upsert-friendly creation:
  `hermes kanban create <title> --body --assignee --priority
  --idempotency-key <key> --initial-status {blocked,running} --json` returns the
  task id; **`--idempotency-key` dedupes** (existing non-archived task with the
  key is returned, not duplicated) — ideal for re-runnable sync keyed on the
  SDLC task id. Lifecycle verbs exist to reconcile status:
  `complete`, `block`, `unblock`, `assign`, `comment`, `archive`.
- **Kanban lanes**: `triage · todo · scheduled · ready · running · blocked ·
  done`. SDLC status maps cleanly: `pending→todo`, `in_progress→running`,
  `blocked→blocked`, `completed→done`.
- **Agents** are defined in `budget.json` (model, permissions, daily budget);
  the dashboard can surface them once written where it reads assignees/agents.
- **Constraints:** zero npm deps; privacy-first; every script tested; must be
  idempotent (safe to run every drain tick).

## Proposed Solution

A tested, idempotent **backlog bridge** plus **agent surfacing**, so the running
dashboard fills with real work:

1. **`agents/kanban-bridge.mjs`** — reads every `tasks/queue/*.json` (and
   `tasks/completed/` if present), upserts each into Hermes kanban via
   `hermes kanban create --idempotency-key <task.id> --json`, then reconciles
   lane to match SDLC `status` (`completed→complete`, `blocked→block`,
   `in_progress→running`, else `todo`). Maps `assignee`, `priority`, and
   `description→--body`. Re-running never duplicates. CLI-guarded per rule #9.
   Modes: `sync` (default), `status` (dry-run diff report), `--once`.
2. **Reverse status read (best-effort)** — a `--reconcile` flag reflects kanban
   `done`/`blocked` changes back into the SDLC task JSON `status`, so managing a
   card in the UI updates the ledger. Conservative: only status transitions,
   never destructive.
3. **Agent surfacing** — `agents/agent-registry.mjs` emits a normalized
   `pm/agents.json` (name, model, permissions, dailyTokens, activeModel,
   today's spend from the cost ledger) that the dashboard/UX and `hermes kanban
   assignees` can present, so "see the agents" is answered from one file.
4. **Wire into the cycle** — an optional bridge step in the drain / a
   `sdlc-sched-kanban-sync` timer keeps the board live; documented, opt-in.
5. **Verify** — run the bridge against the current 13 tasks, launch
   `hermes dashboard`, confirm the board and agents populate; unit + idempotency
   tests pass; `openspec validate --strict` passes.

Out of scope (tracked separately): Telegram activation (`hermes-github-write-access`
sibling, token-blocked), GitHub write, and the sandbox salvage scrub.

## Value Analysis

- **Delivers the command center's core promise** — the existing web UI stops
  being empty; Bryce can click in and see/manage the real backlog + agents.
- **Unifies the "one ledger" across four interfaces** — CLI, dashboard,
  Telegram, and Claude Code all read/write the same work, exactly as
  `hermes-backlog-bridge.md` intends.
- **Idempotent and safe** — keyed on task id, re-runnable every tick, no
  duplicates, status-only reconciliation.
- **Zero deps, privacy-first, fully tested** — shells out to the existing Hermes
  CLI; no new services.
- **Cost:** M. Two tested scripts + cycle wiring + docs + verification. Risk low;
  additive, no changes to how the queue-drainer assigns work.
