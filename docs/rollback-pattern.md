# Rollback Pattern — Auto-revert on Failed Deploy

**Last updated**: 2026-05-21
**Audience**: Project authors using the agentic-sdlc framework who deploy to production.

The framework can auto-revert a failed production deploy and notify you via your configured notification channel — but **only if you tell it how to roll back**. This doc explains how to wire `rollbackCmd` into your project.

---

## Why this matters

Without a configured rollback:
- Broken code stays in production for hours (until a human notices and manually reverts)
- Smoke test failures fire `deployFailed` but no auto-revert happens
- The framework's deploy pipeline's stage 8 (Rollback) exits 1 with "no rollback configured"

With a configured rollback:
- Smoke test failure (stage 5) or browser verify failure (stage 6) auto-fires `deploy-rollback.mjs`
- Previous version is back in production within ~1 minute of detection
- You get notified via your configured channel (WhatsApp, Slack, file)

---

## How it works

The framework provides:
- `agents/deploy-rollback.mjs` — the helper that reads `rollbackCmd` from your `project.json` and executes it
- Two notify.mjs triggers: `deployFailed` and `deployRolledBack`
- Pipeline template stages 8 and 9 documenting the pattern

You provide:
- The actual `rollbackCmd` (a shell command that rolls back YOUR hosting platform)
- Enabled triggers in `project.json` `notification.triggers`

---

## Step 1 — Add `rollbackCmd` to `agents/project.json`

```json
{
  "name": "my-project",
  "testCmd": "npm test",
  "rollbackCmd": "bash scripts/rollback.sh",
  "rollbackDebounce": 300,
  "notification": {
    "provider": "openclaw",
    "triggers": {
      "deployFailed": true,
      "deployRolledBack": true
    }
  }
}
```

`rollbackDebounce` (optional, default 300 seconds): minimum time between notification fires for repeat rollbacks. The rollback ALWAYS executes; debounce only suppresses notification spam during a flap cycle.

---

## Step 2 — Implement your `rollbackCmd`

The framework can't perform the rollback itself (every hosting platform is different). Here are common patterns:

### Vercel

```bash
#!/usr/bin/env bash
# scripts/rollback.sh
PROJECT_NAME="my-vercel-project"
PREV_DEPLOY=$(vercel ls "$PROJECT_NAME" --token "$VERCEL_TOKEN" | sed -n '3p' | awk '{print $2}')
vercel promote "$PREV_DEPLOY" --token "$VERCEL_TOKEN" --scope your-team
```

### Netlify

```bash
#!/usr/bin/env bash
# scripts/rollback.sh
SITE_ID="abcdef-12345-..."
PREV_DEPLOY_ID=$(netlify api listSiteDeploys --data "{\"site_id\":\"$SITE_ID\"}" | jq -r '.[1].id')
netlify api restoreSiteDeploy --data "{\"site_id\":\"$SITE_ID\",\"deploy_id\":\"$PREV_DEPLOY_ID\"}"
```

### Railway

```bash
#!/usr/bin/env bash
# scripts/rollback.sh
SERVICE_ID="abc-123"
# Roll back to previous deployment
railway redeploy --service "$SERVICE_ID" --previous
```

### Custom (git-revert + rebuild + redeploy)

```bash
#!/usr/bin/env bash
# scripts/rollback.sh
set -euo pipefail
# 1. Revert the last commit on the deploy branch
git revert HEAD --no-edit
# 2. Push the revert
git push origin main
# 3. Trigger your CI/CD to rebuild from the revert commit
gh workflow run deploy.yml --ref main
```

### Docker / Kubernetes

```bash
#!/usr/bin/env bash
# scripts/rollback.sh
kubectl rollout undo deployment/my-app --namespace prod
kubectl rollout status deployment/my-app --namespace prod --timeout=300s
```

---

## Step 3 — Test your rollback with `--dry-run`

**Before relying on auto-fire, verify the command works:**

```bash
# Show what would happen without actually rolling back
node ~/agentic-sdlc/agents/deploy-rollback.mjs --dry-run --reason "manual test"
```

Output:
```
[deploy-rollback] DRY RUN — would execute: bash scripts/rollback.sh
[deploy-rollback] DRY RUN — reason: manual test
[deploy-rollback] DRY RUN — debounce: 300s
[deploy-rollback] DRY RUN — would trigger: deployRolledBack on success / deployFailed on failure
```

Then with `--confirm` for an interactive run:

