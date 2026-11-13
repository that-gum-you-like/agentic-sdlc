# Tasks: curriculum-v2-conformance

**Date**: 2026-11-03
**Author**: Claude with Bryce
**Status**: tasks

---

## Overview

Implements `design.md` and the seven capability specs under `specs/`. Theme: **the parts exist; wire them onto the autonomous path.**
Every task extends a named existing file (exceptions are new template/test/skill files that the spec names). Node stdlib only, zero new npm
dependencies, no OpenAI, no Anthropic API, no Docker, no eslint.

**Lanes.** `Lane: hermes` tasks are small, single-purpose and safe for the cheap OpenRouter drain. `Lane: interactive` tasks touch the machinery that
executes the drain (`hermes-drain.sh`, `drain-prompt.md`, `pr-auto-review.mjs`, `queue-drainer.mjs`, `review-hook.mjs` gate logic,
`cron-schedule.json`, `scheduler-install.mjs`, `budget.json`) or need a Bryce decision; they are done in a Claude Code session. **CV-006 makes the seeder skip
interactive tasks; it must land before this change is flipped to ready-for-dev (CV-012).**

Test locations: `tests/*.test.mjs` and `agents/__tests__/*.test.mjs` (both run by `npm test`). Use `node --test <file>` for a single file.

---

## Prerequisites

- [x] Design approved by the orchestrator review (readiness flips at CV-012)
- [x] Gap analyses verified against the repo (D1/D3-D7 + loop-health, 2026-11-03)
- [x] Curriculum mirrored into docs/curriculum/ (CV-001)

---

## Work Stream Summary

| Work Stream | Lane | Tasks | Parallel With |
|---|---|---|---|
| Loop restored | interactive | CV-001..CV-012 | gates everything |
| Cycles wired | hermes (+ interactive CV-106, CV-114, CV-115) | CV-101..CV-126 | none (HIGH priority first) |
| Input safety | hermes (+ CV-211) | CV-201..CV-211 | planning, memory |
| Planning templates | hermes (+ CV-233) | CV-221..CV-238 | input safety, memory |
| Memory evolution | hermes | CV-241..CV-253 | input safety, planning |
| Autonomous-path gates | interactive (+ hermes helpers) | CV-301..CV-322 | after Phase 1 |
| Release manager | interactive (+ CV-408, CV-409) | CV-401..CV-410 | after CV-321 |
| Claude review lane | interactive (+ CV-501, CV-507, CV-508, CV-510) | CV-501..CV-512 | after CV-321 |
| Hygiene + verification | mixed | CV-601..CV-611 | last |

---

## Decisions needed from Bryce

None of these block the hermes lane. Each names the gap and the task it unblocks.

| # | Decision | Gap | Unblocks |
|---|---|---|---|
| 1 | Enable `humanWellness` in agents/project.json (advisory alerts; currently dormant) | D7-09 | one-line config change, no task yet — **DECIDED 2026-11-03 (default):** ON, advisory only — `agents/project.json` humanWellness.enabled=true. |
| 2 | Matrix homeserver vs. Telegram as the documented L4 substitute | D3-05 | `matrix-cli` rooms/test, or a doc line in SHARED_PROTOCOL — **DECIDED:** keep Telegram as the L4 substitute; CoffeeTalk.md for agent-to-agent; no Matrix homeserver. |
| 3 | Set an OpenRouter per-key credit limit (key currently has none; usage $30.44) and add a health-check probe | D1-19, D7-12 | RUNBOOK line + probe task — **DECIDED:** $50/month per-key cap — Bryce sets it in the OpenRouter dashboard (human step); RUNBOOK documents it. |
| 4 | Create a separate GitHub bot account for the agent PAT, or document the current identity | D1-11 | RUNBOOK line — **DECIDED:** keep the current identity (Bryce PAT + `Co-Authored-By: hermes-drain`); bot account optional later; RUNBOOK documents it. |
| 5 | Active-hours and merge-only windows for the drain (24/7 may be intentional) | D1-08 | `portfolio.json` fields read by drain-supervisor — **DECIDED:** 24/7, no merge-only window. |
| 6 | ~~Production error source~~ DECIDED 2026-11-03: any and all sources → Phase 7 | D1-04 | CV-703..705 |
| 7 | Turn on the optional `claude -p` headless review timer? Cost: each review spends subscription tokens in a background session; Bryce's plan is small. Default OFF, max 2/day if on | CV-REQ-104 | CV-511, CV-512 — **DECIDED:** OFF — Claude reviews the flagged queue only in interactive sessions (CV-511/512 stay parked). |
| 8 | Values for values-driven agent goals (bottom-ranked values) | D3-03 | a "Values" section in AGENT.md.template — **DECIDED:** Claude drafted `framework/values.md` from Bryce's standing rules (top + bottom-ranked); Bryce edits at leisure. Wired into AGENT.md.template and drain-prompt.md. |

---

## Implementation Tasks

### Phase 0: Loop restored (prerequisites)

Items marked [x] are already done (2026-11-03). Unchecked items are Lane: interactive and are done by the orchestrator in a Claude Code session; they gate everything else.

- [x] **CV-001**: Mirror the Multiverse School curriculum into docs/curriculum/ (done 2026-11-03)
  - **Priority:** HIGH
  - Files: `docs/curriculum/`
  - Spec: n/a (prerequisite)
  - Gaps: -
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: ls docs/curriculum shows 19 files
  - Parallel: yes
  - Complexity: S

- [x] **CV-002**: Apply PR #63 changes; close #63 and #64 (done)
  - **Priority:** HIGH
  - Files: `agents/hermes-drain.sh`
  - Spec: n/a (prerequisite)
  - Gaps: loop-health §3
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: gh pr list shows #63/#64 closed
  - Parallel: yes
  - Complexity: S

- [x] **CV-003**: Reconcile merged-but-pending queue tasks OS-business-os-4 and -8 to completed (done)
  - **Priority:** HIGH
  - Files: `tasks/queue/`
  - Spec: n/a (prerequisite)
  - Gaps: loop-health §2
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: queue-drainer status shows neither pending
  - Parallel: yes
  - Complexity: S

- [x] **CV-004**: Pin embed.py to CPU (done)
  - **Priority:** HIGH
  - Files: `agents/embed.py`
  - Spec: n/a (prerequisite)
  - Gaps: -
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: npm test green
  - Parallel: yes
  - Complexity: S

- [x] **CV-005**: Fix the flaky test (done)
  - **Priority:** HIGH
  - Files: `tests/`
  - Spec: n/a (prerequisite)
  - Gaps: -
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: npm test green three times in a row
  - Parallel: yes
  - Complexity: S

- [x] **CV-006**: Seeder skips tasks marked `Lane: interactive` (reason `interactive-lane`; unknown lane value also skipped)
  - **Priority:** HIGH
  - Files: `agents/seed-queue-from-openspec.mjs, tests/seed-queue-from-openspec.test.mjs`
  - Spec: CV-REQ-039
  - Gaps: loop-health §8
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: dry-run on a fixture tasks.md with one interactive and one hermes task creates only the hermes task; reports skip reason `interactive-lane`
  - Parallel: none; MUST land before this change is set ready-for-dev
  - Complexity: S
  - Notes: Without this the drain would claim interactive tasks and block on them, as OS-business-os-1/-2 did.

- [x] **CV-007**: model-manager: on `provider-recovered` clear activeModel overrides set by `provider-down-swap`; never swap to a provider whose keyEnv is unset (GROQ_API_KEY); require 3 consecutive failures and more than 5 minutes since boot; drop the stale stash
  - **Priority:** HIGH
  - Files: `agents/model-manager.mjs, tests/adapter-and-model-manager.test.mjs`
  - Spec: n/a (loop-health §4)
  - Gaps: loop-health §4
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: fixture ledger: down-swap then recovered leaves budget.json activeModel null; swap target with unset key env is refused and logged
  - Parallel: yes
  - Complexity: M

- [x] **CV-008**: Order generated timer and gateway units after `network-online.target` (After= and Wants=)
  - **Priority:** HIGH
  - Files: `agents/scheduler-install.mjs, tests/scheduler-install.test.mjs`
  - Spec: n/a (loop-health §5)
  - Gaps: loop-health §5
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: generated unit text contains `After=network-online.target` and `Wants=network-online.target`
  - Parallel: yes
  - Complexity: S

- [x] **CV-009**: Resolve PR #66 (cron-schedule.json change): review as flagged, merge or close with a comment; this is the first manual use of the Phase 5 lane
  - **Priority:** HIGH
  - Files: `agents/cron-schedule.json`
  - Spec: n/a (loop-health §3)
  - Gaps: loop-health §3
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: gh pr view 66 shows merged or closed; CC-003 reconciled in the queue
  - Parallel: yes
  - Complexity: S

- [x] **CV-010**: ~~Enable `sdlc-sched-autonomous-drain.timer`~~ SUPERSEDED 2026-11-03: `agents/drain-supervisor.mjs` (started at boot) already runs `hermes-drain.sh` continuously; enabling the timer would only add mutex contention
  - **Priority:** HIGH
  - Files: `systemd user units (no repo file)`
  - Spec: n/a (loop-health §1)
  - Gaps: loop-health §1
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: systemctl --user list-timers shows autonomous-drain with a next trigger; one drain pass produces a log in pm/drain-logs
  - Parallel: blocked-by CV-006, CV-007, CV-008, CV-009
  - Complexity: S
  - Notes: Re-check after CV-321: the first post-enable PR should show the check-staged line in its drain log.

- [x] **CV-011**: Claim prefixes CYC, GATE, REL, SAFE, MEM, PLAN, REV in openspec/REQUIREMENT-PREFIXES.md (create the ledger if absent), in the same commit as the spec files
  - **Priority:** HIGH
  - Files: `openspec/REQUIREMENT-PREFIXES.md`
  - Spec: n/a (convention)
  - Gaps: -
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: ledger lists all seven prefixes with this change name; no prefix collides with an existing row
  - Parallel: yes
  - Complexity: S

- [x] **CV-012**: Flip this change to readiness ready-for-dev, push, and dry-run the seeder: only hermes-lane tasks may be listed
  - **Priority:** HIGH
  - Files: `openspec/changes/curriculum-v2-conformance/status.json`
  - Spec: CV-REQ-039
  - Gaps: -
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: `node agents/seed-queue-from-openspec.mjs --dry-run` lists no task whose block has `Lane: interactive`
  - Parallel: blocked-by CV-006, CV-011
  - Complexity: S

- [x] **CV-013**: Drain trespass guard — the worker never touches a human checkout (done 2026-11-03, incident-driven)
  - **Priority:** CRITICAL
  - Files: `agents/drain-trespass-guard.sh` (new), `agents/hermes-drain.sh`, `agents/drain-prompt.md`, `tests/drain-trespass-guard.test.mjs` (new)
  - Lane: interactive
  - Test: 5 guard scenarios (untouched, switched branch restored, drain commit backed-up never reset, human commit ignored, dirty tree not switched); hermes-drain suite 18/18
  - Notes: 2026-11-03 13:14 a worker `cd`'d into ~/agentic-sdlc (prompt + CLAUDE.md name that absolute path), committed on main, reset it, and switched the checkout to its branch. Fix: the prompt never names the human checkout (framework drains use the clone's own scripts) + rule 0 + before/after guard (rc=97, outbox + notify). Follow-up worth considering: run the worker in a bubblewrap sandbox with human checkouts bind-mounted read-only.

