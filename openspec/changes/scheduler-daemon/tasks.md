# Tasks: scheduler-daemon

**Date**: 2026-07-05
**Status**: implemented

---

## Prerequisites

- [x] proposal.md approved (incl. Value Analysis)
- [x] design.md written
- [x] specs written (live-scheduler)
- [x] Host has systemd user manager + linger enabled (`Linger=yes`)
- [x] Schedule template present (`agents/templates/cron-schedule.json.template`), incl. the 4 Hermes cron entries

---

## Implementation Tasks

- [x] **T-101**: `agents/scheduler-install.mjs` — `loadSchedule` + `selectJobs` gating
  - Complexity: M · Spec: REQ-001, REQ-003
- [x] **T-102**: `cronToOnCalendar` translator (wildcards, integers, step forms, DOW)
  - Complexity: M · Spec: REQ-002
- [x] **T-103**: `buildUnits` — oneshot service + persistent timer, absolute ExecStart, `sdlc-sched-` namespace
  - Complexity: M · Spec: REQ-004
- [x] **T-104**: CLI commands `list` / `install [--dry-run]` / `status` / `uninstall` + `__isMainModule` guard + capability logging
  - Complexity: M · Spec: REQ-001, REQ-004
- [x] **T-105**: `tests/scheduler-install.test.mjs` + wire into `npm test`
  - Complexity: M · Spec: REQ-001..REQ-004
- [x] **T-106**: Docs — `script-reference.md` row + `iteration-cycles.md` "activate the schedule" section pointing at the installer
  - Complexity: S · Spec: REQ-001

## Verification

- [x] **T-201**: `node tests/scheduler-install.test.mjs` green (5/5); full `npm test` green
- [x] **T-202**: `four-layer-validate` Layer-5 import-guard scan clean (importing scheduler-install triggers no side effects)
- [x] **T-203**: Every OnCalendar validated by `systemd-analyze calendar` (correct next-elapse)
- [x] **T-204**: `install` → `systemctl --user list-timers 'sdlc-sched-*'` shows all 10 selected timers enabled; pre-existing `sdlc-update.timer` untouched
- [x] **T-205**: Manual `systemctl --user start sdlc-sched-health-check-daily.service` → `Result=success`, `ExecMainStatus=0`
- [x] **T-206**: `rag-indexer` scheduled job hardened separately (E2BIG→stdin, offline embeddings, lexical fallback) so the weekly run never hard-fails — see `hermes-integration` T-207

---

## Live install (this host, 2026-07-05)

10 timers enabled (`sdlc-sched-*`): daily-review, daily-cost-report, weekly-pattern-hunt, monthly-behavior-audit, backlog-review, model-manager-check, health-check-daily, red-team-weekly, rag-index-weekly, doc-sync-daily.
3 skipped: orchestration-sync (paperclip adapter inactive), dependency-audit + performance-check (agents not configured).
