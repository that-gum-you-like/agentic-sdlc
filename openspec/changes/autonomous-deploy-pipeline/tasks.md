# Tasks — autonomous-deploy-pipeline

## Implementation

- [x] **T1**: `agents/deploy-runner.mjs` — reconciling state machine (marker diff, sha tokens, approval poll, clone refresh + .vercel copy, test gate, deployCmd, smoke verify, rollback handoff, notifications, `--project-dir`×N, `--dry-run`)
  - Complexity: M · Spec: REQ-001..005
- [x] **T2**: `agents/deploy-rollback.mjs` — prefer `deploy.rollbackCmd` (fallback legacy top-level)
  - Complexity: S · Spec: REQ-004
- [x] **T3**: `agents/pr-auto-review.mjs` — framework-pinned mutex (`SDLC_LOCK_DIR` override); post-merge detached runner kick; FLAG_PATHS += deploy surface
  - Complexity: S · Spec: REQ-006, REQ-007
- [x] **T4**: `agents/cron-schedule.json` (real) — all template jobs + `deploy-reconcile` (*/30); `agents/templates/cron-schedule.json.template` + `agents/templates/project.json.template` document the new job + deploy block
  - Complexity: S · Spec: REQ-008
- [x] **T5**: `~/tally/agents/project.json` — full deploy block, `enabled: false`, provider telegram
  - Complexity: S · Spec: REQ-008

## Verification

- [x] **T6**: `tests/deploy-runner.test.mjs` — parseApprovalCommand, decide() state machine (disabled/no-delta/terminal-tokens/needs-approval/approved-order), verify helper, arg parsing
  - Complexity: M · Spec: REQ-001..005
- [x] **T7**: `tests/deploy-rollback.test.mjs` — rollbackCmd source order
  - Complexity: S · Spec: REQ-004
- [x] **T8**: `tests/pr-auto-review.test.mjs` — FLAG_PATHS deploy surface; framework-pinned lock
  - Complexity: S · Spec: REQ-006, REQ-007
- [x] **T9**: `npm test` green; `deploy-runner --dry-run` on tally prints plan and exits 0 without side effects
  - Complexity: S · Spec: all

## Host

- [x] **T10**: Install Supabase CLI; rerun `scheduler-install.mjs install` (adds deploy-reconcile timer)
