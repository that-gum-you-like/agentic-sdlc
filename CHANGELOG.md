# Changelog

## 2026-11-04

- 2026-11-04 #97 feat(monthly-review): re-record behavior baseline after drift passes (CV-109) (backend)
- 2026-11-04 #98 feat(monthly-review): add maturity-assess.mjs --report step to buildMonthlySteps (CV-113) (backend)
- 2026-11-04 #99 feat(schemas): add claude-review-queue.schema.json (CV-501) (backend)

## 2026-11-03

- 2026-11-03 #83 docs(runbook): two-wave timer model, heartbeat, guard denials; hardGate headless git identity (T-703, merged after Claude review)
- 2026-11-03 #85 CV-116: Add hasPlaywrightConfig(dir) to browser-user-test.mjs (backend)
- 2026-11-03 #84 feat(health-check): add exported pure evaluateCycleCadence (CV-REQ-012) (backend)
- 2026-11-03 #86 feat(health-check): surface overdue cycles as process erosion (CV-111) (backend)
- 2026-11-03 #87 feat(CV-112): maturity-assess --report writes a dated maturity report (backend)
- 2026-11-03 #89 feat(cycles): export runStep from monthly-review.mjs for weekly cycle reuse (CV-101) (backend)
- 2026-11-03 #90 feat(cycles): openspecStatusTable in daily-review.mjs (CV-119) (backend)
- 2026-11-03 #91 feat(cycles): add bugMetrics to daily-review.mjs (CV-120) (backend)
- 2026-11-03 #92 feat(cycles): add exported buildWeeklySteps({dryRun}) to weekly-review.mjs (CV-102) (backend)
- 2026-11-03 #93 feat(cycles): add runWeeklySteps export + call from main() (CV-103) (backend)
- 2026-11-03 #94 fix(cycles): read weekly-review reviews from the sdlc-reviewer agent dir (CV-104) (backend)
- 2026-11-03 #95 CV-105: move BASELINES_PATH to agents/behavior-baselines.json (tracked) (backend)
- 2026-11-03 #96 refactor(monthly-review): extract buildMonthlySteps({dryRun}) from main() (backend)
