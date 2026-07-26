# Proposal: autonomous-deploy-pipeline

**Date**: 2026-07-26
**Author**: Claude (Fable 5) with Bryce
**Status**: proposed

---

## Problem

The autonomous loop ends at `git push` + auto-merge. Everything downstream of
merge is missing — the single largest gap between the framework and its stated
vision ("agents build **and ship** software"):

1. **No deploy execution anywhere.** `deploy-rollback.mjs` exists but no
   project configures `rollbackCmd`, and nothing ever runs a deploy command.
   The framework's own `doneChecklist` stops at `push`; the app-project default
   (`deploy` → `verify` → `notify`) is aspirational documentation.
2. **No post-deploy verification.** Nothing confirms a deployed site actually
   serves.
3. **Merged work silently accumulates undeployed** — tally deploys remain a
   manual `vercel --prod` on Bryce's laptop.
4. **`level-6-autonomous-activation` scored Deployment & Release 1.5/5** for
   exactly this reason.

## Proposed Solution

A **reconciling, approval-gated deploy runner** — not inline merge logic:

1. **`agents/deploy-runner.mjs`** (new, zero deps): per project, compares
   `origin/<base>` HEAD against a `pm/.last-deployed` marker. New commit ⇒
   request approval on Telegram ("Reply APPROVE <sha8> to the deploy bot"),
   then on a later tick with approval recorded: re-run the project's tests in
   an isolated deploy clone, run `deploy.deployCmd`, smoke-verify
   `deploy.verify.smokeUrl`, roll back via the existing `deploy-rollback.mjs`
   on failed verify, notify every step. Idempotent — safe to run every tick;
   also catches Bryce's manual merges.
2. **Sha-bound Telegram approvals** via a second bot (`TELEGRAM_DEPLOY_BOT_TOKEN`,
   created in `telegram-activation`): the runner does one non-blocking
   `getUpdates` poll per tick, accepts `APPROVE|REJECT <sha8>` only from
   `TELEGRAM_CHAT_ID`, and records tokens as files. Deterministic — no LLM, no
   gateway in the approval path.
3. **`deploy` block in project.json** (per-project, opt-in `enabled` flag):
   deployCmd / verify / rollbackCmd / baseBranch / approval / cooldown.
4. **`pr-auto-review.mjs`**: post-merge fire-and-forget kick of the runner
   (reconcile timer is the safety net); mutex pinned to the FRAMEWORK repo's
   `pm/` so multi-project reviews still serialize host-wide; guardrail
   FLAG_PATHS extended with the deploy surface.
5. **Real `agents/cron-schedule.json`** (template stays canonical for new
   installs): all existing jobs + `deploy-reconcile` every 30 min over the
   configured project list.
6. **tally wired dark**: full deploy block with `enabled: false` — flipping one
   flag onboards the first real project after the pilot proves the chain.

## Value Analysis

- **Closes the largest maturity gap** (Deployment & Release 1.5/5): the loop
  becomes pick → build → test → PR → merge → **deploy → verify → notify**.
- **Human control exactly where blast radius is real**: full autonomy through
  merge (already shipped and gated), a single Telegram tap before production.
- **Reconciliation beats hooks**: idempotent marker-diff survives crashes,
  retries on the next tick, and covers manual merges — no missed deploys, no
  double deploys (sha-bound single-use approval + per-project lock + cooldown).
- **Reuses shipped machinery**: deploy-rollback.mjs, notify.mjs triggers
  (deployComplete/deployFailed/deployRolledBack already recognized), the
  drain's clone-isolation pattern, scheduler-install.
- **Cost:** M. One new script + tests, three small edits, one config file.

## Companion Changes

- `telegram-activation` (prereq, shipped) — bots, env plumbing, notify hooks.
- `pilot-autonomous-replication` (next) — proves the full chain on a throwaway
  project with `deploy.enabled: true`.
