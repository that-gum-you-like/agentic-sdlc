# Tasks: level-6-autonomous-activation

**Date**: 2026-05-21
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: tasks

---

## Overview

Two layers of work:

1. **Phase 1 (manual bootstrap, this session, Day 0)** — Claude + Bryce build the cron infrastructure, projects registry, and multi-project orchestrator manually. Phase 1 is NOT a seed task because the autonomous loop doesn't exist yet (chicken-and-egg).

2. **Phases 2-4 (autonomous, Days 1-3)** — Seed tasks the bots clear via the now-running queue drainer. `seed-queue-from-openspec.mjs` materializes these checkboxes into `tasks/queue/*.json` files every 15 min. Each task is atomic (<90 min for a Groq bot) and includes acceptance criteria + spec reference.

3. **Phase 5 (verification, Day 7)** — Human-driven: run maturity-assess, confirm Level 6, archive.

---

## Prerequisites

- [x] proposal.md approved
- [x] design.md written
- [x] specs/ written (4 capability spec files)
- [ ] GROQ_API_KEY exported in Bryce's shell env (verify before Phase 1 starts)
- [ ] `gh` CLI authenticated (`gh auth status`)
- [ ] Working tree clean before Phase 1 begins

---

## Work Stream Summary

| Stream | Agent | Tasks | Parallel With |
|---|---|---|---|
| Phase 1 Infrastructure | Claude (interactive, this session) | T-101..T-109 | None — bootstrap |
| Phase 2 Observability | sdlc-developer | T-201..T-210 | Phase 3, Phase 4 |
| Phase 3 Deployment | sdlc-developer | T-301..T-304 | Phase 2, Phase 4 |
| Phase 4 Testing | sdlc-reviewer | T-401..T-405 | Phase 2, Phase 3 (after the script lands) |
| Phase 5 Verification | Bryce (manual) | T-501..T-503 | None — final gate |

---

## Implementation Tasks

### Phase 1: Cron Infrastructure (Day 0, this session, manual)

Token budget for Phase 1: covered by Bryce's Max subscription via this Claude Code session.

- [ ] **T-101**: Create `agents/templates/systemd/` directory with 9 timer + 9 service template files
  - Files: `agents/templates/systemd/sdlc-*.service|.timer`
  - Spec: scheduled-self-improvement/REQ-002
  - Agent: Claude (interactive)
  - Complexity: M
  - Notes: All timers use `Persistent=true`. Off-minute scheduling per cadence table in spec.

- [ ] **T-102**: Implement `agents/cron-installer.sh` (install/uninstall/status/restart subcommands)
  - Files: `agents/cron-installer.sh`
  - Spec: scheduled-self-improvement/REQ-001, REQ-004
  - Agent: Claude (interactive)
  - Complexity: M
  - Notes: Substitutes `$AGENTIC_SDLC_HOME`. Reads templates, writes to `~/.config/systemd/user/`, runs `daemon-reload` + `enable --now`.

- [ ] **T-103**: Initial `projects.json` at repo root with agentic-sdlc enabled and linguaflow disabled
  - Files: `projects.json`
  - Spec: multi-project-orchestration/REQ-001, REQ-006
  - Agent: Claude (interactive)
  - Complexity: S

- [ ] **T-104**: Implement `agents/projects.mjs` CLI (list/enable/disable/add/remove/status)
  - Files: `agents/projects.mjs`
  - Spec: multi-project-orchestration/REQ-002
  - Agent: Claude (interactive)
  - Complexity: M

- [ ] **T-105**: Implement `agents/multi-project-orchestrator.mjs` (iteration, lock, debounce, isolation)
  - Files: `agents/multi-project-orchestrator.mjs`, `agents/orchestrator-cycles.json`
  - Spec: multi-project-orchestration/REQ-003, REQ-004, REQ-005, REQ-007, REQ-008
  - Agent: Claude (interactive)
  - Complexity: L
  - Notes: This is the heart of Phase 1. Lock at `~/.agentic-sdlc/orchestrator.lock`.