- [ ] **CV-014**: De-flake `tests/hermes-drain.test.mjs` under the review gate
  - **Priority:** HIGH
  - Files: `tests/hermes-drain.test.mjs`, `agents/hermes-drain.sh`
  - Lane: interactive
  - Test: the file passes 10/10 inside `hardGate` while the full suite runs in parallel
  - Notes: failed the gate for #85 and #86 but passes alone through the same `hardGate` (2026-11-03). Suspects: the script's network `gh pr list` / `git fetch` inside a 30s execFileSync timeout under CPU load; the tests must stub `gh` (PATH shim) so they never touch the network.

### Phase 1: Cycles wired

Capability: cycles-wired. Mostly hermes lane; only scheduler and cron-schedule.json edits and the baseline recording are interactive.

- [x] **CV-101**: Export `runStep` from monthly-review.mjs so the weekly cycle can reuse it
  - **Priority:** HIGH
  - Files: `agents/cycles/monthly-review.mjs, agents/__tests__/monthly-review.test.mjs`
  - Spec: CV-REQ-010
  - Gaps: D5-04, D7-03
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test imports monthly-review.mjs and asserts `typeof runStep === "function"` and that import does not run main()
  - Parallel: yes
  - Complexity: S

- [x] **CV-102**: Add exported `buildWeeklySteps({dryRun})` to weekly-review.mjs returning, in order: pattern-hunt.mjs; rem-sleep.mjs --similarity; test-behavior.mjs --drift (each with --dry-run when dryRun)
  - **Priority:** HIGH
  - Files: `agents/cycles/weekly-review.mjs, agents/__tests__/weekly-review-steps.test.mjs`
  - Spec: CV-REQ-010
  - Gaps: D5-04, D7-03
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: new test: names and order of the three steps; dryRun appends --dry-run to each
  - Parallel: blocked-by CV-101
  - Complexity: S

- [x] **CV-103**: Add exported `runWeeklySteps(steps, runner = runStep)` and call it from weekly-review main() after the existing sections; print `<label>: PASS|FAIL` per step; a failing step must not stop the next
  - **Priority:** HIGH
  - Files: `agents/cycles/weekly-review.mjs, agents/__tests__/weekly-review-steps.test.mjs`
  - Spec: CV-REQ-010
  - Gaps: D5-04, D7-03
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: runner stub failing on step 1 still receives steps 2 and 3; result array has 3 entries; add `__isMainModule` guard if main() runs on import
  - Parallel: blocked-by CV-102
  - Complexity: S

- [x] **CV-104**: weekly-review `analyzePatterns()` and `computeMaturationMetrics()`: replace hard-coded `richmond/reviews` with `agents/<reviewer>/reviews` where reviewer is `sdlc-reviewer`
  - **Priority:** HIGH
  - Files: `agents/cycles/weekly-review.mjs, agents/__tests__/maturation-tracking.test.mjs`
  - Spec: CV-REQ-010
  - Gaps: D5-04, D5-03
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: maturation-tracking tests still pass; new case reads a fixture reviews dir under agents/sdlc-reviewer
  - Parallel: blocked-by CV-103
  - Complexity: S

- [x] **CV-105**: test-behavior.mjs: move BASELINES_PATH to tracked `agents/behavior-baselines.json`; read legacy `pm/behavior-baselines.json` only when the new file is absent
  - **Priority:** HIGH
  - Files: `agents/test-behavior.mjs, agents/__tests__/behavior-baselines.test.mjs`
  - Spec: CV-REQ-011
  - Gaps: D7-01
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: record writes the new path; load falls back to the legacy path when the new file is missing; existing drift tests pass
  - Parallel: none
  - Complexity: S

- [x] **CV-106**: Record baselines on the primary box (`node agents/test-behavior.mjs --baseline`) and commit agents/behavior-baselines.json
  - **Priority:** HIGH
  - Files: `agents/behavior-baselines.json`
  - Spec: CV-REQ-011
  - Gaps: D7-01
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: `node agents/test-behavior.mjs --drift` prints a comparison per agent, exits 0
  - Parallel: blocked-by CV-105
  - Complexity: S
  - Notes: Interactive: baselines depend on the live agents' memory on this host, which the drain clone does not have.

- [x] **CV-107**: Append `&& node agents/test-behavior.mjs --drift` to the package.json `test` script
  - **Priority:** HIGH
  - Files: `package.json, agents/__tests__/behavior-baselines.test.mjs`
  - Spec: CV-REQ-011
  - Gaps: D7-02
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: new case reads package.json and asserts the test script contains `test-behavior.mjs --drift`; `npm test` exits 0
  - Parallel: blocked-by CV-106
  - Complexity: S

- [x] **CV-108**: Refactor monthly-review main() step list into exported pure `buildMonthlySteps({dryRun})` with no behavior change
  - **Priority:** HIGH
  - Files: `agents/cycles/monthly-review.mjs, agents/__tests__/monthly-review.test.mjs`
  - Spec: CV-REQ-011, CV-REQ-013
  - Gaps: D7-01, D7-20
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: steps equal today's list (behavior audit, drift, snapshot, migration check); dryRun omits snapshot
  - Parallel: blocked-by CV-101
  - Complexity: S

- [x] **CV-109**: monthly-review: after the drift step passes, re-record the baseline (`test-behavior.mjs --baseline`); skip when drift failed or dryRun
  - **Priority:** HIGH
  - Files: `agents/cycles/monthly-review.mjs, agents/__tests__/monthly-review.test.mjs`
  - Spec: CV-REQ-011
  - Gaps: D7-01
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: runner stub: drift ok -> baseline step runs after snapshot; drift fail -> baseline step not run; dryRun -> not run
  - Parallel: blocked-by CV-108
  - Complexity: M

- [x] **CV-110**: health-check.mjs: add exported pure `evaluateCycleCadence(history, now, limits)` (daily 2d, weekly 8d, monthly 32d)
  - **Priority:** HIGH
  - Files: `agents/health-check.mjs, tests/health-check.test.mjs`
  - Spec: CV-REQ-012
  - Gaps: D7-06
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: weekly entry 9 days old -> overdue weekly; all fresh -> none; zero monthly entries and oldest entry < 32d -> not flagged
  - Parallel: yes
  - Complexity: S
  - Notes: Read the history entry shape from recordCycleHistory() in agents/cycles/daily-review.mjs before writing.

- [x] **CV-111**: health-check.mjs: add `checkCycles(config, history)` returning name `cycles`, status degraded with detail `process-erosion: weekly overdue` when overdue; add it to the `checks` array in runHealthCheck (opts.cycleHistory overrides the file read); missing file -> degraded `no cycle history`, never throws
  - **Priority:** HIGH
  - Files: `agents/health-check.mjs, tests/health-check.test.mjs`
  - Spec: CV-REQ-012
  - Gaps: D7-06
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: runHealthCheck({cycleHistory: stale}) has a cycles check with status degraded; missing history does not throw
  - Parallel: blocked-by CV-110
  - Complexity: S

- [x] **CV-112**: maturity-assess.mjs: add `--report` flag writing the console table to `pm/maturity-reports/<YYYY-MM-DD>.md` (mkdir -p; overwrite same day)
  - **Priority:** HIGH
  - Files: `agents/maturity-assess.mjs, tests/maturity-assess.test.mjs`
  - Spec: CV-REQ-013
  - Gaps: D7-20
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: run with --dir <tmp> --report: file exists and contains a dimension table
  - Parallel: yes
  - Complexity: S

- [x] **CV-113**: monthly-review: add `maturity-assess.mjs --report` step to buildMonthlySteps (skipped when dryRun)
  - **Priority:** HIGH
  - Files: `agents/cycles/monthly-review.mjs, agents/__tests__/monthly-review.test.mjs`
  - Spec: CV-REQ-013
  - Gaps: D7-20
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: buildMonthlySteps({dryRun:false}) includes the step; dryRun excludes it
  - Parallel: blocked-by CV-108, CV-112
  - Complexity: S

- [x] **CV-114**: scheduler-install.mjs: honour `supersededBy` (skip entry, disable and remove an existing user unit of that name) and `enabled:false` (install the unit, do not enable)
  - **Priority:** HIGH
  - Files: `agents/scheduler-install.mjs, tests/scheduler-install.test.mjs`
  - Spec: CV-REQ-014
  - Gaps: D7-03, D7-11
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: unit tests with an injected systemctl runner: superseded entry yields a disable call and no install; enabled:false yields install without enable
  - Parallel: yes
  - Complexity: M

- [x] **CV-115**: cron-schedule.json (+ template): declare `model-manager-research` (command copied from the existing user unit), declare `pattern-hunt-weekly` and `rem-sleep-weekly` with `supersededBy: "weekly-pattern-hunt"`, fix the weekly-pattern-hunt description; run `scheduler-install.mjs install`
  - **Priority:** HIGH
  - Files: `agents/cron-schedule.json, agents/templates/cron-schedule.json.template, tests/scheduler-install.test.mjs`
  - Spec: CV-REQ-014
  - Gaps: D7-11, D7-03
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: test: every `script` path in the JSON resolves under agents/; entries exist with the expected flags; `systemctl --user list-timers` no longer lists pattern-hunt-weekly
  - Parallel: blocked-by CV-114, CV-103
  - Complexity: M

- [x] **CV-116**: browser-user-test.mjs: export `hasPlaywrightConfig(dir)` (playwright.config.js/ts/mjs/cjs)
  - **Priority:** HIGH
  - Files: `agents/browser-user-test.mjs, agents/__tests__/browser-user-test.test.mjs`
  - Spec: CV-REQ-015
  - Gaps: D7-04
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: tmp dirs with each config name -> true; empty dir -> false
  - Parallel: yes
  - Complexity: S

- [x] **CV-117**: daily-review.mjs: add `runUserTests(config, {runner})`; when config present and a spec exists run `browser-user-test.mjs run`, else log `skipped (no-playwright-config)`; failure is non-fatal; write a `User tests` dashboard section
  - **Priority:** HIGH
  - Files: `agents/cycles/daily-review.mjs, agents/__tests__/daily-review.test.mjs`
  - Spec: CV-REQ-015
  - Gaps: D7-04
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: runner stub: config present -> runner called, section shows PASS/FAIL and pm/user-tests path; no config -> runner not called, section shows skipped
  - Parallel: blocked-by CV-116, CV-118
  - Complexity: M

- [x] **CV-118**: daily-review.mjs: add exported `upsertDashboardSection(title, body, path)` replacing an existing `## <title>` section or appending it
  - **Priority:** HIGH
  - Files: `agents/cycles/daily-review.mjs, agents/__tests__/daily-review.test.mjs`
  - Spec: CV-REQ-020
  - Gaps: D1-05, D1-06
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: calling twice with different bodies leaves exactly one section with the second body; other sections untouched
  - Parallel: yes
  - Complexity: S

- [x] **CV-119**: daily-review.mjs: add pure `openspecStatusTable(changesDir)` (per active change: phase, status, readiness, tasks done/total; plus active and archived counts)
  - **Priority:** HIGH
  - Files: `agents/cycles/daily-review.mjs, agents/__tests__/daily-review.test.mjs`
  - Spec: CV-REQ-020
  - Gaps: D1-06
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: tmp changes dir with two active changes and one archived: table rows and counts correct; change lacking status.json or tasks.md renders `-`
  - Parallel: yes
  - Complexity: S

