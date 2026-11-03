# Specs — cycles-wired

**Date**: 2026-11-03
**Author**: Claude with Bryce
**Status**: specs

Covers `agents/cycles/{daily,weekly,monthly}-review.mjs`, `agents/health-check.mjs`, `agents/test-behavior.mjs`,
`agents/maturity-assess.mjs`, `agents/browser-user-test.mjs`, `agents/cron-schedule.json`, `agents/scheduler-install.mjs`, `package.json`.

**Principle: a cycle that is described but does not run is worse than no cycle.** Every REQ below
is satisfied only when the named step is *invoked by a scheduled entry point* and a test proves the invocation.
Prefix `CYC`. Gap ids reference `docs/curriculum-conformance.md` delta analyses (D5-04 etc.).

---

## CV-REQ-010 — Weekly cycle runs pattern-hunt, REM sleep (similarity) and behavior tests

**Gaps:** D5-04, D7-03 | **Curriculum:** w6-agent-memory-evolution.md "Scheduled Maintenance"; long-game-operating-agent-teams.md "Weekly Refactor" phases 1-4

**Statement:** `agents/cycles/weekly-review.mjs` shall invoke, in order and non-fatally,
`pattern-hunt.mjs`, `rem-sleep.mjs --similarity` and `test-behavior.mjs --drift`, and report one PASS/FAIL line per step.

**Acceptance:**
- An exported `buildWeeklySteps({dryRun})` returns the three steps in that order; `dryRun` adds `--dry-run`
- An exported `runWeeklySteps(steps, runner)` continues after a failing step and returns every result
- `analyzePatterns()` reads the reviewer agent's `reviews/` directory (not a hard-coded `richmond/`)
- The `weekly-pattern-hunt` description in `cron-schedule.json` matches what the script does

**Scenarios:**
- WHEN the weekly cycle runs and `pattern-hunt.mjs` exits 1 THEN `rem-sleep.mjs` and `test-behavior.mjs` still run AND the summary shows `pattern-hunt: FAIL`
- WHEN run with `--dry-run` THEN each step receives `--dry-run` AND no memory file changes

**Complexity:** M | **Value:** HIGH | **Dependencies:** none

---

## CV-REQ-011 — Behavior baselines exist, are tracked, and drift is part of `npm test`

**Gaps:** D7-01, D7-02 | **Curriculum:** w7-continuous-improvement.md "Behavior Baselines", "Running Behavior Tests on Prompt Changes"

**Statement:** The baseline file shall live at a git-tracked path, be recorded for every live agent, and
`node agents/test-behavior.mjs --drift` shall be part of the `npm test` script.

**Acceptance:**
- `BASELINES_PATH` in `test-behavior.mjs` is `agents/behavior-baselines.json`; the legacy `pm/behavior-baselines.json` is read only as a fallback
- `agents/behavior-baselines.json` is committed with an entry per live agent
- `package.json` `test` script ends with `&& node agents/test-behavior.mjs --drift`
- Monthly review re-records the baseline only after the drift step passed

**Scenarios:**
- WHEN an agent's metric moves more than 20% from baseline THEN `--drift` exits 1 AND `npm test` fails
- WHEN no baseline exists for an agent THEN `--drift` prints `no baseline` for it and does not fail (new agents are not blocked)
- WHEN the monthly drift step fails THEN the baseline is NOT re-recorded

**Complexity:** M | **Value:** HIGH | **Dependencies:** none
**Notes:** `pm/` is gitignored, so the pre-existing path could never be committed. That, not a missing run, is why the guard was inert.

---

## CV-REQ-012 — Overdue cycles surface as process erosion

**Gaps:** D7-06 | **Curriculum:** long-game-operating-agent-teams.md "FM4 Process Erosion"

**Statement:** `health-check.mjs` shall compare `pm/cycle-history.json` against expected cadence and report
`degraded` with check name `process-erosion` when a cycle is overdue.