```bash
node ~/agentic-sdlc/agents/deploy-rollback.mjs --confirm --reason "production verification"
# [deploy-rollback] About to run: bash scripts/rollback.sh
# [deploy-rollback] Continue? (y/N) y
```

---

## Step 4 — Wire into your deploy pipeline

Update your deploy script to invoke the rollback helper when smoke tests fail. Example:

```bash
#!/usr/bin/env bash
# scripts/deploy.sh
set -euo pipefail

# Stages 1-4: build, serve, e2e, deploy
npm run build
npx serve dist --listen 3000 &
LOCAL_PID=$!
npx playwright test --project=e2e
kill $LOCAL_PID
vercel deploy --prod

# Stage 5: post-deploy smoke
if ! npx playwright test --project=smoke --base-url "$PROD_URL"; then
  echo "Smoke tests FAILED — rolling back"
  node ~/agentic-sdlc/agents/deploy-rollback.mjs --reason "post-deploy-smoke-failed"
  exit 1
fi

# Stage 6: browser verify (your own logic)
if ! ./scripts/browser-verify.sh; then
  echo "Browser verify FAILED — rolling back"
  node ~/agentic-sdlc/agents/deploy-rollback.mjs --reason "browser-verify-failed"
  exit 1
fi

# Stage 7: notify
node ~/agentic-sdlc/agents/notify.mjs send "Deployed to $PROD_URL — all gates passed"
```

---

## Exit codes from `deploy-rollback.mjs`

| Code | Meaning | What to do |
|---|---|---|
| 0 | Rollback succeeded | Investigate why deploy failed |
| 1 | No `rollbackCmd` configured | Add `rollbackCmd` to project.json before next deploy |
| 2 | `rollbackCmd` ran but exited non-zero | URGENT — both deploy AND rollback failed. Manual intervention required immediately. |
| 3 | Helper itself errored (missing project.json, etc.) | Fix the configuration; helper couldn't get far enough to attempt rollback |

---

## Notification payloads

### deployFailed

Fires from:
- A pipeline stage detecting a failure
- The rollback helper when no `rollbackCmd` is configured
- The rollback helper when the configured `rollbackCmd` itself fails

Message format:
```
Rollback command FAILED (exit <code>). Reason: <your --reason flag>
Output:
<captured output, truncated to 4KB>
```

### deployRolledBack

Fires from:
- The rollback helper after a successful rollback

Message format:
```
Rollback succeeded. Reason: <your --reason flag>
Output:
<captured output, truncated to 4KB>
```

---

## Common pitfalls

| Pitfall | Symptom | Fix |
|---|---|---|
| `rollbackCmd` returns 0 even when nothing rolled back | Rollback "succeeded" but production still broken | Make sure your rollback script verifies the rollback (e.g. `kubectl rollout status` waits for completion) |
| Notification spam during flapping deploys | Phone buzzing every minute | `rollbackDebounce: 300` (default) suppresses; bump higher if needed |
| Stale credentials in rollback script | Rollback fails with auth error | Use the same secret management as your deploy script |
| Rollback to a broken previous version | Production is still broken after rollback | Investigate the previous version separately; rollback only restores the deploy artifact, not the underlying code defect |
| `rollbackCmd` references env vars not present in your shell | Helper exits 2 with "command not found" or similar | Set env vars in your deploy environment OR source them inside `scripts/rollback.sh` |

---

## What this pattern does NOT do

- **Source code reversion**: `rollbackCmd` reverts the deployed artifact, not your git history. A bad commit stays on `main` — you decide whether to git-revert it.
- **Database migration rollback**: Schema changes are out of scope. Project author's responsibility.
- **Multi-environment routing**: Single `rollbackCmd` per project. If you need staging vs. prod variants, branch inside your script: `bash scripts/rollback.sh "${ENV:-prod}"`.
- **Canary deploys**: Different pattern. Future framework work.

---

## Disabling the rollback notification (but keeping the rollback)

If you want auto-rollback but no notifications:

```json
{
  "notification": {
    "triggers": {
      "deployFailed": false,
      "deployRolledBack": false
    }
  }
}
```

The rollback still executes; you just don't get pinged. Useful in CI environments where deploy logs are watched separately.

---

## Related docs

- [`agents/templates/deploy-pipeline.md.template`](../agents/templates/deploy-pipeline.md.template) — the full 9-stage pipeline (stages 8-9 are this pattern)
- [`docs/safety-mechanisms.md`](safety-mechanisms.md) — broader framework safety surface
- `openspec/changes/archive/automated-deploy-rollback/` — the OpenSpec change that produced this pattern
