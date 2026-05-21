# Design: automated-deploy-rollback

**Date**: 2026-05-21
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: design

---

## Context

### Current State

- `agents/templates/deploy-pipeline.md.template` documents 7 stages (BUILD → SERVE LOCAL → BROWSER E2E → DEPLOY → POST-DEPLOY → BROWSER VERIFY → NOTIFY) with no rollback path
- `agents/notify.mjs` has 7 recognized trigger types via the `triggerNotification()` helper — no deploy-failure or rollback triggers
- `agents/schemas/deploy-request.schema.json` defines the deploy-request shape — no `rollbackCmd` field
- Projects define their own `testCmd` in `agents/project.json`; the same pattern fits for `rollbackCmd`

### Problem Restatement

Add an auto-revert safety net to the framework's documented deploy pattern: when post-deploy verification fails, invoke a project-defined `rollbackCmd` and notify the stakeholder.

---

## Goals

- A project that defines `rollbackCmd` in `agents/project.json` gets auto-revert when stages 5 or 6 fail
- A project that does NOT define `rollbackCmd` sees a clear warning but the deploy doesn't catastrophically break
- The new triggers integrate with the existing `notify.mjs` surface — no consumer code changes
- Total new code <200 lines; deploy-pipeline.md.template grows by <80 lines

## Non-Goals