**Acceptance:**
- Exported pure `evaluateCycleCadence(history, now, limits)` with defaults daily 2d, weekly 8d, monthly 32d
- `runHealthCheck` includes a `cycles` check; overdue type named in `detail`
- A type with zero entries is `never-run` and `degraded` only when the oldest history entry is older than that type's limit
- Missing history file yields `degraded` with detail `no cycle history`, never a throw

**Scenarios:**
- WHEN the newest weekly entry is 9 days old THEN the check is `degraded` and detail names `weekly`
- WHEN all types are within limits THEN the check is `ok`

**Complexity:** S | **Value:** HIGH | **Dependencies:** none

---

## CV-REQ-013 — Monthly cycle writes a dated maturity report

**Gaps:** D7-20 | **Curriculum:** 00-syllabus.md "Maturity Model"

**Statement:** `maturity-assess.mjs` shall accept `--report` and write `pm/maturity-reports/<YYYY-MM-DD>.md`;
`monthly-review.mjs` shall run it.

**Acceptance:**
- `--report` creates the directory if absent and writes the same table the console shows
- `buildMonthlySteps({dryRun})` (exported, pure) includes the maturity step; dry-run skips the file write
- Re-running on the same day overwrites that day's file

**Scenarios:**
- WHEN monthly review runs THEN `pm/maturity-reports/<today>.md` exists and contains the dimension table

**Complexity:** S | **Value:** MEDIUM | **Dependencies:** none

---

## CV-REQ-014 — Every scheduled script is declared in `cron-schedule.json`

**Gaps:** D7-11, D7-03 | **Curriculum:** 00-syllabus.md "Iteration Cycles", "Key Tools" (discounted models)

**Statement:** `agents/cron-schedule.json` shall be the single declaration of scheduled framework scripts.
`model-manager-research` shall be declared; the legacy `pattern-hunt-weekly` and `rem-sleep-weekly` shall be
declared with `supersededBy: "weekly-pattern-hunt"` so `scheduler-install.mjs` does not install them and
disables the stray user units.

**Acceptance:**
- `scheduler-install.mjs` honours `supersededBy` (skip + disable existing unit) and `enabled: false` (install unit, do not enable)
- `orchestration-sync` (paperclip, retired) is not present (see hygiene task)
- A test asserts every `script` in the file resolves to an existing path under `agents/`

**Scenarios:**
- WHEN `scheduler-install.mjs install` runs THEN no `pattern-hunt-weekly.timer` or `rem-sleep-weekly.timer` remains enabled
- WHEN a schedule has `enabled:false` THEN its unit file exists and is not enabled

**Complexity:** M | **Value:** HIGH | **Dependencies:** CV-REQ-010 | **Lane:** interactive (scheduler)

---

## CV-REQ-015 — Browser user tests run from the daily cycle where a Playwright config exists

**Gaps:** D7-04 | **Curriculum:** w7-continuous-improvement.md "Playwright: Automated User Testing"

**Statement:** `daily-review.mjs` shall run `browser-user-test.mjs run` when the project has a Playwright config
and a generated spec, and record pass/fail plus the screenshot directory in the dashboard.

**Acceptance:**
- Exported `hasPlaywrightConfig(dir)` true for `playwright.config.{js,ts,mjs,cjs}`
- No config: the step is skipped with logged reason `no-playwright-config`, never an error
- A failing run is non-fatal for the cycle and appears as `FAIL` with the `pm/user-tests/<date>/` path

**Scenarios:**
- WHEN the project dir has `playwright.config.ts` and a spec THEN the dashboard shows a `## User tests` section with the result
- WHEN there is no config THEN the dashboard shows `skipped (no-playwright-config)`

**Complexity:** M | **Value:** MEDIUM | **Dependencies:** none

---

## CV-REQ-016 — Weekly architecture check

**Gaps:** D7-07 | **Curriculum:** long-game-operating-agent-teams.md "Weekly Refactor" phases 3, 5, 6

**Statement:** `weekly-review.mjs` shall print an architecture-check section flagging agents that are
underperforming, split candidates or idle, and shall snapshot agents when an `AGENT.md` changed since the last snapshot.