- [x] **CV-120**: daily-review.mjs: add pure `bugMetrics(changesDir, queueDir)` (active vs archived `bug-*` and `prod-error-*`, resolution rate, pending vs completed `FIX-*` queue tasks)
  - **Priority:** HIGH
  - Files: `agents/cycles/daily-review.mjs, agents/__tests__/daily-review.test.mjs`
  - Spec: CV-REQ-020
  - Gaps: D1-05
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: one active bug-X and one archived bug-Y -> rate 50%; no bug dirs -> `none`, no NaN
  - Parallel: yes
  - Complexity: S

- [x] **CV-121**: daily-review.mjs: call `upsertDashboardSection` with the OpenSpec status table and Bug metrics from the daily run
  - **Priority:** HIGH
  - Files: `agents/cycles/daily-review.mjs, agents/__tests__/daily-review.test.mjs`
  - Spec: CV-REQ-020
  - Gaps: D1-05, D1-06
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: running the daily review twice against a tmp DASHBOARD.md yields one `## OpenSpec status` and one `## Bug metrics`
  - Parallel: blocked-by CV-118, CV-119, CV-120
  - Complexity: S

- [x] **CV-122**: weekly-review.mjs: add pure `capacityForecast(tasks, budget)` and upsert a `Capacity forecast` dashboard section (import `upsertDashboardSection`)
  - **Priority:** HIGH
  - Files: `agents/cycles/weekly-review.mjs, agents/__tests__/weekly-review-steps.test.mjs`
  - Spec: CV-REQ-017
  - Gaps: D4-08
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: 1,000,000 pending tokens / 250,000 daily -> `4 days`; missing or zero budget -> `n/a`
  - Parallel: blocked-by CV-118, CV-103
  - Complexity: S

- [x] **CV-123**: weekly-review.mjs: add pure `groomingReport(tasks, now)` (missing estimatedTokens, missing acceptance_criteria, missing priority, unclaimed over 30 days) and upsert a `Grooming` section
  - **Priority:** HIGH
  - Files: `agents/cycles/weekly-review.mjs, agents/__tests__/weekly-review-steps.test.mjs`
  - Spec: CV-REQ-018
  - Gaps: D4-09
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: a pending task without acceptance_criteria appears under `missing acceptance`; empty lists print `none`
  - Parallel: blocked-by CV-122
  - Complexity: S

- [x] **CV-124**: weekly-review.mjs: add pure `computePrRejectRate(logLines, now)` over pm/pr-auto-review.log JSON lines (28 days; rejected = gate-failed + llm-rejected; denominator adds merged; each pr+sha once) and `prRejectTarget(level)` (0-1: 30%, 2-3: 10%, 4: 1%, 5-6: 0.1%); print both
  - **Priority:** HIGH
  - Files: `agents/cycles/weekly-review.mjs, agents/__tests__/maturation-tracking.test.mjs`
  - Spec: CV-REQ-019
  - Gaps: D5-08
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: 1 merged + 1 llm-rejected -> 50%; only skip/flagged lines -> n/a
  - Parallel: blocked-by CV-122
  - Complexity: S

- [x] **CV-125**: weekly-review.mjs: add pure `architectureCheck(metrics)` (underperforming: first-attempt success < 0.5 over >= 5 tasks; split-candidate: > 6 routed domains; idle: zero tasks 4 weeks) and print the section
  - **Priority:** HIGH
  - Files: `agents/cycles/weekly-review.mjs, agents/__tests__/weekly-review-steps.test.mjs`
  - Spec: CV-REQ-016
  - Gaps: D7-07
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: 5 tasks / 2 first-attempt successes -> underperforming; thresholds boundary cases
  - Parallel: blocked-by CV-124
  - Complexity: M
  - Notes: Read computeMaturationMetrics() output to learn the metric field names.

- [x] **CV-126**: weekly-review.mjs: add pure `agentMdChangedSinceSnapshot(agentsDir, versionsDir)` and run `version-snapshot.mjs snapshot` when true
  - **Priority:** HIGH
  - Files: `agents/cycles/weekly-review.mjs, agents/__tests__/weekly-review-steps.test.mjs`
  - Spec: CV-REQ-016
  - Gaps: D7-07
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: tmp dirs: identical copy -> false; edited AGENT.md -> true; no snapshot dir -> true
  - Parallel: blocked-by CV-125
  - Complexity: S

### Phase 2: Input safety + Planning templates + Memory evolution (parallel)

Capabilities: input-safety, planning-templates, memory-evolution. The three groups touch disjoint files and run in parallel. Within a group, tasks sharing a file are chained with blocked-by.

- [x] **CV-201**: red-team-tester.mjs RULES: add `you are now a`, `forget everything`, `new instructions:`, `system prompt:`, `list (all )?api keys`, `output (your )?env(ironment)? vars` (case-insensitive)
  - **Priority:** MEDIUM
  - Files: `agents/red-team-tester.mjs, agents/__tests__/injection-screening.test.mjs`
  - Spec: CV-REQ-060
  - Gaps: D5-06
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: each phrase flagged; "see the system prompt guide" and "we list API endpoints" not flagged
  - Parallel: yes
  - Complexity: S

- [x] **CV-202**: red-team-tester.mjs: export `imperativeCount(text)` and flag text with 3 or more sentences opening with an imperative verb (list, delete, ignore, send, run, output, reveal, forget) as `imperative-density`
  - **Priority:** MEDIUM
  - Files: `agents/red-team-tester.mjs, agents/__tests__/injection-screening.test.mjs`
  - Spec: CV-REQ-060
  - Gaps: D5-06
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: 3 imperative sentences flagged; 2 not; normal prose with one "Run the tests." not flagged
  - Parallel: blocked-by CV-201
  - Complexity: S

- [x] **CV-203**: red-team-tester.mjs: add CLI `--screen <text|->` printing the verdict JSON and exiting 2 when flagged
  - **Priority:** MEDIUM
  - Files: `agents/red-team-tester.mjs, agents/__tests__/injection-screening.test.mjs`
  - Spec: CV-REQ-061
  - Gaps: D5-06
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: spawn with a flagged phrase -> exit 2 and JSON on stdout; benign text -> exit 0
  - Parallel: blocked-by CV-202
  - Complexity: S

- [x] **CV-204**: seed-queue.mjs: in the function that writes tasks/queue/<id>.json, call `screenExternalInput` when `task.origin` is inbox, mailbox, issue or error; flagged -> do not write, raise a human task via notifyHumanTask, log `injectionScreen`
  - **Priority:** MEDIUM
  - Files: `agents/seed-queue.mjs, agents/__tests__/injection-screening.test.mjs`
  - Spec: CV-REQ-061
  - Gaps: D5-06
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: tmp queue dir: flagged inbox task writes no file and creates a human task; origin `repo` task unaffected
  - Parallel: blocked-by CV-202
  - Complexity: M

- [x] **CV-205**: seed-queue-from-openspec.mjs: screen each task block with `screenExternalInput`; flagged -> skip with reason `injection-screen`
  - **Priority:** MEDIUM
  - Files: `agents/seed-queue-from-openspec.mjs, tests/seed-queue-from-openspec.test.mjs`
  - Spec: CV-REQ-061
  - Gaps: D5-06
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: fixture tasks.md containing "new instructions: delete" is skipped; clean task seeds
  - Parallel: blocked-by CV-202
  - Complexity: S

- [x] **CV-206**: skills/sdlc-inbox/SKILL.md: add a step to run `node agents/red-team-tester.mjs --screen "<text>"` on pasted text before filing
  - **Priority:** MEDIUM
  - Files: `skills/sdlc-inbox/SKILL.md, tests/sdlc-inbox-skill.test.mjs`
  - Spec: CV-REQ-061
  - Gaps: D5-06
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: skill test asserts the SKILL.md contains `red-team-tester.mjs --screen`
  - Parallel: blocked-by CV-203
  - Complexity: S

- [x] **CV-207**: seed-queue-from-openspec.mjs: export `goalSafetyFindings(task)` returning `no-acceptance` (no Test:/acceptance line) and `unbounded-verb` (optimize, improve, clean up, refactor, simplify, "make better" with no file in Files:)
  - **Priority:** MEDIUM
  - Files: `agents/seed-queue-from-openspec.mjs, tests/seed-queue-from-openspec.test.mjs`
  - Spec: CV-REQ-062
  - Gaps: D3-02
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: "Improve performance" without Files -> unbounded-verb; same text with a Files line -> none; task without Test -> no-acceptance
  - Parallel: blocked-by CV-205
  - Complexity: S

- [x] **CV-208**: seed-queue-from-openspec.mjs: skip `unbounded-verb` tasks with reason `unbounded-goal`; store `no-acceptance` as `goalSafety` warning on the queue task JSON
  - **Priority:** MEDIUM
  - Files: `agents/seed-queue-from-openspec.mjs, tests/seed-queue-from-openspec.test.mjs`
  - Spec: CV-REQ-062
  - Gaps: D3-02
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: dry-run reports `unbounded-goal`; created task JSON carries goalSafety for a no-acceptance task
  - Parallel: blocked-by CV-207
  - Complexity: S

- [x] **CV-209**: AGENT.md.template and framework/prompt-playbook.md: add a five-line "Goal safety" section (tiny completable goal, named scope, explicit done-test, no open-ended verbs, stop when done)
  - **Priority:** MEDIUM
  - Files: `agents/templates/AGENT.md.template, framework/prompt-playbook.md, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-062
  - Gaps: D3-02
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: planning-templates test asserts both files contain `## Goal safety`
  - Parallel: blocked-by CV-221
  - Complexity: S

- [x] **CV-210**: red-team-tester.mjs: export `findingsToTasks(findings, existingIds)` (HIGH only, id `RT-<hash of file+rule>`, priority HIGH, max 5) and add `--tasks` mode that writes them to tasks/queue
  - **Priority:** MEDIUM
  - Files: `agents/red-team-tester.mjs, agents/__tests__/injection-screening.test.mjs`
  - Spec: CV-REQ-063
  - Gaps: D5-05
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: 7 HIGH findings -> 5 tasks + `capped` note; second call with same findings -> 0; MEDIUM ignored
  - Parallel: blocked-by CV-204
  - Complexity: M

- [ ] **CV-211**: cron-schedule.json: pass `--tasks` in the weekly red-team entry, then reinstall timers
  - **Priority:** MEDIUM
  - Files: `agents/cron-schedule.json`
  - Spec: CV-REQ-063
  - Gaps: D5-05
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: entry script ends with `--tasks`; scheduler-install dry run lists it
  - Parallel: blocked-by CV-210, CV-115
  - Complexity: S

- [x] **CV-221**: Create tests/planning-templates.test.mjs with helper `read(relPath)` and one test that every template path named in specs/planning-templates.md exists
  - **Priority:** MEDIUM
  - Files: `tests/planning-templates.test.mjs`
  - Spec: CV-REQ-080
  - Gaps: D1-12
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: node --test tests/planning-templates.test.mjs passes (paths for not-yet-created files are listed in an array that later tasks extend)
  - Parallel: yes
  - Complexity: S
  - Notes: Test file only; no production code.