- Framework performing rollback API calls directly (e.g. Vercel API). Project's `rollbackCmd` handles that.
- Database/data migration rollback (project author's responsibility)
- Canary deploys (separate future change)
- Auto-detecting hosting platform

---

## Design

### Overview

Three changes:

1. **Template extension** (`deploy-pipeline.md.template`): Add "ON FAILURE" subsections to stages 5 and 6 pointing at a new stage 8 (Rollback) and 9 (Notify rollback). The added sections describe the rollback pattern, including how to define `rollbackCmd`.

2. **Notify triggers** (`notify.mjs`): Add `deployFailed` and `deployRolledBack` to the recognized trigger list. Two-line addition.

3. **Rollback helper** (`deploy-rollback.mjs`): A small executable script:
   - Reads `agents/project.json` for `rollbackCmd`
   - If missing: log warning, trigger `deployFailed` notification with "No rollbackCmd configured, manual revert required", exit 1
   - If present: execute `rollbackCmd`, capture stdout/stderr, exit code
   - On success: trigger `deployRolledBack` notification with the rollback output (truncated to 4KB)
   - On failure: trigger `deployFailed` notification with "Rollback command FAILED" + output, exit 2

### Components

#### deploy-rollback.mjs

**File**: `agents/deploy-rollback.mjs`
**Size**: ~80 lines
**Dependencies**: zero (Node stdlib only)

CLI:
```
node agents/deploy-rollback.mjs                    # auto: read project.json, run rollbackCmd
node agents/deploy-rollback.mjs --dry-run          # show what would happen
node agents/deploy-rollback.mjs --confirm          # require interactive confirmation
node agents/deploy-rollback.mjs --reason "<msg>"   # tag the notification with a reason
```

Exit codes:
- 0: rollback succeeded
- 1: no `rollbackCmd` configured, manual revert required
- 2: `rollbackCmd` ran but exited non-zero
- 3: helper itself errored (e.g. project.json missing)

#### project.json extension

New optional field:
```json
{
  "rollbackCmd": "bash scripts/rollback.sh",
  "rollbackDebounce": 300
}
```

`rollbackDebounce` (optional, default 300 seconds): minimum time between rollback fires for the same project. Prevents notification spam if a deploy is failing repeatedly.

#### notify.mjs triggers

Two-line additions to the recognized list:
- `deployFailed` — fires from stage 5 or 6 failure
- `deployRolledBack` — fires after `deploy-rollback.mjs` succeeds

Reuses the existing `triggerNotification()` API; no new code paths.

#### deploy-pipeline.md.template additions

New content (~70 lines added to the existing 127-line file):

```markdown
### 5. Post-Deploy (Production Smoke Tests)
[existing content...]

**ON FAILURE:** Skip to stage 8 (Rollback). Production has broken code; revert first, debug second.

### 6. Browser Verify (Post-Deploy Gate)
[existing content...]

**ON FAILURE:** Skip to stage 8 (Rollback). User-visible UI is broken.

### 8. Rollback (auto-fires from stage 5 or 6 failure)

If `agents/project.json` has a `rollbackCmd` field, invoke:

\```
node ~/agentic-sdlc/agents/deploy-rollback.mjs --reason "<stage that failed>"
\```

The helper:
1. Reads `rollbackCmd` from `project.json`
2. Executes it, captures output
3. On success, triggers `deployRolledBack` notification
4. On failure, triggers `deployFailed` notification with the rollback command's stderr

If `rollbackCmd` is missing, the helper exits 1 with a clear "Manual revert required" notification.

### 9. Notify Rollback

Stakeholders see a `deployRolledBack` notification with: which stage failed, what was rolled back, the production URL (should now be the previous version), and a link to the failure logs.
```

### Data Flow

```
Stage 5 (smoke tests) fails
    ↓
Pipeline catches non-zero exit
    ↓
notify.mjs trigger: deployFailed { stage: "smoke-tests", reason, logs }
    ↓
Pipeline invokes: node agents/deploy-rollback.mjs --reason "smoke-tests failed"
    ↓
deploy-rollback.mjs reads agents/project.json
    ↓
If rollbackCmd set:
    Executes rollbackCmd
    On success → notify.mjs trigger: deployRolledBack { from: <new-version>, to: <prev-version>, output }
    On failure → notify.mjs trigger: deployFailed { stage: "rollback-itself-failed", output }
If rollbackCmd unset:
    notify.mjs trigger: deployFailed { reason: "no-rollback-configured" }
    Exit 1
```

### Schema / Interface Changes

```typescript
// agents/project.json (MODIFIED — new optional fields)
interface ProjectJson {
  // ... existing fields
  rollbackCmd?: string;          // shell command to roll back to previous deploy
  rollbackDebounce?: number;     // seconds between rollback fires (default 300)
}

// agents/notify.mjs (MODIFIED — extended trigger list)
type TriggerName =
  | "blocker"
  | "budgetAlert"
  | "deployComplete"
  | "highSeverityFailure"
  | "dailySummary"
  | "approvalTimeout"
  | "capabilityDrift"
  | "deployFailed"        // NEW
  | "deployRolledBack";   // NEW

// agents/deploy-rollback.mjs (NEW)
// CLI tool, no exported API
```

---

## Decisions

### Decision 1: Project-Defined `rollbackCmd` vs Framework-Implemented Rollback

**Chosen**: Project defines `rollbackCmd` in `project.json`. Framework invokes it.

**Considered**: Framework ships per-platform rollback adapters (Vercel, Netlify, Railway, etc.).

**Rationale**: Per-platform adapters are fragile (platform APIs change), require credentials handling, and bloat the framework. Project-defined commands are a stable contract: "Tell me how to roll back, I'll fire it at the right moment." Mirrors the existing `testCmd` pattern.

### Decision 2: Rollback Debounce = 300 seconds default

**Chosen**: Minimum 300 seconds (5 min) between rollback fires for the same project. Configurable via `rollbackDebounce`.

**Considered**: No debounce; 60-second debounce; 30-minute debounce.

**Rationale**: Without debounce, a deploy stuck in a flap cycle (deploy → fail → rollback → deploy → fail → rollback) spams notifications. 5 minutes is long enough to catch genuine flapping, short enough that intentional re-deploys aren't blocked. Track via a `.last-rollback` marker file in `pm/`.

### Decision 3: Two Triggers vs One

**Chosen**: Two triggers — `deployFailed` (fires from any deploy stage failure) and `deployRolledBack` (fires after rollback completes successfully).

**Considered**: One combined `deployIssue` trigger.

**Rationale**: Stakeholders may want different routing: a `deployFailed` could page on-call (urgent), while `deployRolledBack` is informational (rollback already handled). Separating them gives consumers (notify.mjs adapters) the choice.

### Decision 4: Helper Exits With Specific Codes (Not Just 0/1)

**Chosen**: Exit codes 0 (success), 1 (no rollbackCmd), 2 (rollback failed), 3 (helper error).

**Considered**: Just 0/1.

**Rationale**: Downstream consumers (CI scripts, deploy.sh wrappers) can differentiate between "missing config" (1 — user can fix) and "rollback ran but failed" (2 — actual production emergency).

### Decision 5: Truncate Notification Payloads to 4KB

**Chosen**: Rollback output > 4KB → truncate with a "...truncated, see pm/logs/rollback-<timestamp>.log" tail.

**Considered**: No truncation; 16KB cap; no log file (just truncate).

**Rationale**: notify.mjs delivery channels (WhatsApp, Slack) have message size limits. 4KB is a safe ceiling that still includes useful context. Full output goes to a log file the user can read.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `rollbackCmd` is wrong → makes things worse | Medium (configuration error) | High | `--dry-run` flag for testing. Document in `rollback-pattern.md` that the user must verify `rollbackCmd` manually before relying on auto-fire. |
| Rollback notification spam from flapping deploys | Medium | Low | 5-minute debounce per project. Override via `rollbackDebounce` in project.json. |
| Helper invoked manually with stale data | Low | Medium | `--confirm` flag for interactive use. Helper logs which `rollbackCmd` it's about to run before running. |
| Project author doesn't define `rollbackCmd` → silent failure | High (until adoption) | Low | Helper exits 1 with explicit `deployFailed { reason: "no-rollback-configured" }` notification — never silent. |
| `rollbackCmd` itself errors → no working rollback | Low | High | Exit code 2 + notification. Stakeholder knows the framework's safety net failed and manual action is required immediately. |

---

## Open Questions

### OQ1: Should `deploy-rollback.mjs` Modify Git State?

**Question:** When rollback fires, should the helper also revert the latest commit on `main` (so the broken code isn't HEAD)?

**Working answer:** No — `rollbackCmd` is responsible for the deploy artifact rollback. Source code reversion is a separate human decision (the broken commit may have other useful changes). Document this distinction in `rollback-pattern.md`.

### OQ2: Multi-Environment Support

**Question:** Should the helper handle `rollbackCmd` per environment (staging vs prod)?

**Working answer:** Defer. Current scope: one `rollbackCmd` per project. If a project needs per-env rollbacks, they can branch in their `rollbackCmd` script (`bash scripts/rollback.sh ${ENV}`).

---

## Testing Approach

- **Unit tests** (`tests/deploy-rollback.test.mjs`):
  - "missing rollbackCmd exits 1"
  - "rollbackCmd executes, exit 0 on success"
  - "rollbackCmd non-zero exit propagates as exit 2"
  - "--dry-run does not execute"
  - "--reason flag included in notification payload"
- **Manual verification**:
  - Set `rollbackCmd: "echo rolled back"` in a test project's `project.json`
  - Run `node agents/deploy-rollback.mjs --dry-run`
  - Confirm output shows the command without running it
  - Run without `--dry-run`, confirm command executes and notification fires
- **Integration with template**: Run `setup.mjs` against a fresh project, confirm `deploy-pipeline.md.template` content includes the new stages

---

## Next Step

Proceed to specs phase. One spec file: `automated-rollback-helper-behavior.md`.