- [ ] **T-106**: Switch `budget.json.template` autonomous default to Groq Llama 3.3 70B fallback chain + add `cronTokenBudget` + autonomous-CTO billing guard
  - Files: `agents/budget.json.template`
  - Spec: scheduled-self-improvement/REQ-003
  - Agent: Claude (interactive)
  - Complexity: S
  - Notes:
    - Worker fallback chain: groq/llama-3.3-70b-versatile → gemini/gemini-2.0-flash → cerebras/llama-3.3-70b
    - `cronTokenBudget.dailyLimit: 200000`
    - CTO role: `model: "anthropic/claude-opus-4-7", autonomousFire: false` — CTO can only be invoked interactively. Per Bryce: "always Opus for top layer CEO leader."
    - multi-project-orchestrator + queue-drainer must respect `autonomousFire: false` (skip + log warning).

- [ ] **T-107**: Extend `setup.mjs` with `--install-timers` flag
  - Files: `setup.mjs`
  - Spec: scheduled-self-improvement/REQ-004
  - Agent: Claude (interactive)
  - Complexity: S

- [ ] **T-108**: Run `cron-installer.sh install` on Bryce's machine; verify 9 timers active
  - Verify: `systemctl --user list-timers sdlc-*` returns 9 entries with non-empty NEXT
  - Agent: Claude (interactive, via Bash)
  - Complexity: S
  - Notes: This is the moment the autonomous loop becomes real.

- [ ] **T-109**: Commit Phase 1, push, then trigger the first `seed-queue-from-openspec` manually so the queue is non-empty when the first scheduled tick fires
  - Command: `node agents/seed-queue-from-openspec.mjs && node agents/queue-drainer.mjs status`
  - Expected: tasks/queue/ contains entries for T-201..T-405
  - Agent: Claude (interactive)
  - Complexity: S

---

### Phase 2: Observability — close 3.0 → 5.0 (Days 1-3, autonomous)

- [ ] **T-201**: Create `agents/log.mjs` structured JSONL logger
  - Files: `agents/log.mjs`
  - Spec: structured-observability/REQ-001
  - Agent: sdlc-developer
  - Complexity: S (estimatedTokens: 20000)
  - Notes: Export `debug, info, warn, error, setCorrelationId`. Pure stdlib. Atomic appends. Auto-create `pm/logs/` dir.

- [ ] **T-202**: Tests for `agents/log.mjs` (concurrent writes, dir auto-creation, all 4 levels, correlation IDs)
  - Files: `tests/log.test.mjs`
  - Covers: structured-observability/REQ-001
  - Agent: sdlc-reviewer
  - Complexity: S (estimatedTokens: 3500)
  - Parallel: blocked-by T-201

- [ ] **T-203**: Instrument `queue-drainer.mjs`, `cycles/daily-review.mjs`, `cycles/weekly-review.mjs`
  - Files: `agents/queue-drainer.mjs`, `agents/cycles/daily-review.mjs`, `agents/cycles/weekly-review.mjs`
  - Spec: structured-observability/REQ-002
  - Agent: sdlc-developer
  - Complexity: S (estimatedTokens: 20000)
  - Parallel: blocked-by T-201

- [ ] **T-204**: Instrument `cost-tracker.mjs`, `notify.mjs`, `four-layer-validate.mjs`
  - Files: `agents/cost-tracker.mjs`, `agents/notify.mjs`, `agents/four-layer-validate.mjs`
  - Spec: structured-observability/REQ-002
  - Agent: sdlc-developer
  - Complexity: S (estimatedTokens: 20000)
  - Parallel: blocked-by T-201

- [ ] **T-205**: Instrument `capability-monitor.mjs`, `alignment-monitor.mjs`, `pattern-hunt.mjs`, `seed-queue-from-openspec.mjs`
  - Files: `agents/capability-monitor.mjs`, `agents/alignment-monitor.mjs`, `agents/pattern-hunt.mjs`, `agents/seed-queue-from-openspec.mjs`
  - Spec: structured-observability/REQ-002
  - Agent: sdlc-developer
  - Complexity: S (estimatedTokens: 20000)
  - Parallel: blocked-by T-201