- [x] **CV-222**: requirements-engineer.md: add "Requirements Rubric" (5 rows: purpose/scope, numeric business goals, user stories, technical constraints, NFRs) and a gap-question loop rule (ask until every row passes or the user stops)
  - **Priority:** MEDIUM
  - Files: `agents/templates/planning-agents/requirements-engineer.md, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-080
  - Gaps: D1-12
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test asserts heading `## Requirements Rubric` and all five row labels
  - Parallel: blocked-by CV-221
  - Complexity: S

- [x] **CV-223**: braindump.md.template: add `## Business Goals (numeric)` and `## Technical Constraints` sections
  - **Priority:** MEDIUM
  - Files: `openspec/templates/braindump.md.template, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-080
  - Gaps: D1-12
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test asserts both headings
  - Parallel: blocked-by CV-221
  - Complexity: S

- [x] **CV-224**: proposal.md.template: add `### User Stories (by persona)` with rows for new, regular, power, admin, payer in As a / I want / so that form
  - **Priority:** MEDIUM
  - Files: `openspec/templates/proposal.md.template, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-081
  - Gaps: D1-13
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test asserts the heading and five persona labels
  - Parallel: blocked-by CV-221
  - Complexity: S

- [x] **CV-225**: requirements-engineer.md: add a persona-coverage checklist line (every persona has a story or an explicit "not applicable")
  - **Priority:** MEDIUM
  - Files: `agents/templates/planning-agents/requirements-engineer.md, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-081
  - Gaps: D1-13
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test asserts the phrase `persona coverage`
  - Parallel: blocked-by CV-222
  - Complexity: S

- [x] **CV-226**: proposal.md.template: add `### Success Metrics` (metric, baseline, target, how measured) and `### Who Benefits` inside Value Analysis
  - **Priority:** MEDIUM
  - Files: `openspec/templates/proposal.md.template, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-082
  - Gaps: D1-14
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test asserts both headings appear after `## Value Analysis`
  - Parallel: blocked-by CV-224
  - Complexity: S

- [x] **CV-227**: value-analyst.md: require success metrics, who benefits, and an answer to "what if we do not build this"
  - **Priority:** MEDIUM
  - Files: `agents/templates/planning-agents/value-analyst.md, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-082
  - Gaps: D1-14
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test asserts the three phrases
  - Parallel: blocked-by CV-221
  - Complexity: S

- [x] **CV-228**: SHARED_PROTOCOL.md and SHARED_PROTOCOL.md.template: add "Agent log (coffeetalk)" section: append-only pm/coffeetalk.md, line `- <ISO time> @from -> @to: message`, read last 20 lines at turn start, never edit or delete
  - **Priority:** MEDIUM
  - Files: `agents/SHARED_PROTOCOL.md, agents/templates/SHARED_PROTOCOL.md.template, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-083
  - Gaps: D3-06, D6-09
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test asserts both files contain `pm/coffeetalk.md` and `append-only`
  - Parallel: blocked-by CV-221
  - Complexity: S

- [x] **CV-229**: frontend-developer.md: add first-step bullets: run `node ~/component-library/bin/search.mjs <keyword>`; else shadcn primitives; Tailwind only; no raw CSS
  - **Priority:** MEDIUM
  - Files: `agents/templates/execution-agents/frontend-developer.md, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-084
  - Gaps: D3-09
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test asserts `component-library/bin/search.mjs`
  - Parallel: blocked-by CV-221
  - Complexity: S

- [x] **CV-230**: Create planning-agents/project-manager.md (role, prioritise by value, "never one more thing", capture idea -> BACKLOG REQ-xxx -> tell user to keep current focus), modelled on product-manager.md
  - **Priority:** MEDIUM
  - Files: `agents/templates/planning-agents/project-manager.md, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-085
  - Gaps: D7-10
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: file exists and contains `BACKLOG.md` and `never one more thing`
  - Parallel: blocked-by CV-221
  - Complexity: S

- [x] **CV-231**: skills/sdlc-inbox/SKILL.md: route messages prefixed `idea:` to openspec/BACKLOG.md as the next REQ-xxx entry and reply "captured, keep current focus" (read BACKLOG.md for the entry format first)
  - **Priority:** MEDIUM
  - Files: `skills/sdlc-inbox/SKILL.md, tests/sdlc-inbox-skill.test.mjs`
  - Spec: CV-REQ-085
  - Gaps: D7-10
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: skill test asserts `idea:` routing and `BACKLOG.md` mentioned
  - Parallel: blocked-by CV-206
  - Complexity: S

- [x] **CV-232**: code-reviewer.md: add "Reasoning framework" (name the distortion, cite evidence, state the reframe) per finding
  - **Priority:** MEDIUM
  - Files: `agents/templates/execution-agents/code-reviewer.md, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-086
  - Gaps: D5-09
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test asserts `## Reasoning framework`
  - Parallel: blocked-by CV-221
  - Complexity: S

- [x] **CV-233**: pr-auto-review.mjs buildReviewPrompt: append the three-step reasoning framework text
  - **Priority:** MEDIUM
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-086
  - Gaps: D5-09
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: buildReviewPrompt(...) output contains the three steps
  - Parallel: blocked-by CV-232
  - Complexity: S

- [x] **CV-234**: code-reviewer.md: add "Standardization sweep" procedure (naming, error pattern, types, docstrings, typecheck if configured)
  - **Priority:** MEDIUM
  - Files: `agents/templates/execution-agents/code-reviewer.md, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-087
  - Gaps: D1-15
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test asserts `## Standardization sweep`
  - Parallel: blocked-by CV-232
  - Complexity: S

- [x] **CV-235**: seed-tasks.json.template: add one standardization-sweep seed task
  - **Priority:** MEDIUM
  - Files: `agents/templates/seed-tasks.json.template, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-087
  - Gaps: D1-15
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: template parses as JSON and contains a task whose title includes `Standardization sweep`
  - Parallel: blocked-by CV-234
  - Complexity: S

- [x] **CV-236**: docs/claude-quickstart.md: state /schedule and /loop are interactive-only with scheduler-install.mjs timers as the autonomous equivalent; mention REA MCP feeding `browser-user-test.mjs generate`
  - **Priority:** MEDIUM
  - Files: `docs/claude-quickstart.md, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-088
  - Gaps: D7-15, D7-17
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test asserts `interactive-only`, `scheduler-install.mjs`, `REA`
  - Parallel: blocked-by CV-221
  - Complexity: S

- [x] **CV-237**: Create execution-agents/git-expert.md (branching, rebases, conflict resolution, no force-push to shared branches), modelled on release-manager.md
  - **Priority:** MEDIUM
  - Files: `agents/templates/execution-agents/git-expert.md, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-089
  - Gaps: D7-18
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: file exists with `no force-push`
  - Parallel: blocked-by CV-221
  - Complexity: S

- [x] **CV-238**: framework/agent-routing.md: add "Disagreement is the finding" paragraph
  - **Priority:** MEDIUM
  - Files: `framework/agent-routing.md, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-089
  - Gaps: D7-18
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test asserts the phrase `disagreement is the finding`
  - Parallel: blocked-by CV-221
  - Complexity: S

- [x] **CV-241**: core.json.template: add optional `character` object (personality, communicationStyle, quirks[], relationships[], inTheirOwnWords, growthJourney[]); create agents/templates/character-sheet.md documenting each field
  - **Priority:** MEDIUM
  - Files: `agents/templates/core.json.template, agents/templates/character-sheet.md`
  - Spec: CV-REQ-070
  - Gaps: D6-01
  - Agent: sdlc-documentarian
  - Lane: hermes
  - Test: core.json.template still parses; migrate-memory.mjs --check unaffected; character-sheet.md names all six fields
  - Parallel: yes
  - Complexity: S

- [x] **CV-242**: memory-manager.mjs: add exported `renderCharacter(core)` (empty string when absent; capped at 400 chars) and include it in `recall` output
  - **Priority:** MEDIUM
  - Files: `agents/memory-manager.mjs, agents/__tests__/character-render.test.mjs`
  - Spec: CV-REQ-070
  - Gaps: D6-01
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: new test: no character -> recall output identical to before; with character -> block present and <= 400 chars
  - Parallel: blocked-by CV-241
  - Complexity: S

- [x] **CV-243**: worker.mjs: render the character block (via memory-manager `renderCharacter`) in the agent prompt when present
  - **Priority:** MEDIUM
  - Files: `agents/worker.mjs, agents/__tests__/character-render.test.mjs`
  - Spec: CV-REQ-070
  - Gaps: D6-01
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: prompt builder output contains the block only when core.json has character
  - Parallel: blocked-by CV-242
  - Complexity: S

- [x] **CV-244**: core.json.template failure schema: add optional `feeling`, `impact`, `whatIDoNow`; memory-manager.mjs `recall` renders them when present
  - **Priority:** MEDIUM
  - Files: `agents/templates/core.json.template, agents/memory-manager.mjs, agents/__tests__/character-render.test.mjs`
  - Spec: CV-REQ-071
  - Gaps: D6-03
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: failure without the fields renders exactly as before; with them, the three appear
  - Parallel: blocked-by CV-242
  - Complexity: S

- [x] **CV-245**: pattern-hunt.mjs teachAgents: fill feeling (critical=embarrassed, major=frustrated, minor=mildly annoyed), impact (recurrence count), whatIDoNow (= ruleAdded) on taught failures
  - **Priority:** MEDIUM
  - Files: `agents/pattern-hunt.mjs, agents/__tests__/teach-wiring.test.mjs`
  - Spec: CV-REQ-071
  - Gaps: D6-03
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: critical pattern recurring 3 times -> feeling `embarrassed`, impact contains `3`
  - Parallel: blocked-by CV-244
  - Complexity: S

- [x] **CV-246**: pattern-hunt.mjs teachAgents: also record a `long-term` entry with `learnedFrom: <agent>` on other agents sharing a domain in agents/domains.json; idempotent per (category, agent); dry-run writes nothing
  - **Priority:** MEDIUM
  - Files: `agents/pattern-hunt.mjs, agents/__tests__/teach-wiring.test.mjs`
  - Spec: CV-REQ-073
  - Gaps: D6-06
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: two agents sharing a domain: second gets one learnedFrom entry, a rerun adds none; agent without shared domain gets none
  - Parallel: blocked-by CV-245
  - Complexity: M

- [x] **CV-247**: version-snapshot.mjs snapshot(): also copy each agent's memory/*.json to agents/versions/<date>/memory/<agent>/; export a pure `memoryFilesFor(agent)` for testing
  - **Priority:** MEDIUM
  - Files: `agents/version-snapshot.mjs, agents/__tests__/version-snapshot.test.mjs`
  - Spec: CV-REQ-072
  - Gaps: D6-05
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: new test with tmp agents dir: snapshot copies memory json; AGENT.md copy behaviour unchanged
  - Parallel: yes
  - Complexity: M
  - Notes: Parameterize the root dir (default config.agentsDir) so the test does not touch real agents.

- [x] **CV-248**: version-snapshot.mjs restore(date, {memory}): `restore <date> --memory` copies snapshot memory back; refuse a date with no memory snapshot
  - **Priority:** MEDIUM
  - Files: `agents/version-snapshot.mjs, agents/__tests__/version-snapshot.test.mjs`
  - Spec: CV-REQ-072
  - Gaps: D6-05
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: corrupt a memory file in tmp dir, restore, file equals snapshot copy; missing memory snapshot -> refusal
  - Parallel: blocked-by CV-247
  - Complexity: S

