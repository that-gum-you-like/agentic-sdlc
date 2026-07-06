# Tasks: command-center-bridge

**Date**: 2026-07-06
**Author**: CTO-Opus (claude-opus-4-8[1m]) with Bryce
**Status**: tasks

---

## Overview

Build the tested, idempotent backlog bridge and agent surfacing so the running
`hermes dashboard` shows the real SDLC backlog + agents. See design.md and
specs/command-center/spec.md.

## Prerequisites

- [x] Design approved
- [x] Specs written
- [x] Hermes kanban CLI interface confirmed (`create --idempotency-key --json`)
- [x] SDLC task schema confirmed

## Implementation Tasks

- [x] **T1 — CLI wrapper** (REQ-001): `runKanban(args)` shells out to
      `hermes kanban`, parses `--json`, fails clean on missing binary.
- [x] **T2 — status mapping** (REQ-002): exported pure `mapStatus(sdlcStatus)`.
- [x] **T3 — sync core** (REQ-001, REQ-002): upsert with `--idempotency-key`,
      lane reconcile, `pm/kanban-links.json` persisted.
- [x] **T4 — reverse reconcile** (REQ-003): `--reconcile` reflects `done`/
      `blocked` back to task JSON `status` only.
- [x] **T5 — dry-run report** (REQ-005): `status` mode, no mutations.
- [x] **T6 — agent registry** (REQ-004): `agents/agent-registry.mjs` →
      `pm/agents.json`.
- [x] **T7 — CLI guards** (rule #9): both `__isMainModule`-guarded;
      four-layer-validate confirms all 90 entry points guarded.
- [x] **T8 — tests** (Scenarios 1–5): `tests/kanban-bridge.test.mjs`, 13 tests,
      fake-hermes PATH shim, all pass.
- [x] **T9 — verify**: synced live 13 tasks → board populated (13 cards),
      idempotent re-run creates 0.
- [ ] **T10 — recurring sync (opt-in, needs go-ahead)**: install a
      `sdlc-sched-kanban-sync` timer (via `scheduler-install.mjs`) so the board
      stays live, not a one-time snapshot. Deferred: touches the live systemd
      scheduler — awaiting Bryce's go-ahead.

## Work Stream Summary

| Work Stream | Agent | Tasks | Parallel With |
|-------------|-------|-------|---------------|
| Bridge core | sdlc-developer | T1–T5, T7 | Agent registry |
| Agent registry | sdlc-developer | T6 | Bridge core |
| Tests | sdlc-developer | T8 | — (after core) |
| Verify + wire | sdlc-developer | T9–T10 | — (last) |

## Done Checklist (framework repo)

- [ ] openspec (this change)
- [ ] tests pass (unit + defeat + behavior)
- [ ] commit
- [ ] push
