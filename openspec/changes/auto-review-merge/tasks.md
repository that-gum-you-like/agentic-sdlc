# Tasks: auto-review-merge

**Date**: 2026-07-05
**Status**: in-progress

---

## Prerequisites
- [x] proposal.md approved (incl. Value Analysis)
- [x] design.md written
- [x] specs written (auto-review-merge)
- [x] PR #7 (H-001) merged — full suite hermetic + green on a clean checkout
- [x] `gh` authed on host; OpenRouter key present in the drain profile

## Implementation Tasks
- [x] **T-101**: `agents/pr-auto-review.mjs` — lock, reconcile pass, scope scan, clean-worktree hard gate, OpenRouter LLM review, merge + task-complete + JSONL log, per-SHA comment marker, `__isMainModule` guard
  - Complexity: M · Spec: REQ-001, REQ-002, REQ-003, REQ-004
- [x] **T-102**: `scheduler-install.mjs` — unit `PATH` includes node bin dir, resolved `gh` dir, `~/.local/bin`
  - Complexity: S · Spec: REQ-005
- [x] **T-103**: `pr-auto-review` entry in `cron-schedule.json.template` (`7,27,47 * * * *`)
  - Complexity: S · Spec: REQ-005
- [x] **T-104**: `tests/pr-auto-review.test.mjs` (pure functions + structural guards; auto-discovered by the `npm test` glob) + comma-list case in `tests/scheduler-install.test.mjs`
  - Complexity: M · Spec: REQ-001–REQ-005

## Verification
- [ ] **T-201**: `npm test` green in a fresh clean worktree (includes the new suite)
- [ ] **T-202**: `four-layer-validate` CLI-guard clean (importing pr-auto-review.mjs has no side effects)
- [ ] **T-203**: `scheduler-install.mjs install` renders `sdlc-sched-pr-auto-review.timer` with `OnCalendar=*-*-* *:7,27,47:00` and a unit PATH that resolves `gh` + `hermes`
- [ ] **T-204**: Live loop verified — drain timer re-enabled, drain opens a PR, pr-auto-review gates and (if safe+green) merges it, task marked complete

## Notes
- The npm test glob (`tests/*.test.mjs`) picks the new suite up automatically — no package.json edit needed.
- Guardrail-touching PRs are flagged, not merged: that includes PRs that edit this pipeline itself.