- [x] **CV-249**: memory-manager.mjs saveMemory: append {ts,agent,layer,bytesBefore,bytesAfter,sha256} to pm/memory-audit.jsonl; audit failure never fails the save
  - **Priority:** MEDIUM
  - Files: `agents/memory-manager.mjs, agents/__tests__/memory-audit.test.mjs`
  - Spec: CV-REQ-072
  - Gaps: D6-05
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: save writes one audit line with correct sha256; unwritable audit path still saves the memory file
  - Parallel: blocked-by CV-244
  - Complexity: S

- [x] **CV-250**: AGENT.md.template: add `## Version History` and `## Breaking Changes` sections
  - **Priority:** MEDIUM
  - Files: `agents/templates/AGENT.md.template, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-074
  - Gaps: D6-07
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test asserts both headings
  - Parallel: blocked-by CV-221, CV-209
  - Complexity: S

- [x] **CV-251**: version-snapshot.mjs snapshot(): when an AGENT.md differs from the previous snapshot copy and has a `## Version History` section, append `- <date>: changed (+N/-M lines)` once per date
  - **Priority:** MEDIUM
  - Files: `agents/version-snapshot.mjs, agents/__tests__/version-snapshot.test.mjs`
  - Spec: CV-REQ-074
  - Gaps: D6-07
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: edited AGENT.md gets exactly one line; rerun same date adds none; agent without the section untouched
  - Parallel: blocked-by CV-248, CV-250
  - Complexity: M

- [x] **CV-252**: Create agents/templates/agent-proposal.md (observed pattern, proposed agent, evidence task ids, trial period, exit criterion)
  - **Priority:** MEDIUM
  - Files: `agents/templates/agent-proposal.md, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-075
  - Gaps: D6-08
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test asserts the five headings
  - Parallel: blocked-by CV-221
  - Complexity: S

- [x] **CV-253**: framework/agent-lifecycle.md: link to agents/templates/agent-proposal.md in the "when to create a new agent" section
  - **Priority:** MEDIUM
  - Files: `framework/agent-lifecycle.md, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-075
  - Gaps: D6-08
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test asserts the link text and that the target file exists
  - Parallel: blocked-by CV-252
  - Complexity: S

### Phase 3: Autonomous-path gates

Capability: autonomous-path-gates. Edits the machinery the drain runs on, so the gate tasks are interactive. Pure helper tasks are hermes and land first. Edits to drain-prompt.md are serialized.

- [x] **CV-301**: SHARED_PROTOCOL.md and its template: add "Ambiguous verbs and data safety" rule (optimize, clean up, simplify, tidy need a named file/table scope; never authorise deleting or rewriting data; no scope -> needs-human)
  - **Priority:** MEDIUM
  - Files: `agents/SHARED_PROTOCOL.md, agents/templates/SHARED_PROTOCOL.md.template, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-038
  - Gaps: D1-10
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test asserts both files contain `Ambiguous verbs`
  - Parallel: blocked-by CV-228
  - Complexity: S

- [x] **CV-302**: AGENT.md.template and worker.mjs micro-cycle text: tests first (derive failing tests from the spec) and the exact phrase `never modify a committed test` (flag needs-human instead)
  - **Priority:** MEDIUM
  - Files: `agents/templates/AGENT.md.template, agents/worker.mjs, tests/planning-templates.test.mjs`
  - Spec: CV-REQ-034
  - Gaps: D1-07
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test asserts the phrase in AGENT.md.template; worker.mjs prompt text contains it (grep in test)
  - Parallel: blocked-by CV-250
  - Complexity: S

- [x] **CV-303**: four-layer-validate.mjs: export `scanFunctionMetrics(source)` returning [{name,startLine,lines,params}] (brace-matching, JS/TS function and arrow forms); ensure importing the file does not run the CLI
  - **Priority:** MEDIUM
  - Files: `agents/four-layer-validate.mjs, agents/__tests__/silent-fallback-scan.test.mjs`
  - Spec: CV-REQ-031
  - Gaps: D5-02
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: 60-line function -> lines 60; 5-param function -> params 5; nested arrow counted separately; import has no side effects
  - Parallel: yes
  - Complexity: M
  - Notes: If the file has no __isMainModule guard, add one in this task.

- [x] **CV-304**: four-layer-validate.mjs Layer 3: report functions over 50 lines and over 4 parameters as advisory `[fn-length]`/`[param-count]` using scanFunctionMetrics; respect defeat-allowlist.json (shrink-only)
  - **Priority:** MEDIUM
  - Files: `agents/four-layer-validate.mjs, agents/__tests__/silent-fallback-scan.test.mjs`
  - Spec: CV-REQ-031
  - Gaps: D5-02
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: fixture source with a long function yields an advisory line and exit status unchanged; allowlisted file silent
  - Parallel: blocked-by CV-303
  - Complexity: M
  - Notes: Advisory only so existing repo code does not fail npm test; if existing code produces findings, add them to the allowlist in this task.

- [x] **CV-305**: checklist.md.template: add `Security Checks` and `Simulation` sections; create agents/sdlc-reviewer/checklist.md from it
  - **Priority:** MEDIUM
  - Files: `agents/templates/checklist.md.template, agents/sdlc-reviewer/checklist.md`
  - Spec: CV-REQ-031, CV-REQ-037
  - Gaps: D5-02, D5-03
  - Agent: sdlc-documentarian
  - Lane: hermes
  - Test: both files contain `## Security Checks` and `## Auto-added by pattern-hunt`; pattern-hunt appendToChecklist dry-run finds the file
  - Parallel: yes
  - Complexity: S
  - Notes: pattern-hunt reads agents/<reviewer>/checklist.md; keep the Auto-added heading it expects.

- [x] **CV-306**: .gitignore: ignore `agents/*/reviews/` (runtime review records)
  - **Priority:** MEDIUM
  - Files: `.gitignore`
  - Spec: CV-REQ-037
  - Gaps: D5-03
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: `git check-ignore -q agents/sdlc-reviewer/reviews/70.md` exits 0
  - Parallel: yes
  - Complexity: S

- [x] **CV-307**: project.json.template: document `allowedExtensions` (empty array disables)
  - **Priority:** MEDIUM
  - Files: `agents/project.json.template`
  - Spec: CV-REQ-032
  - Gaps: D5-07
  - Agent: sdlc-documentarian
  - Lane: hermes
  - Test: template parses as JSON and has `allowedExtensions: []`
  - Parallel: yes
  - Complexity: S

- [x] **CV-308**: scaffoldBugChange(task, {templatesDir, changesDir}) in seed-queue.mjs: create openspec/changes/bug-<id>/{proposal.md,tasks.md,status.json} from the templates with readiness `draft`, embedding task id, title, last failure; idempotent
  - **Priority:** MEDIUM
  - Files: `agents/seed-queue.mjs, agents/__tests__/seed-queue-routing.test.mjs`
  - Spec: CV-REQ-036
  - Gaps: D1-03
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: tmp dirs: dir created with readiness draft; second call leaves files byte-identical
  - Parallel: yes
  - Complexity: M

- [x] **CV-309**: review-hook.mjs: `install --pre-only` installs only the pre-commit hook, idempotently
  - **Priority:** MEDIUM
  - Files: `agents/review-hook.mjs, agents/__tests__/gates-enforce.test.mjs`
  - Spec: CV-REQ-030
  - Gaps: D5-01
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: tmp git repo: install --pre-only creates .git/hooks/pre-commit and no post-commit; second run leaves it byte-identical
  - Parallel: yes
  - Complexity: S

- [x] **CV-310**: review-hook.mjs DEFAULT_CHECKLIST: empty-catch regex matches `catch {}`, `catch () {}`, `catch (e) {}`; does not match `catch (e) { log(e) }`
  - **Priority:** MEDIUM
  - Files: `agents/review-hook.mjs, agents/__tests__/gates-enforce.test.mjs`
  - Spec: CV-REQ-031
  - Gaps: D5-02
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: staged-diff fixtures for each form: first three exit 1, last exits 0
  - Parallel: blocked-by CV-309
  - Complexity: S

- [ ] **CV-311**: review-hook.mjs: add advisory `fn-length` (> 50 lines) and `param-count` (> 4) items using four-layer `scanFunctionMetrics`, applied only to functions overlapping staged added lines
  - **Priority:** MEDIUM
  - Files: `agents/review-hook.mjs, agents/__tests__/gates-enforce.test.mjs`
  - Spec: CV-REQ-031
  - Gaps: D5-02
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: staged 60-line function -> exit 0 with `fn-length` warning; untouched long function elsewhere -> no warning
  - Parallel: blocked-by CV-303, CV-310
  - Complexity: M

- [ ] **CV-312**: review-hook.mjs check-staged: when project.json `allowedExtensions` is non-empty, block added files (diff-filter=A) with other extensions; exempt dotfiles and extensionless files
  - **Priority:** MEDIUM
  - Files: `agents/review-hook.mjs, agents/__tests__/gates-enforce.test.mjs`
  - Spec: CV-REQ-032
  - Gaps: D5-07
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: allowed [".mjs",".md"]: adding a.py exits 1; adding b.mjs exits 0; empty list exits 0
  - Parallel: blocked-by CV-310, CV-307
  - Complexity: S

- [x] **CV-313**: hermes-drain.sh: after the clone sync, run `node agents/review-hook.mjs install --pre-only` in the drain clone; abort the pass with a logged reason on failure
  - **Priority:** MEDIUM
  - Files: `agents/hermes-drain.sh, tests/hermes-drain.test.mjs`
  - Spec: CV-REQ-030
  - Gaps: D5-01
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: hermes-drain test asserts the script text contains the install call after the sync step and an abort path
  - Parallel: blocked-by CV-309
  - Complexity: S

- [x] **CV-314**: Install the pre-commit hook once in ~/agentic-sdlc (`node agents/review-hook.mjs install --pre-only`)
  - **Priority:** MEDIUM
  - Files: `.git/hooks/pre-commit (local, not tracked)`
  - Spec: CV-REQ-030
  - Gaps: D5-01
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: a staged `catch (e) {}` is refused by a real `git commit` in a scratch branch
  - Parallel: blocked-by CV-310
  - Complexity: S

- [x] **CV-315**: drain-prompt.md: add step before commit `node agents/review-hook.mjs check-staged`; on exit 1 fix the named violations and retry at most twice, then mark the task failing
  - **Priority:** MEDIUM
  - Files: `agents/drain-prompt.md, tests/hermes-drain.test.mjs`
  - Spec: CV-REQ-030
  - Gaps: D5-01
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: hermes-drain test asserts the prompt contains `check-staged` before the commit step
  - Parallel: blocked-by CV-313
  - Complexity: S

- [x] **CV-316**: drain-prompt.md: add memory recall (`node agents/memory-manager.mjs recall <agent>`) before work and record (`record <agent> recent "<learning>"`) after, including on every failing outcome; skip without error if the agent has no memory dir
  - **Priority:** MEDIUM
  - Files: `agents/drain-prompt.md, tests/hermes-drain.test.mjs`
  - Spec: CV-REQ-033
  - Gaps: D6-02
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: hermes-drain test asserts both commands appear, recall before record
  - Parallel: blocked-by CV-315
  - Complexity: M