**Acceptance:**
- Pure `architectureCheck(metrics)`: `underperforming` = firstAttemptSuccessRate < 0.5 over >= 5 tasks; `split-candidate` = more than 6 routed domains; `idle` = zero tasks in 4 consecutive weeks
- Pure `agentMdChangedSinceSnapshot(agentsDir, versionsDir)` compares to the newest snapshot copy
- Snapshot runs only when it returns true

**Scenarios:**
- WHEN an agent has 5 tasks and 2 first-attempt successes THEN it is listed `underperforming`

**Complexity:** M | **Value:** MEDIUM | **Dependencies:** CV-REQ-010

---

## CV-REQ-017 — Capacity forecast

**Gaps:** D4-08 | **Curriculum:** capacity-estimation-roadmapping.md

**Statement:** The weekly cycle shall upsert a `## Capacity forecast` dashboard section: sum of pending
`estimatedTokens` divided by `dailyTokenBudget`, as "backlog drains in N days".

**Acceptance:**
- Pure `capacityForecast(tasks, budget)`; budget missing or zero returns `n/a`, never `Infinity`/`NaN`
- `upsertDashboardSection(title, body)` (exported from `daily-review.mjs`, imported by `weekly-review.mjs`) replaces an existing section of that title (idempotent)

**Scenarios:**
- WHEN pending tokens are 1,000,000 and the daily budget is 250,000 THEN output says 4 days

**Complexity:** S | **Value:** MEDIUM | **Dependencies:** CV-REQ-020 (owns the dashboard helper)

---

## CV-REQ-018 — Grooming report

**Gaps:** D4-09 | **Curriculum:** sprint-backlog-grooming.md

**Statement:** The weekly cycle shall list pending tasks lacking `estimatedTokens`, `acceptance_criteria` or `priority`, and tasks unclaimed for more than 30 days.

**Acceptance:** pure `groomingReport(tasks, now)` returns the four lists; section upserted as `## Grooming`; empty lists print `none`.

**Scenarios:** WHEN a pending task has no `acceptance_criteria` THEN it is listed under `missing acceptance`.

**Complexity:** S | **Value:** MEDIUM | **Dependencies:** CV-REQ-020

---

## CV-REQ-019 — PR reject rate vs maturity target

**Gaps:** D5-08 | **Curriculum:** w5-anti-pattern-detection.md "Six Sigma for AI"

**Statement:** The weekly cycle shall compute `prRejectRate` from `pm/pr-auto-review.log` (JSON lines) over the last 28 days and print it against the target for the framework's maturity level.

**Acceptance:**
- Rate = (`gate-failed` + `llm-rejected`) / (`merged` + those two), counting each (pr, sha) once; `skip`/`flagged` excluded
- Targets: level 0-1 30%, 2-3 10%, 4 1%, 5-6 0.1%
- Zero denominator prints `n/a`

**Scenarios:** WHEN the log has 1 merged and 1 `llm-rejected` THEN rate is 50%.

**Complexity:** S | **Value:** MEDIUM | **Dependencies:** CV-REQ-020

---

## CV-REQ-020 — OpenSpec status and bug metrics in the daily review

**Gaps:** D1-05, D1-06 | **Curriculum:** 00-syllabus.md "Reporting and Visibility"; w2-autonomous-workers.md "Bug Tracking with OpenSpec"

**Statement:** `daily-review.mjs` shall add to `pm/DASHBOARD.md` an `## OpenSpec status` table (per active change: phase, status, readiness, tasks done/total; plus active vs archived counts) and a `## Bug metrics` block (active vs archived `bug-*` and `prod-error-*` changes, resolution rate, pending vs completed `FIX-*` queue tasks).

**Acceptance:**
- Pure `openspecStatusTable(changesDir)` and `bugMetrics(changesDir, queueDir)`
- A change with no `status.json` or `tasks.md` renders `-` and does not throw
- Both sections are replaced, not duplicated, on re-run

**Scenarios:** WHEN `bug-X` is active and `bug-Y` archived THEN resolution rate is 50%.

**Complexity:** S | **Value:** MEDIUM | **Dependencies:** none (defines `upsertDashboardSection`)
