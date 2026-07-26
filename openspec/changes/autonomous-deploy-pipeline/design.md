# Design — autonomous-deploy-pipeline

## Architecture: reconciling runner, not merge hook

`deploy-runner.mjs` is a **state reconciler**: each tick it compares
`origin/<baseBranch>` HEAD (the deploy target) with `pm/.last-deployed` (the
deployed state) and drives the delta through approval → test → deploy →
verify. The post-merge kick from `pr-auto-review` is only a latency
optimization; the 30-min reconcile timer is the correctness mechanism. Crashes,
skipped ticks, and manual merges all converge on the next tick.

## Tick state machine (per project)

```
target = rev-parse origin/<base>          (after git fetch)
1. deploy.enabled false        → exit 0 (log)
2. target == .last-deployed    → exit 0 (nothing to do)
3. .deploy-failed-<sha8> or .deploy-rejected-<sha8> exists
                               → exit 0 (terminal for this sha; new commit or
                                 manual token removal unblocks — RUNBOOK)
4. poll deploy bot (non-blocking getUpdates, offset-cursored)
     APPROVE <sha8> from TELEGRAM_CHAT_ID → write .deploy-approved-<sha8>
     REJECT  <sha8>                       → write .deploy-rejected-<sha8> + notify
5. no .deploy-approved-<sha8>:
     .deploy-pending-<sha8> absent → send approval request (Bot A message:
       project, sha8, subject line of the commit, "Reply APPROVE <sha8> to
       @deploy_bot") + write pending marker
     → exit 0 (wait for a later tick)
6. approved → cooldown gate (cooldownSeconds since last attempt) → refresh
   isolated deploy clone ~/.sdlc-deploy-clone-<project> at target; copy the
   project's .vercel/ link metadata into the clone
7. tests: npm ci + project testCmd in the clone (skippable only by explicit
   deploy.verifyTests: false). Fail → .deploy-failed-<sha8> + deployFailed. 
8. run deploy.deployCmd in the clone. Fail (incl. expired Vercel CLI auth) →
   .deploy-failed-<sha8> + deployFailed. NEVER auto-retried — a human clears it.
9. smoke verify: GET verify.smokeUrl until expectStatus or timeoutSeconds.
   Fail → deploy-rollback.mjs --reason (fires deployFailed/deployRolledBack)
   + .deploy-failed-<sha8>.
10. success → write .last-deployed = target, clear this sha's token files,
    deployComplete notification.
```

All sha-token files live in the PROJECT's `pm/` (deploy state is per-project);
the deploy-bot getUpdates offset cursor lives in the FRAMEWORK's `pm/`
(`.deploy-bot-offset` — one consumer stream shared by all projects).

## Why a second bot + file tokens for approval

Telegram allows one `getUpdates` consumer per bot; the Hermes gateway owns Bot
A's stream. Bot B exists solely for approvals so the poll is deterministic (no
LLM interpreting "yes"). Approvals are **sha-bound and single-use** (files named
by sha8, deleted after a successful deploy); an APPROVE for yesterday's commit
can never release today's. Multiple `--project-dir` args are processed
sequentially in ONE invocation, so the offset cursor has exactly one writer.

## Concurrency & locks

- Runner holds `pm/.sdlc-deploy.lock.d` (atomic mkdir, stale after 2h) in the
  project — one deploy at a time per project.
- `pr-auto-review` mutex moves from `<projectDir>/pm/` to the **framework**
  `pm/.sdlc-autonomous.lock.d` (env-overridable `SDLC_LOCK_DIR`), matching
  `hermes-drain.sh` — without this, a tally review and a framework drain could
  run concurrently, violating the host-wide single-autonomous-job invariant.
- The post-merge kick is `spawn(..., { detached: true, stdio: 'ignore' }).unref()`
  in try/catch: the merge outcome must never depend on the deploy path.

## Deploy clone (never the main repo, never the drain clone)

`~/.sdlc-deploy-clone-<project>`: deploys exactly `origin/<base>` — Bryce's
dirty working tree can't leak into production, and the drain clone's own
lifecycle (reset/claimed tasks) can't race the deploy. Vercel project linking
is file-based, so the runner copies `<project>/.vercel/` into the clone when
present; `vercel --prod --yes` then runs headless.

## Guardrails

- `deploy.enabled` opt-in per project; only `origin/<base>` is ever deployed.
- Approval required by default (`deploy.approval: "telegram"`); `"none"` is an
  explicit per-project choice (used by the pilot only if Bryce says so).
- Tests re-run in the deploy clone even though pr-auto-review already gated —
  manual merges and non-PR pushes get the same bar.
- FLAG_PATHS grows `agents/deploy-runner.mjs`, `agents/deploy-rollback.mjs`,
  `agents/cron-schedule.json`, `tests/deploy-runner.test.mjs` — a drain PR
  touching the deploy surface is flagged, never auto-merged.
- Failed deploys are terminal per sha (no retry loops on expired CLI auth);
  every transition notifies (Telegram + desktop via telegram-activation).

## deploy-rollback compatibility

`deploy-rollback.mjs` gains `project.deploy?.rollbackCmd` as the preferred
source with fallback to legacy top-level `rollbackCmd`; invoked by the runner
with `cwd` = deploy clone so `vercel rollback` sees the linked project.

## Host prerequisites

Supabase CLI installed (login token already at `~/.supabase/access-token`);
Vercel CLI already authenticated (user-level auth.json works for user units);
scheduler reinstall picks up the `deploy-reconcile` job.

## Non-goals

Browser E2E as deploy verification (HTTP smoke only — Tier-5 stays a listed
gap); multi-host deploys; deploy queues/environments (prod only); automatic
retry of failed deploys; enabling tally (one-flag flip, Bryce's call post-pilot).