- [ ] **T-206**: Create `agents/metrics.mjs` daily aggregator
  - Files: `agents/metrics.mjs`
  - Spec: structured-observability/REQ-003
  - Agent: sdlc-developer
  - Complexity: M (estimatedTokens: 20000)
  - Parallel: blocked-by T-203, T-204, T-205

- [ ] **T-207**: Tests for `agents/metrics.mjs` (yesterday aggregation, idempotency, log pruning)
  - Files: `tests/metrics.test.mjs`
  - Covers: structured-observability/REQ-003, REQ-005
  - Agent: sdlc-reviewer
  - Complexity: S (estimatedTokens: 3500)
  - Parallel: blocked-by T-206

- [ ] **T-208**: Drift alert surfacing — emit warn lines from capability-monitor + pattern-hunt; aggregate in metrics.mjs; notify when >3 in 24h for an agent
  - Files: `agents/capability-monitor.mjs`, `agents/pattern-hunt.mjs`, `agents/metrics.mjs`
  - Spec: structured-observability/REQ-004
  - Agent: sdlc-developer
  - Complexity: S (estimatedTokens: 20000)
  - Parallel: blocked-by T-205, T-206

- [ ] **T-209**: Log rotation pruning — delete `pm/logs/*.jsonl` older than 30 days in metrics.mjs
  - Files: `agents/metrics.mjs`
  - Spec: structured-observability/REQ-005
  - Agent: sdlc-developer
  - Complexity: S (estimatedTokens: 3500)
  - Parallel: blocked-by T-206

- [ ] **T-210**: Add "Cron Health" section to pm/DASHBOARD.md via `cycles/daily-review.mjs`
  - Files: `agents/cycles/daily-review.mjs`
  - Spec: structured-observability/REQ-006
  - Agent: sdlc-developer
  - Complexity: S (estimatedTokens: 20000)
  - Parallel: blocked-by T-203

---

### Phase 3: Deployment — close 1.5 → 5.0 (Days 1-3, autonomous)

- [ ] **T-301**: Create `agents/release.mjs` semver bump + CHANGELOG.md generation
  - Files: `agents/release.mjs`, scaffolds initial `CHANGELOG.md`
  - Spec: framework-self-release/REQ-001, REQ-002
  - Agent: sdlc-developer
  - Complexity: M (estimatedTokens: 20000)

- [ ] **T-302**: Add commit/tag/push/gh release steps to `release.mjs`
  - Files: `agents/release.mjs`
  - Spec: framework-self-release/REQ-003
  - Agent: sdlc-developer
  - Complexity: M (estimatedTokens: 20000)
  - Parallel: blocked-by T-301

- [ ] **T-303**: Add `--dry-run` flag and pre-flight checks (clean tree, main branch, tests pass, gh auth)
  - Files: `agents/release.mjs`, `scripts/release.sh`
  - Spec: framework-self-release/REQ-004, REQ-005
  - Agent: sdlc-developer
  - Complexity: S (estimatedTokens: 20000)
  - Parallel: blocked-by T-302

- [ ] **T-304**: Tests for release.mjs (dry-run, pre-flight failures, first-release edge case)
  - Files: `tests/release.test.mjs`, `tests/release-pipeline.integration.test.mjs`
  - Covers: framework-self-release/REQ-001..005
  - Agent: sdlc-reviewer
  - Complexity: M (estimatedTokens: 20000)
  - Parallel: blocked-by T-303

---

### Phase 4: Testing — close 3.5 → 5.0 (Days 1-3, autonomous)

- [ ] **T-401**: Tests for `agents/projects.mjs` (list/enable/disable/add/remove/status)
  - Files: `tests/projects-cli.test.mjs`
  - Covers: multi-project-orchestration/REQ-002
  - Agent: sdlc-reviewer
  - Complexity: S (estimatedTokens: 3500)