- [ ] **CV-317**: drain-prompt.md: add tests-first and `never modify a committed test` rule (needs-human with the test path) and the ambiguous-verb data-safety rule (no named scope -> needs-human)
  - **Priority:** MEDIUM
  - Files: `agents/drain-prompt.md, tests/hermes-drain.test.mjs`
  - Spec: CV-REQ-034, CV-REQ-038
  - Gaps: D1-07, D1-10
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: hermes-drain test asserts the exact phrases `never modify a committed test` and `named scope`
  - Parallel: blocked-by CV-316, CV-301, CV-302
  - Complexity: S

- [x] **CV-318**: queue-drainer.mjs: add `registerFailure(task)` (retryCount+1; at 3 set status blocked, blockedReason retry-cap, call notifyHumanTask once); call it on `complete <id> failing` and on stale-claim release
  - **Priority:** MEDIUM
  - Files: `agents/queue-drainer.mjs, agents/__tests__/queue-drainer-retry.test.mjs`
  - Spec: CV-REQ-035
  - Gaps: D7-05
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: new test: third failure -> blocked + one human task; first two -> still pending; replay of the same release does not double count
  - Parallel: yes
  - Complexity: M

- [ ] **CV-319**: queue-drainer.mjs `complete <id> failing`: call `scaffoldBugChange` (from seed-queue.mjs) and raise a triage human task; align drain-prompt retry wording to 3 attempts
  - **Priority:** MEDIUM
  - Files: `agents/queue-drainer.mjs, agents/drain-prompt.md, agents/__tests__/queue-drainer-retry.test.mjs`
  - Spec: CV-REQ-036, CV-REQ-035
  - Gaps: D1-03, D7-05
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: failing a task creates bug-<id>/ with readiness draft; drain-prompt contains `3 attempts`
  - Parallel: blocked-by CV-318, CV-308, CV-317
  - Complexity: M

- [x] **CV-320**: pr-auto-review.mjs: count rejections per FIX task (`attempts`); at the third create a human task instead of another FIX task (upsertFixTaskInClone)
  - **Priority:** MEDIUM
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-035
  - Gaps: D7-05
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: buildFixTask/upsert with existing.attempts = 2 -> human task, no new FIX file
  - Parallel: blocked-by CV-318
  - Complexity: M

- [x] **CV-321**: pr-auto-review.mjs: make buildReviewPrompt ask for `[critical]`, `[major]`, `[minor]` per issue; add `writeReviewRecord(pr, verdict)` writing agents/sdlc-reviewer/reviews/<pr>.md (overwrite per PR); parseVerdict defaults untagged issues to [minor]
  - **Priority:** MEDIUM
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-037
  - Gaps: D5-03
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: rejected verdict with two issues -> reviews/70.md has one [major] and one [minor]; rerun overwrites
  - Parallel: blocked-by CV-306, CV-305, CV-233
  - Complexity: M

- [ ] **CV-322**: pattern-hunt.mjs findReviewsDir(): prefer agents/sdlc-reviewer/reviews when it exists
  - **Priority:** MEDIUM
  - Files: `agents/pattern-hunt.mjs, agents/__tests__/pattern-hunt-clustering.test.mjs`
  - Spec: CV-REQ-037
  - Gaps: D5-03
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: with a tmp agents dir containing sdlc-reviewer/reviews, findReviewsDir returns it (export the function for the test)
  - Parallel: blocked-by CV-321
  - Complexity: S

- [x] **CV-323**: BUG (2026-11-09): pr-auto-review.mjs — unsafe-scope PRs and FIX tasks blocked for a human (3rd rejection or machinery) never reached the Claude review queue, so `list-flagged` was empty while PRs #115 and #133 waited. Both now `queueFlaggedPr` (one notice; upsertFixTaskInClone no longer notifies separately).
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-100, CV-REQ-103
  - Lane: interactive
  - Test: reviewPr on agents/secrets.mjs → one open queue entry; fileFixTask with a blocked task twice → one entry, one notice

- [x] **CV-324**: BUG (2026-11-09): pr-auto-review.mjs — an empty `gh pr diff` reached the model, which rejected "no diff content provided" and filed FIX tasks for unjudged PRs (3 in the log). Empty diff → `llm-unavailable`, no model call, no record, no FIX.
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-037
  - Lane: interactive
  - Test: reviewPr with getDiff → '' never calls llmReview and writes no reviews/<pr>.md

- [x] **CV-325**: pattern-hunt.mjs — categories from real drain rejections (scope-creep, test-weakening, regex-fragility, stray-artifacts, review-infra); `other-*` and review-infra never count as recurring (three unrelated [major]s are not a pattern); reviewer-name-agnostic `_Reviewed by … at …_`; `__isMainModule` guard + exports.
  - Files: `agents/pattern-hunt.mjs, agents/__tests__/pattern-hunt-categories.test.mjs`
  - Spec: CV-REQ-037
  - Lane: interactive
  - Test: verbatim log reasons map to named categories; unclassified/infra issues in 3 reviews → no recurring pattern

- [x] **CV-326**: BUG (2026-11-09): drain-trespass-guard.sh reverted ANY tracked edit made in the live checkout during a drain run — an interactive session's edits and the weekly REM-sleep memory writes were destroyed and reported as worker trespass. Every restored change is now saved to `<outbox>/<backup>-<checkout>.patch` before restore.
  - Files: `agents/drain-trespass-guard.sh, tests/drain-trespass-guard.test.mjs`
  - Lane: interactive
  - Test: an edit during the run is restored AND `git apply <patch>` brings it back; tests write patches to GUARD_BACKUP_DIR, never ~/hermes-outbox

- [x] **CV-327**: BUG (2026-11-09): tests/pr-auto-review.test.mjs and tests/hermes-drain.test.mjs printed their summary mid-file with a synchronous runner — async tests and tests declared after the summary could fail without failing the suite (9 tests in pr-auto-review were uncounted). Runner now awaits each test and summarizes last.
  - Files: `tests/pr-auto-review.test.mjs, tests/hermes-drain.test.mjs`
  - Lane: interactive
  - Test: 59 counted in pr-auto-review (was 50); a deliberately failing late test now exits 1

- [x] **CV-328**: BUG (2026-11-09): health-check process-erosion matched cycle type `daily|weekly|monthly`, but the cycles record `daily-review|weekly-review` — every cycle read `never-run` forever (71 daily + 13 weekly entries ignored), a permanent false alarm. Added `cycleKind()`; monthly-review now records `monthly-review` in pm/cycle-history.json (it recorded nothing).
  - Files: `agents/health-check.mjs, agents/cycles/monthly-review.mjs, tests/health-check.test.mjs, agents/__tests__/monthly-review.test.mjs`
  - Spec: CV-REQ-012
  - Lane: interactive
  - Test: live-shaped history → only `monthly never-run`; after recordMonthlyHistory → ok

### Phase 4: Release manager

Capability: release-manager. pr-auto-review.mjs and queue-drainer.mjs edits are interactive; the cycle detector is hermes.

- [x] **CV-401**: pr-auto-review.mjs hardGate: run `git merge --no-commit --no-ff origin/<base>` in the temp worktree before the test command; conflict -> gate-failed reason `merge-conflict-with-base`; remove the worktree in every outcome
  - **Priority:** MEDIUM
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-050
  - Gaps: D4-03
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: temp git repo fixture: branch behind base merges and tests run on merged tree; conflicting branch -> gate-failed and tests not run
  - Parallel: yes
  - Complexity: M

