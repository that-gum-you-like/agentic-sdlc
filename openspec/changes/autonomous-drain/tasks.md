# Tasks: autonomous-drain

**Date**: 2026-07-05
**Status**: implemented

---

## Prerequisites
- [x] proposal.md approved (incl. Value Analysis)
- [x] design.md written
- [x] specs written (autonomous-drain)
- [x] OpenRouter routing live (change `openrouter-provider`); `gh` authed on host
- [x] Verified a separate HERMES_HOME profile persists to the host repo

## Implementation Tasks
- [x] **T-101**: `~/.hermes-drain/` isolated profile (OpenRouter ladder, `terminal.backend: local`, no gateway, `.env`)
  - Complexity: S · Spec: REQ-001
- [x] **T-102**: `agents/hermes-drain.sh` — lock, main-only, clean-tree, cost-gate, PR-cap, isolated invocation, `--dry-run`
  - Complexity: M · Spec: REQ-002
- [x] **T-103**: `agents/drain-prompt.md` — one-task / branch / test / PR-gate / hard prohibitions
  - Complexity: M · Spec: REQ-003
- [x] **T-104**: `autonomous-drain` entry in `cron-schedule.json.template`
  - Complexity: S · Spec: REQ-004
- [x] **T-105**: `tests/hermes-drain.test.mjs` + wire into `npm test`
  - Complexity: M · Spec: REQ-002, REQ-003
- [x] **T-106**: Install the timer via `scheduler-install.mjs`; document the profile in BACKLOG/memory
  - Complexity: S · Spec: REQ-004

## Verification
- [x] **T-201**: `npm test` green incl. new drain suite (4/4)
- [x] **T-202**: `hermes-drain.sh` on a non-`main` branch is a safe no-op (skips, no LLM call)
- [x] **T-203**: Isolated profile persists to host repo (`pwd=/home/bryce/agentic-sdlc`, file landed on host)
- [x] **T-204**: `scheduler-install.mjs list` shows `sdlc-sched-autonomous-drain` with correct `OnCalendar` + absolute `ExecStart`
- [x] **T-205**: `four-layer-validate` CLI-guard clean

## Notes
- The queue is currently empty, so the timer is a no-op until tasks are added — safe to enable now.
- Removes the "Automated Hermes drain cron" deferral in BACKLOG (now implemented safely via the isolated profile).
- Future hardening (optional): git-worktree isolation so the drain can run even while the main tree is on a feature branch; per-task budget cap; auto-close superseded drain PRs.