- [ ] **T-402**: Tests for `agents/multi-project-orchestrator.mjs` including lock + debounce + isolation
  - Files: `tests/multi-project-orchestrator.test.mjs`, `tests/orchestrator-lock.test.mjs`
  - Covers: multi-project-orchestration/REQ-003, REQ-004, REQ-005, REQ-007
  - Agent: sdlc-reviewer
  - Complexity: M (estimatedTokens: 20000)

- [ ] **T-403**: Tests for `agents/cron-installer.sh` (idempotency + no-systemd)
  - Files: `tests/cron-installer.smoke.test.sh`, `tests/cron-installer.idempotent.test.sh`, `tests/cron-installer.no-systemd.test.sh`
  - Covers: scheduled-self-improvement/REQ-001
  - Agent: sdlc-reviewer
  - Complexity: S (estimatedTokens: 3500)

- [ ] **T-404**: Tests for `agents/seed-queue-from-openspec.mjs` idempotency
  - Files: `tests/seed-queue-idempotency.test.mjs`
  - Covers: scheduled-self-improvement (indirect)
  - Agent: sdlc-reviewer
  - Complexity: S (estimatedTokens: 3500)

- [ ] **T-405**: Audit existing test coverage; add missing tests until test/src ratio ≥ 1.0
  - Files: various `tests/*.test.mjs`
  - Covers: testing-quality maturity dimension
  - Agent: sdlc-reviewer
  - Complexity: L (estimatedTokens: 35000)
  - Parallel: blocked-by T-202, T-207, T-304, T-401, T-402, T-403, T-404
  - Notes: Final test ratio gate. Run `find agents -name '*.mjs' | wc -l` vs `find tests -name '*.test.*' | wc -l`; aim for parity or better.

---

### Phase 5: Verification (Day 7, Bryce manual)

- [ ] **T-501**: Run `node agents/maturity-assess.mjs` and confirm 5.0 on every one of 8 dimensions
  - Command: `node agents/maturity-assess.mjs`
  - Expected: all 8 dimensions report 5.0/5.0
  - Agent: Bryce (manual)
  - Acceptance: Screenshot or paste of maturity-assess output committed to pm/MATURITY-V1.md

- [ ] **T-502**: Run `node agents/alignment-monitor.mjs --report` and verify zero drift alerts
  - Command: `node agents/alignment-monitor.mjs --report`
  - Expected: alignment score ≥95, no drift alerts
  - Agent: Bryce (manual)

- [ ] **T-503**: Archive `level-6-autonomous-activation` change
  - Command: `mv openspec/changes/level-6-autonomous-activation openspec/changes/archive/level-6-autonomous-activation`
  - Update: status.json to `complete`
  - Agent: Bryce (manual) or `/openspec-archive-change`
  - Acceptance: change appears in `openspec/changes/archive/`, no longer in `openspec/changes/`

---

## Completion Criteria

This change is complete when:

- [ ] All Phase 1 tasks (T-101..T-109) checked off (Day 0)
- [ ] All Phase 2-4 tasks (T-201..T-405) checked off (Days 1-3, autonomous)
- [ ] T-501 confirms 5.0 across all 8 maturity dimensions
- [ ] T-502 confirms zero drift alerts
- [ ] T-503 archives the change
- [ ] No regressions in existing test suite
- [ ] PM dashboard reflects current state
- [ ] WhatsApp notification to Bryce: "Level 6 online. <maturity output paste>"

---

## Notes

**Bot escalation policy:** If a seed task fails 3 attempts (per existing queue-drainer rule), the task is marked `blocked`. Bryce reviews blocked tasks in an interactive Claude session (Max-billed) — typically faster than letting Groq retry.

**Daily Bryce duties (Days 1-3):**
1. Open pm/DASHBOARD.md each morning
2. Review any blocked tasks — interactive Claude session resolves them
3. Drop new ideas into openspec/BACKLOG.md as they occur to you

**If everything hangs by Day 3:** the most likely cause is Groq rate-limiting OR a foundational bug in T-201 (log.mjs) propagating through all instrumented scripts. Diagnostic: `tail -100 pm/logs/<today>.jsonl | jq` (if log.mjs is broken, this file won't exist — diagnose log.mjs first).