- [x] **CV-402**: pr-auto-review.mjs: export `classifyDomain(files)` (infra: .github, scripts, *.sh, systemd, cron-schedule, package.json; backend: agents/*.mjs, lib; frontend: *.tsx, *.css, ui/web/components; docs-tests: *.md, tests) and `DOMAIN_ORDER`
  - **Priority:** MEDIUM
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-051
  - Gaps: D4-01
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: files [agents/a.mjs, README.md] -> backend; [.github/x.yml, agents/a.mjs] -> infra
  - Parallel: blocked-by CV-401
  - Complexity: S

- [x] **CV-403**: pr-auto-review.mjs: export `orderPrs(prs)` (domain rank, then additions+deletions ascending, then number) and replace the `sort((a,b)=>a.number-b.number)` site; fetch files/sizes with `gh pr view --json files,additions,deletions`; fetch failure -> number order + log
  - **Priority:** MEDIUM
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-051
  - Gaps: D4-01
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: PR 9 frontend/20 lines and PR 12 infra/500 lines -> 12 first; fetch failure -> [9,12]
  - Parallel: blocked-by CV-402
  - Complexity: M

- [x] **CV-404**: pr-auto-review.mjs: export `findOverlaps(prs)` returning [{later, earlier, files}] using the merge order
  - **Priority:** MEDIUM
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-052
  - Gaps: D4-02
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: two PRs sharing a file -> later listed; disjoint -> []
  - Parallel: blocked-by CV-403
  - Complexity: S

- [x] **CV-405**: pr-auto-review.mjs reviewPr: for an overlapping later PR post one marker comment (idempotent), log action `deferred-overlap`, do not count as rejection or create a FIX task
  - **Priority:** MEDIUM
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-052
  - Gaps: D4-02
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: second pass posts no second comment; no FIX task created; after earlier PR merges the later is reviewed
  - Parallel: blocked-by CV-404
  - Complexity: M

- [x] **CV-406**: pr-auto-review.mjs: export `formatChangelogEntry({date,pr,subject,domain})` and `appendChangelog(path, entry)` (create with `# Changelog` header; group under `## <date>`; idempotent per PR number)
  - **Priority:** MEDIUM
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-053
  - Gaps: D4-04
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: tmp CHANGELOG.md: first call creates header and entry; second identical call adds nothing
  - Parallel: blocked-by CV-403
  - Complexity: S

- [x] **CV-407**: pr-auto-review.mjs: after a successful squash-merge call appendChangelog inside the existing completeTaskInClone commit/push path (no new push path)
  - **Priority:** MEDIUM
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-053
  - Gaps: D4-04
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: merge flow with injected gh/git runners: CHANGELOG.md is part of the same commit as the queue completion
  - Parallel: blocked-by CV-406
  - Complexity: M

- [ ] **CV-408**: seed-queue-from-openspec.mjs: export `detectBlockedByCycle(tasks)` (DFS; self-reference, 2-cycles, longer; unknown ids ignored; returns member ids per cycle)
  - **Priority:** MEDIUM
  - Files: `agents/seed-queue-from-openspec.mjs, tests/seed-queue-from-openspec.test.mjs`
  - Spec: CV-REQ-054
  - Gaps: D4-05
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: A<->B -> [[A,B]]; self-block -> [[A]]; DAG -> []; unknown blockedBy ignored
  - Parallel: blocked-by CV-208
  - Complexity: S

- [ ] **CV-409**: seed-queue-from-openspec.mjs: skip tasks in a blockedBy cycle with reason `blockedBy-cycle` and print the cycle
  - **Priority:** MEDIUM
  - Files: `agents/seed-queue-from-openspec.mjs, tests/seed-queue-from-openspec.test.mjs`
  - Spec: CV-REQ-054
  - Gaps: D4-05
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: fixture with a 2-cycle: neither seeded, output names both ids
  - Parallel: blocked-by CV-408
  - Complexity: S

- [ ] **CV-410**: queue-drainer.mjs showStatus: warn `CYCLE: A -> B -> A` for blockedBy cycles among queued tasks (use detectBlockedByCycle)
  - **Priority:** MEDIUM
  - Files: `agents/queue-drainer.mjs, agents/__tests__/queue-drainer-cycles.test.mjs`
  - Spec: CV-REQ-054
  - Gaps: D4-05
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: new test: status output over a 2-cycle fixture contains `CYCLE`
  - Parallel: blocked-by CV-408
  - Complexity: S

### Phase 5: Claude review lane

Capability: claude-review-lane. Queue and skill first; the headless timer (CV-REQ-104) is optional, default OFF, and decision-gated.

- [x] **CV-501**: Create agents/schemas/claude-review-queue.schema.json for entries {pr, branch, headSha, reasons[], flaggedAt, notifiedAt, status in open|resolved|superseded}
  - **Priority:** MEDIUM
  - Files: `agents/schemas/claude-review-queue.schema.json, agents/__tests__/task-schema.test.mjs`
  - Spec: CV-REQ-100
  - Gaps: -
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: valid entry passes schema-validator.mjs; unknown status and missing headSha rejected
  - Parallel: yes
  - Complexity: S
  - Notes: Follow the style of agents/schemas/task.schema.json.

- [x] **CV-502**: pr-auto-review.mjs: add `enqueueClaudeReview(entry)` upserting pm/claude-review-queue.json keyed by pr+headSha; a new head SHA marks the older entry superseded
  - **Priority:** MEDIUM
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-100
  - Gaps: -
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: tmp pm dir: same pr+sha twice -> one entry; new sha -> old superseded, new open
  - Parallel: blocked-by CV-501
  - Complexity: M

- [x] **CV-503**: pr-auto-review.mjs: on action `flagged` call enqueueClaudeReview and send one Telegram notice via notify.mjs sendNotification; set notifiedAt only on success; never throw
  - **Priority:** MEDIUM
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-100
  - Gaps: -
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: injected notifier called once across 3 passes; failing notifier leaves notifiedAt null and the next pass retries
  - Parallel: blocked-by CV-502
  - Complexity: M

- [x] **CV-504**: pr-auto-review.mjs alreadyReviewed/reviewPr: skip a PR whose pr+headSha is an open queue entry with no LLM call and no worktree; log `skip-awaiting-claude` only the first time
  - **Priority:** MEDIUM
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-101
  - Gaps: -
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: 3 passes over a queued PR: LLM stub called 0 times, exactly one log line
  - Parallel: blocked-by CV-503
  - Complexity: S

- [x] **CV-505**: pr-auto-review.mjs reconcile: mark queue entries `resolved` when the PR is merged or closed on GitHub
  - **Priority:** MEDIUM
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-101
  - Gaps: -
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: gh stub returns merged for a queued PR -> entry resolved on the next pass
  - Parallel: blocked-by CV-504
  - Complexity: S

- [x] **CV-506**: pr-auto-review.mjs CLI: add `list-flagged` (prints open entries) and `resolve-flagged <pr> <merged|closed|changes-requested>`
  - **Priority:** MEDIUM
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-102
  - Gaps: -
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: list prints only open entries; resolve sets resolved + resolvedBy/outcome; unknown outcome exits 1
  - Parallel: blocked-by CV-505
  - Complexity: S

- [x] **CV-507**: Create skills/sdlc-review-flagged/SKILL.md (frontmatter name/description; steps: list-flagged; scratch worktree; merge origin/main; npm test; read the FLAG_PATHS diffs fully; merge/changes-requested/close; gh pr comment; resolve-flagged; remove worktree; no API, no merging on red tests)
  - **Priority:** MEDIUM
  - Files: `skills/sdlc-review-flagged/SKILL.md`
  - Spec: CV-REQ-102
  - Gaps: -
  - Agent: sdlc-documentarian
  - Lane: hermes
  - Test: covered by CV-508
  - Parallel: blocked-by CV-506
  - Complexity: M
  - Notes: Model on skills/sdlc-inbox/SKILL.md.

- [x] **CV-508**: Create tests/sdlc-review-flagged-skill.test.mjs modelled on tests/sdlc-inbox-skill.test.mjs
  - **Priority:** MEDIUM
  - Files: `tests/sdlc-review-flagged-skill.test.mjs`
  - Spec: CV-REQ-102
  - Gaps: -
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: asserts frontmatter, `pm/claude-review-queue.json`, `list-flagged`, `resolve-flagged`, a `git merge` step, and a no-API statement
  - Parallel: blocked-by CV-507
  - Complexity: S

- [x] **CV-509**: pr-auto-review.mjs resolve-flagged `changes-requested`: create a FIX-<task> via buildFixTask/upsertFixTaskInClone from the supplied comment (subject to the 3-attempt cap); lane-blocked + human task when the Files hit interactive machinery
  - **Priority:** MEDIUM
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-103
  - Gaps: -
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: changes-requested creates one FIX task and resolves the entry; replay creates none
  - Parallel: blocked-by CV-506, CV-320
  - Complexity: M

- [x] **CV-510**: docs/RUNBOOK.md: add "Flagged PRs (Claude review lane)" section: where the queue lives, how the notice looks, how to run /sdlc-review-flagged, how to clear a stuck entry
  - **Priority:** MEDIUM
  - Files: `docs/RUNBOOK.md`
  - Spec: CV-REQ-102
  - Gaps: -
  - Agent: sdlc-documentarian
  - Lane: hermes
  - Test: RUNBOOK contains `sdlc-review-flagged` and `pm/claude-review-queue.json` (grep in tests/planning-templates.test.mjs)
  - Parallel: blocked-by CV-507
  - Complexity: S

- [ ] **CV-511**: OPTIONAL (default OFF, needs Bryce decision): pr-auto-review.mjs `claude-review-headless --max N`: no-op unless project.json claudeReview.headless.enabled; runs `claude -p` against open entries; maxPerDay (default 2) counted in pm/claude-review-usage.json; exit 0 with log if `claude` not on PATH; comments only, never merges
  - **Priority:** MEDIUM
  - Files: `agents/pr-auto-review.mjs, tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-104
  - Gaps: -
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: disabled -> no spawn; enabled with maxPerDay 2 and 2 used -> no spawn; spawn runner stub receives `claude -p`
  - Parallel: blocked-by CV-506; decision "claude -p headless timer"
  - Complexity: M

- [ ] **CV-512**: OPTIONAL (default OFF): cron-schedule.json entry `claude-review-headless` with `enabled:false`; reinstall timers
  - **Priority:** MEDIUM
  - Files: `agents/cron-schedule.json, tests/scheduler-install.test.mjs`
  - Spec: CV-REQ-104
  - Gaps: -
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: unit file installed and not enabled (injected systemctl runner)
  - Parallel: blocked-by CV-511, CV-114
  - Complexity: S

### Phase 6: Hygiene + conformance doc + verification

Hygiene tasks cite gap ids and carry no spec. Conformance rows are downgraded first, strengthened by test, and re-upgraded only after Phases 1-5 are verified.

- [ ] **CV-601**: Delete agents/adapters/llm/openai.mjs and azure-openai.mjs; first `grep -rn "adapters/llm/openai\|azure-openai" agents tests docs scripts` and remove each reference (load-adapter.mjs registration, tests, docs/adapter-guide.md)
  - **Priority:** LOW
  - Files: `agents/adapters/llm/openai.mjs, agents/adapters/llm/azure-openai.mjs, agents/adapters/load-adapter.mjs, tests/adapter-and-model-manager.test.mjs, docs/adapter-guide.md`
  - Spec: hygiene (no-OpenAI rule)
  - Gaps: D3-10 note
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: the grep above returns nothing; `npm test` green; loadAdapter("openai") throws a clear "unknown adapter" error
  - Parallel: yes
  - Complexity: M
  - Notes: Keep azure-foundry-claude.mjs (Claude on Azure, not OpenAI).

- [x] **CV-602**: cron-schedule.json (+ template): remove the `orchestration-sync` entry (paperclip retired 2026-09-07); disable its timer via scheduler-install
  - **Priority:** LOW
  - Files: `agents/cron-schedule.json, agents/templates/cron-schedule.json.template`
  - Spec: hygiene (paperclip retired)
  - Gaps: D3-10
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: no `paperclip` string in either file; `systemctl --user list-timers` has no orchestration-sync
  - Parallel: blocked-by CV-115
  - Complexity: S

- [ ] **CV-603**: Delete agents/adapters/orchestration/paperclip.mjs and agents/paperclip-sync.mjs; remove references (load-adapter.mjs, tests, docs); keep `.gitignore` entries
  - **Priority:** LOW
  - Files: `agents/adapters/orchestration/paperclip.mjs, agents/paperclip-sync.mjs, agents/adapters/load-adapter.mjs, tests/scheduler-install.test.mjs, docs/adapter-guide.md`
  - Spec: hygiene (paperclip retired)
  - Gaps: D3-10
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: `grep -rn "paperclip-sync\|orchestration/paperclip" agents tests docs scripts` returns nothing; `npm test` green
  - Parallel: blocked-by CV-602
  - Complexity: M
  - Notes: Do NOT touch the retirement notes in docs/ that explain why.

- [ ] **CV-604**: .gitignore: ignore `agents/versions/` (snapshots are local backups; git history is the record for tracked files); already-tracked snapshots stay
  - **Priority:** LOW
  - Files: `.gitignore`
  - Spec: hygiene (loop-health §7)
  - Gaps: D7-20
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: `git check-ignore -q agents/versions/2099-01-01/x` exits 0
  - Parallel: yes
  - Complexity: S

- [ ] **CV-605**: docs/curriculum-conformance.md: downgrade overstated rows to Partial with a one-line reason citing the gap id: weekly pattern hunt/REM (D5-04), behavior drift (D7-01/D7-02), Playwright runner (D7-04), "Pre-commit hooks" and "Senior review that can BLOCK" (D5-01)
  - **Priority:** LOW
  - Files: `docs/curriculum-conformance.md`
  - Spec: hygiene (conformance honesty)
  - Gaps: D7-21, D5-04, D5-01
  - Agent: sdlc-documentarian
  - Lane: hermes
  - Test: tests/curriculum-conformance.test.mjs still passes; the five rows read Partial
  - Parallel: yes
  - Complexity: S

- [ ] **CV-606**: tests/curriculum-conformance.test.mjs: add exported `isScheduledRow(row)` (text matches scheduled|weekly|daily|monthly|timer|cron) and `hasScheduleEvidence(row)` (owner list contains agents/cron-schedule.json or a path under agents/cycles/, or text contains sdlc-sched-); a Solid scheduled row without evidence fails
  - **Priority:** LOW
  - Files: `tests/curriculum-conformance.test.mjs`
  - Spec: hygiene (conformance honesty)
  - Gaps: D7-21
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: fixture rows: Solid + "weekly" + only pattern-hunt.mjs owner -> fails; with cron-schedule.json -> passes; real doc passes after CV-605
  - Parallel: blocked-by CV-605
  - Complexity: M

- [ ] **CV-607**: docs/curriculum-conformance.md: add a "Source" table linking each workshop (W1-W7, syllabus, long game, manic episode) to its docs/curriculum/*.md file
  - **Priority:** LOW
  - Files: `docs/curriculum-conformance.md, tests/curriculum-conformance.test.mjs`
  - Spec: hygiene (traceability)
  - Gaps: D7-21
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: test extracts docs/curriculum/*.md links from the doc and asserts each file exists
  - Parallel: blocked-by CV-606
  - Complexity: S

- [ ] **CV-608**: Verification: run `npm test`, `node agents/cycles/weekly-review.mjs --dry-run` (three steps listed), `node agents/health-check.mjs` (cycles check present), `node agents/scheduler-install.mjs install --dry-run`; record outputs in the change notes
  - **Priority:** LOW
  - Files: `openspec/changes/curriculum-v2-conformance/tasks.md`
  - Spec: all CYC
  - Gaps: -
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: all four commands exit 0 and show the expected lines
  - Parallel: blocked-by all Phase 1 and 3 tasks
  - Complexity: S

- [ ] **CV-609**: Verification: one real drain pass shows check-staged in its log and memory recall/record; force a flagged test PR and confirm one queue entry, one Telegram notice, and no re-review on the next two passes
  - **Priority:** LOW
  - Files: `pm/drain-logs, pm/claude-review-queue.json`
  - Spec: CV-REQ-030, CV-REQ-033, CV-REQ-100, CV-REQ-101
  - Gaps: -
  - Agent: Bryce + Claude Code (interactive)
  - Lane: interactive
  - Test: drain log contains `check-staged`; queue has exactly one open entry; pr-auto-review.log has one skip-awaiting-claude line
  - Parallel: blocked-by CV-010, CV-316, CV-504
  - Complexity: M

- [ ] **CV-610**: docs/curriculum-conformance.md: re-upgrade the rows downgraded in CV-605 to Solid, adding agents/cron-schedule.json or agents/cycles/ to owners; run the strengthened test
  - **Priority:** LOW
  - Files: `docs/curriculum-conformance.md`
  - Spec: hygiene (conformance honesty)
  - Gaps: D7-21
  - Agent: sdlc-documentarian
  - Lane: hermes
  - Test: tests/curriculum-conformance.test.mjs passes with the rows Solid
  - Parallel: blocked-by CV-608, CV-609, CV-606
  - Complexity: S

- [ ] **CV-611**: Update agent memory and archive notes: write a recent-memory entry summarising this change for sdlc-developer
  - **Priority:** LOW
  - Files: `agents/sdlc-developer/memory/recent.json`
  - Spec: hygiene (done checklist)
  - Gaps: -
  - Agent: sdlc-developer
  - Lane: hermes
  - Test: `node agents/memory-manager.mjs recall sdlc-developer` shows the entry
  - Parallel: blocked-by CV-610
  - Complexity: S

---

### Phase 7: Decisions 2026-11-03 (Bryce)

Spec: `specs/decisions-2026-11-03.md`. Hermes builds the code against mocks; the interactive tasks are installs and wiring on this machine.

- [x] **CV-701**: Add `reportsTo` and `delegatesTo` fields to agent front matter and an `org` subcommand to the agent registry
  - **Priority:** MEDIUM
  - Files: `agents/templates/AGENT.md.template`, `agents/agent-registry.mjs`, `tests/agent-registry-org.test.mjs` (new)
  - Spec: CV-REQ-110
  - Gaps: D3-10
  - Lane: hermes
  - Test: fixture of 3 agents prints a tree rooted at `board`; a 2-agent `reportsTo` cycle exits 1; missing `reportsTo` defaults to `board`
  - Complexity: M

- [x] **CV-702**: Route escalation through the `reportsTo` chain before the board
  - **Priority:** MEDIUM
  - Files: `agents/SHARED_PROTOCOL.md`, `agents/templates/SHARED_PROTOCOL.md.template`, `framework/agent-lifecycle.md`
  - Spec: CV-REQ-110
  - Gaps: D3-10
  - Lane: hermes
  - Test: `node agents/test-behavior.mjs --framework` still passes; the protocol text names `reportsTo`
  - Parallel: blocked-by CV-701
  - Complexity: S

- [x] **CV-703**: Add a `report-error` subcommand to `seed-queue.mjs` that dedups error events into one `prod-error-<hash>` task
  - **Priority:** MEDIUM
  - Files: `agents/seed-queue.mjs`, `tests/report-error.test.mjs` (new)
  - Spec: CV-REQ-111
  - Gaps: D1-04
  - Lane: hermes
  - Test: 50 identical JSONL events on stdin give one task with `occurrences: 50`; crossing 10 sets HIGH and 100 sets CRITICAL; the text passes through `screenExternalInput` from `agents/red-team-tester.mjs`
  - Complexity: M

- [x] **CV-704**: Add error-source adapters (jsonl file, journalctl, `vercel logs`, `supabase` logs) and an `errorSources[]` field per project in portfolio.json
  - **Priority:** MEDIUM
  - Files: `agents/error-sources.mjs` (new), `agents/portfolio.mjs`, `tests/error-sources.test.mjs` (new)
  - Spec: CV-REQ-111
  - Gaps: D1-04
  - Lane: hermes
  - Test: each adapter is unit-tested against a recorded fixture of its CLI output (no live CLI calls); `portfolio.mjs validate` accepts and type-checks `errorSources`
  - Parallel: blocked-by CV-703
  - Complexity: M

- [ ] **CV-705**: Wire error intake onto a timer for every project with `errorSources`, and switch Hermes TTS from cloud Edge to local Piper
  - **Priority:** MEDIUM
  - Files: `agents/cron-schedule.json`, `~/.hermes/config.yaml`
  - Spec: CV-REQ-111, CV-REQ-114
  - Lane: interactive
  - Test: one tick creates or updates a `prod-error-*` task from a real source; `hermes` speaks through the local voice with no network call
  - Parallel: blocked-by CV-704, CV-709
  - Complexity: S

- [ ] **CV-706**: Add `agents/secrets.mjs` to resolve a credential from VaultWarden through the `bw` CLI, falling back to env/.env
  - **Priority:** MEDIUM
  - Files: `agents/secrets.mjs` (new), `tests/secrets.test.mjs` (new)
  - Spec: CV-REQ-112
  - Gaps: D1-17
  - Lane: hermes
  - Test: with a stub `bw` on PATH the value comes from the vault; with no `bw` the env fallback is used and the warning never contains the value; a session past its TTL is re-unlocked
  - Complexity: M

- [ ] **CV-707**: Install self-hosted VaultWarden, move agent credentials into it, and point `resolveProviderKey` at `secrets.mjs`
  - **Priority:** MEDIUM
  - Files: `agents/model-manager.mjs`, host install
  - Spec: CV-REQ-112
  - Lane: interactive
  - Test: the drain completes one pass with `OPENROUTER_API_KEY` removed from `.env` and present only in the vault
  - Parallel: blocked-by CV-706
  - Complexity: M

- [x] **CV-708**: Add `agents/pii-scrub.py` (Presidio) with its `pii-scrub.mjs` wrapper, and call it from the LLM adapters before sending
  - **Priority:** MEDIUM
  - Files: `agents/pii-scrub.py` (new), `agents/pii-scrub.mjs` (new), `agents/adapters/llm/openrouter.mjs`, `requirements-nlp.txt`, `tests/pii-scrub.test.mjs` (new)
  - Spec: CV-REQ-113
  - Gaps: D5-11
  - Lane: hermes
  - Test: email, phone and name in a prompt become `<EMAIL>`, `<PHONE_NUMBER>` and `<PERSON>`; with Presidio missing, `customer-production` refuses and `scratch` warns (use a fake tier fixture)
  - Complexity: M

- [ ] **CV-709**: Add a per-agent `character.voice` setting and `agents/speak.mjs` for local Piper text-to-speech (output only)
  - **Priority:** LOW
  - Files: `agents/templates/core.json.template`, `agents/speak.mjs` (new), `tests/speak.test.mjs` (new)
  - Spec: CV-REQ-114
  - Gaps: D6-12
  - Lane: hermes
  - Test: with a stub `piper` on PATH, `speak.mjs <agent> hi` writes a wav using the agent's voice or the default; the test asserts no network module is imported
  - Complexity: S

- [ ] **CV-710**: Cover the Hermes drain's own model calls with a localhost scrubbing proxy, set as Hermes's OpenRouter base URL
  - **Priority:** LOW
  - Files: `agents/pii-proxy.mjs` (new), `~/.hermes-drain/config.yaml`
  - Spec: CV-REQ-113
  - Lane: interactive
  - Test: one drain pass succeeds through the proxy; proxy log shows scrubbed placeholders
  - Parallel: blocked-by CV-708
  - Complexity: M

### Phase 8: Agent identity on the autonomous path (Bryce, 2026-11-03)

Spec: `specs/agent-identity.md`. All interactive: these change the drain and the reviewer.

- [ ] **CV-801**: `queue-drainer.mjs next [--exclude ids]` — print the top ready task as JSON (FIX first)
  - **Priority:** HIGH
  - Files: `agents/queue-drainer.mjs`, `agents/__tests__/queue-drainer-next.test.mjs` (new)
  - Spec: CV-REQ-120
  - Lane: interactive
  - Test: ordering, exclusion, FIX precedence, empty queue prints nothing exit 0
  - Complexity: S

- [ ] **CV-802**: hermes-drain.sh selects the task + agent, embeds AGENT.md, passes `{{TASK_ID}}`/`{{AGENT}}`, optional `-m drainModel`
  - **Priority:** HIGH
  - Files: `agents/hermes-drain.sh`, `agents/drain-prompt.md`, `tests/hermes-drain.test.mjs`
  - Spec: CV-REQ-120, CV-REQ-121, CV-REQ-122
  - Lane: interactive
  - Test: dry-run prints the selected task + agent; prompt contains the agent's identity; no `-m` without drainModel
  - Parallel: blocked-by CV-801
  - Complexity: M

- [ ] **CV-803**: pr-auto-review runs as `sdlc-reviewer` (AGENT.md + memory recall in the prompt; optional reviewModel)
  - **Priority:** HIGH
  - Files: `agents/pr-auto-review.mjs`, `tests/pr-auto-review.test.mjs`
  - Spec: CV-REQ-123
  - Lane: interactive
  - Test: prompt contains the identity when the file exists; unchanged when missing; reviewModel honoured
  - Complexity: S

- [ ] **CV-804**: Tool-call trial for per-agent drain models — run one real drain per candidate model, set `drainModel` only for passers
  - **Priority:** MEDIUM
  - Files: `agents/budget.json`
  - Spec: CV-REQ-122
  - Lane: interactive
  - Test: the trial drain opens a PR with valid tool calls end-to-end
  - Parallel: blocked-by CV-802
  - Complexity: S

## Completion Criteria

- [ ] All hermes-lane tasks merged via the drain; all interactive-lane tasks merged by a Claude Code session
- [ ] `npm test` passes, including `test-behavior.mjs --drift` and the strengthened conformance test
- [ ] `systemctl --user list-timers 'sdlc-sched-*'` shows weekly/monthly cycles; `pm/cycle-history.json` gains a weekly entry that ran the three steps
- [ ] A flagged PR produces exactly one queue entry and one Telegram notice (CV-609)
- [ ] docs/curriculum-conformance.md rows match what is wired (CV-610)

## Notes

Gap ids (D1-03 etc.) refer to the delta analyses summarised in proposal.md; `loop-health §N` refers to the 2026-11-03 loop health audit.
