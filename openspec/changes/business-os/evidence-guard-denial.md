# Evidence — env-guard denies a real customer-production write

**Date**: 2026-09-02
**Task**: T-304 (environment-tiering REQ-006)

## Command

```
$ node agents/env-guard.mjs check tally production write
```

## Result

```json
{
  "allowed": false,
  "tier": "customer-production",
  "reason": "write on customer-production environment \"production\" of \"tally\" requires approval — no approval presented",
  "requiresApproval": true,
  "notify": { "level": "denied", "project": "tally", "environment": "production",
              "operation": "write", "tier": "customer-production" }
}
exit=1
```

A Telegram alert was delivered on the first run; the second was suppressed by
`notify.mjs`'s error-signature dedupe (`seen 2x`), which confirms the first
went out.

A **read** against the same environment is permitted and recorded
(`allowed: true`, `notify.level: record`) — reads are not the risk, unlogged
mutations are.

## Sequencing note — recorded honestly

Design Decision 5 and REQ-006 sequence wave 2 *after* the guard. In practice
Bryce enabled wave 2 on 2026-09-02, before Phase 2 landed, as an explicit
"going for speed" decision. That was a low-exposure call rather than a lucky
one, for two reasons that were true at the time:

- `tally` — the only `customer-production` project — has `deploy.enabled: false`,
  so `deploy-reconcile` skipped it entirely on every tick (observed in the live
  run: `tally: deploy disabled — skip`).
- The other two deployable projects (`hermes-pilot`, `personal-website`) are
  self-owned, smoke-verified, and auto-rollback on failure.

The guard now exists and is wired in, so the ordering has converged on the
designed end state. What the change adds going forward is that tally could be
re-enabled without the exposure returning: REQ-004a makes the **tier override
local config**, so `approval: "none"` cannot be applied to a customer database.

## Live deploy-reconcile run, same day

```
[deploy-runner] tally: deploy disabled — skip
[deploy-runner] hermes-pilot: deploying 7fd814c2 — vercel --prod --yes
[deploy-runner] hermes-pilot: smoke verify FAILED (status 302) — rolling back
[deploy-runner] personal-website: deployed + verified 0555a404
```

The hermes-pilot 302 is Vercel SSO deployment protection redirecting the smoke
URL to `vercel.com/sso-api`; the deploy itself succeeded. Tracked separately —
it is a smoke-configuration defect, not a guard failure. It must NOT be "fixed"
by accepting 302 as success, which would make an auth wall look like a healthy
site.
