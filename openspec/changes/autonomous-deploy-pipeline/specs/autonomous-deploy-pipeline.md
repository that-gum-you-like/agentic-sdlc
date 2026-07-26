# Specs — autonomous-deploy-pipeline

## REQ-001 — Reconciling deploy runner

**Statement:** `deploy-runner.mjs` deploys the delta between `origin/<base>`
and `pm/.last-deployed`, is idempotent per tick, processes multiple
`--project-dir` args sequentially, and supports `--dry-run`.
**Acceptance:** decision-logic unit tests: disabled→no-op; target==marker→no-op;
unknown state never deploys.
**Complexity:** M · **Value:** closes the deploy gap

## REQ-002 — Sha-bound Telegram approval gate

**Statement:** With `deploy.approval: "telegram"` (default), no deploy runs
without a `.deploy-approved-<sha8>` token created from an `APPROVE <sha8>`
message sent by `TELEGRAM_CHAT_ID` to the deploy bot; `REJECT <sha8>` and
failure tokens are terminal for that sha; tokens are single-use (cleared on
success).
**Acceptance:** parseApprovalCommand tests (accept/reject/garbage/foreign
chat); decide() requires approval before deploy; approval for sha A never
releases sha B.
**Complexity:** M · **Value:** human gate at exactly the blast-radius boundary

## REQ-003 — Test gate before every deploy

**Statement:** The runner re-runs the project's `testCmd` in the isolated
deploy clone before `deployCmd`; failure marks the sha failed and never
deploys. Skippable only by explicit `deploy.verifyTests: false`.
**Acceptance:** decide() orders tests before deploy; test-failure path yields
`mark-failed`, not `deploy`.
**Complexity:** S · **Value:** manual merges get the same bar as PRs

## REQ-004 — Smoke verify + rollback

**Statement:** After deployCmd, the runner polls `verify.smokeUrl` until
`expectStatus` (default 200) or `timeoutSeconds` (default 60); on failure it
invokes `deploy-rollback.mjs --reason` (which fires deployFailed /
deployRolledBack) and marks the sha failed. `deploy-rollback.mjs` prefers
`deploy.rollbackCmd` over legacy top-level `rollbackCmd`.
**Acceptance:** verify helper unit tests (status match, timeout); rollback
source-order test in deploy-rollback.
**Complexity:** M · **Value:** bad deploys self-heal + notify

## REQ-005 — No retry loops on failed deploys

**Statement:** deployCmd failure (including expired CLI auth) writes
`.deploy-failed-<sha8>` and notifies deployFailed; the runner never re-attempts
that sha automatically. A cooldown (`cooldownSeconds`, default 600) separates
attempts on new shas.
**Acceptance:** decide() treats failed-token as terminal; cooldown blocks
immediate re-attempt.
**Complexity:** S · **Value:** no 30-min-loop hammering Vercel with a dead login

## REQ-006 — Host-global autonomous mutex in pr-auto-review

**Statement:** `pr-auto-review.mjs` takes its mutex in the FRAMEWORK repo's
`pm/.sdlc-autonomous.lock.d` (override: `SDLC_LOCK_DIR`) regardless of the
project under review, mutually exclusive with `hermes-drain.sh`.
**Acceptance:** unit/source test: lock path derived from the framework dir,
not the target project.
**Complexity:** S · **Value:** preserves the one-autonomous-job invariant multi-project

## REQ-007 — Post-merge kick + guardrail surface

**Statement:** After a successful squash-merge, pr-auto-review spawns the
runner detached, best-effort; FLAG_PATHS includes deploy-runner.mjs,
deploy-rollback.mjs, cron-schedule.json, and the runner's tests so drain PRs
touching the deploy surface are flagged, never auto-merged.
**Acceptance:** FLAG_PATHS membership test; kick is try/catch-guarded and
detached (source assertion).
**Complexity:** S · **Value:** low latency without weakening the review gate

## REQ-008 — Scheduled reconcile + per-project config

**Statement:** A real `agents/cron-schedule.json` carries all template jobs
plus `deploy-reconcile` (`*/30min`) invoking the runner over the configured
project list; `project.json.template` documents the `deploy` block; tally's
project.json carries a complete deploy block with `enabled: false`.
**Acceptance:** schedule loads and every cron translates (existing loadSchedule
test covers the real file path); template documents all deploy keys.
**Complexity:** S · **Value:** reconcile actually fires; onboarding is one flag
