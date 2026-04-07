# Multi-Agent SDLC — Safety Mechanisms

The agent system includes five interlocking safety mechanisms that prevent budget overruns, task abandonment, memory staleness, and unsafe completions. All five work together and should remain active in production operation.

## 1. Conservation Mode

**Purpose:** Halve all daily token budgets for every agent to extend runway during resource-constrained periods.

**How to activate:**

```bash
# Edit agents/budget.json
"conservationMode": true
```

**What changes:**
- `queue-drainer.mjs run` uses `dailyTokens / 2` as the effective budget ceiling for each agent
- `cost-tracker.mjs report` shows halved limits and a `CONSERVATION MODE ACTIVE` warning banner
- Tasks that would exceed the halved limit are skipped and remain in queue

**When to use:**
- Running low on API credits
- During development-only periods where you want to extend token runway
- Testing budget-constrained scheduling behavior

**How to verify:**

```bash
# Enable
sed -i 's/"conservationMode": false/"conservationMode": true/' agents/budget.json
node agents/cost-tracker.mjs report   # Should show halved limits and warning

# Restore
sed -i 's/"conservationMode": true/"conservationMode": false/' agents/budget.json
```

## 2. Budget Circuit Breaker

**Purpose:** Prevent new tasks from being assigned to agents who have already exceeded their daily token budget.

**How it fires:** `queue-drainer.mjs` reads `agents/cost-log.json` before assigning each task. It sums all tokens recorded for that agent on the current UTC date. If the sum is greater than or equal to the agent's daily limit (or halved limit in conservation mode), the assignment is blocked and a warning is emitted.

**What you see:**

```
Warning: Agent <name> over budget (130198/100000 tokens). Skipping.
```

**What happens next:** The task remains `pending` in the queue. If another qualified agent has budget remaining, it will be assigned to them. If no agent can take it, it waits until daily budgets reset at midnight UTC.

**How to verify:**

```bash
# Inject a high-usage entry for an agent
node agents/cost-tracker.mjs record <agent> TEST 50000 60000

# Create a pending task and try to assign — should be refused
node agents/queue-drainer.mjs run

# Clean up
rm agents/cost-log.json
```

## 3. Stale Claim Detection

**Purpose:** Flag tasks that have been in `in_progress` state for longer than the stale threshold (default: 30 minutes) without completing, indicating an agent session may have crashed or disconnected.

**How it fires:** `queue-drainer.mjs status` checks the `claimedAt` timestamp on every in-progress task. If `(now - claimedAt) > STALE_CLAIM_MS`, the task is marked as stale in the status output.

**What you see:**

```
[STALE-T-042] Build analytics dashboard -> <Agent Name> [claimed: <agent>]  STALE CLAIM
```

**How to respond:**

```bash
# Option 1: Release the claim so another agent can pick it up
node agents/queue-drainer.mjs release <task-id>

# Option 2: Reset entirely — wipes agent assignment, returns to pending
node agents/queue-drainer.mjs reset <task-id>
```

**Timeout configuration:**

The threshold is set in `queue-drainer.mjs`:

```javascript
const STALE_CLAIM_MS = 30 * 60 * 1000;  // 30 minutes — adjust as needed
```

## 4. REM Sleep (Memory Consolidation)

**Purpose:** Prevent memory layer bloat by automatically promoting old memories up the layer hierarchy, deduplicating long-term memory, and composting deprecated entries. This keeps agent context windows focused and prevents information loss.

**How it fires:** Runs as a scheduled weekly job (Sundays at 23:00 UTC via cron), or manually on demand.

**Consolidation rules:**
- `recent` entries older than 7 days are promoted to `medium-term`
- `medium-term` entries older than 30 days are promoted to `long-term`
- Duplicate entries in `long-term` are deduplicated (keeping the most recent)
- Entries flagged as `"deprecated"` are moved to `compost`

**Manual execution:**

```bash
node agents/rem-sleep.mjs --dry-run   # Preview what will be moved — no writes
node agents/rem-sleep.mjs             # Apply consolidation
```

**Why it matters:**
- `recent.json` would grow unbounded without periodic promotion
- Important patterns from individual sessions get elevated to long-term storage
- Agents maintain learning continuity across weeks and months
- Stale or wrong information is moved to compost rather than silently influencing future work

**Scheduled execution:** Via cron (`rem-sleep-weekly`, `0 23 * * 0`). Manage with `openclaw cron list` and `openclaw cron enable|disable rem-sleep-weekly`.

## 5. Test-Gated Task Completion

**Purpose:** Make it impossible to mark a task as completed without first recording a passing test status. This is a hard enforcement gate, not a suggestion.

**How it fires:** `queue-drainer.mjs complete <task-id> <test_status>` rejects the call unless `test_status === 'passing'`.

**What you see when it rejects:**

```
Cannot complete T-001: test_status must be 'passing' (got 'failing')
Run tests first and re-submit with 'passing'.
```

**Enforcement:** Hardcoded in `queue-drainer.mjs`. Not configurable. Any task submitted with a non-passing status is rejected and remains in its current state.

**How to verify:**

```bash
# Attempt to complete with a failing status — should be refused
node agents/queue-drainer.mjs complete T-999 failing
```

## 6. Human Approval Gates

**Purpose:** Prevent critical actions without human sign-off.

**How it works:**
- Tasks with `"approvalRequired": true` cannot complete without human approval
- Agents send approval requests via the notification channel
- Approvals are tracked as JSON files in `pm/approvals/`
- Timeout behavior prevents indefinite blocking: reminder at 1x timeout, auto-approve at 2x timeout

**When to use:**
- Production deployments
- Database migrations
- Breaking API changes
- Any task where human judgment is required

**Configuration:** Set `"approvalRequired": true` on individual task JSON files. The approval gate is opt-in — tasks without this field complete normally.

## 7. Human Wellness Guardrails

**Purpose:** Protect the human operator from overwork. Advisory alerts, never blocking.

**Configuration:** Add to `project.json`:
```json
{
  "humanWellness": {
    "enabled": true,
    "dailyMaxHours": 10,
    "nightCutoff": "23:00",
    "breakIntervalHours": 3
  }
}
```

**How it works:**
- `cost-tracker.mjs` tracks wall-clock session hours (30-min gap = new session)
- `notify.mjs wellness-check` fires alerts when thresholds are exceeded
- Queue-drainer calls wellness check after each task assignment (wrapped in try/catch)
- Alerts are deduplicated per threshold per day via `pm/wellness-alerts.json`

**Key principle:** Wellness alerts are **advisory only**. The queue is never paused or blocked.

## 8. Bottleneck Detection

**Purpose:** Alert when human tasks are the limiting factor blocking agent work.

**How it fires:** During `daily-review.mjs`, if >50% of blocked tasks are waiting on human action AND human tasks have been pending >24 hours, a bottleneck notification is sent.

**What you see:**
```
⚠ Bottleneck alert: 3 human tasks pending > 24h. Agent work is blocked on human action.
```

## 9. Capability Drift Detection

**Purpose:** Detect when agents silently stop using capabilities they're supposed to use.

**How it works:** System-instrumented logs (`pm/capability-log.jsonl`) track every capability invocation. `capability-monitor.mjs check` scans for required capabilities with zero log entries across 3+ consecutive tasks.

**Alerts:**
- **Drift:** Required capability skipped 3+ times without justification
- **Scope creep:** Agent uses a `notExpected` capability
- **Discrepancy:** Agent self-reports usage but system log has no matching entry

## 10. Permission Tiers

**Purpose:** Principle of least privilege per agent.

**Tiers:** `read-only` < `edit-gated` < `full-edit` (default) < `deploy`

Queue-drainer enforces permissions on task assignment. Worker injects constraints into agent prompts.

## Verification Checklist

Run these to confirm all six mechanisms are working:

```bash
# 1. Conservation mode — toggle on, check report shows halved limits, restore
sed -i 's/"conservationMode": false/"conservationMode": true/' agents/budget.json
node agents/cost-tracker.mjs report
sed -i 's/"conservationMode": true/"conservationMode": false/' agents/budget.json

# 2. Budget circuit breaker — inject high usage, try to assign, verify refusal
node agents/cost-tracker.mjs record <agent> TEST 50000 60000
node agents/queue-drainer.mjs run

# 3. Stale claims — check status output for in-progress tasks older than threshold
node agents/queue-drainer.mjs status

# 4. REM sleep — preview without applying
node agents/rem-sleep.mjs --dry-run

# 5. Test-gated completion — attempt failing completion, verify rejection
node agents/queue-drainer.mjs complete NONEXISTENT failing
```

## 11. Redundant Heartbeat Requirement

**Purpose:** Prevent cascade stalls caused by single-point-of-failure when only one agent has an active heartbeat.

**Learned from:** LinguaFlow 17-day stall (2026-03-14 to 2026-03-31) where only the CTO agent had a heartbeat. When CTO got stuck, all other agents remained idle.

**How it works:**
- `setup.mjs` warns if only 1 agent has a heartbeat/cron configured
- Recommend 2+ agents with active oversight (CTO + CEO, or any combination)
- If one oversight agent stalls, the other can detect and recover

## 12. Budget Exhaustion Auto-Response

**Purpose:** Prevent agents from silently starving when their token budget runs out.

**How it works:**
- When model-manager is configured: monitors utilization every 15 minutes, swaps to fallback models at 100%, alerts at 90%
- When model-manager is NOT configured: `cost-tracker.mjs report` sends a notification via `notify.mjs` at 90% utilization
- `budget.json` supports `fallbackChain` per agent for automatic model downgrade
- Daily reset at midnight restores preferred models

**Commands:**
```bash
node agents/model-manager.mjs check      # Manual utilization check
node agents/model-manager.mjs report     # Performance stats by agent × model
node agents/model-manager.mjs recommend  # Data-driven model suggestions
node agents/model-manager.mjs reset      # Clear all active model overrides
```

## 13. Exception Normalization Guard

**Purpose:** Prevent one-time code review exceptions from becoming permanent anti-patterns.

**Learned from:** LinguaFlow reviewer (Richmond) approved one service-call-from-screen exception that became a normalized pattern across the codebase.

**How it works:**
- Reviewer checklist requires approved exceptions to have an expiry date or linked tech debt ticket
- `daily-review.mjs` flags exceptions past their expiry as "stale approval — review or remove"
- Rule: Hard-block violations, never soft-suggest. One-time approvals must not become permanent.

## 14. Stale OpenSpec Hygiene

**Purpose:** Prevent openspec change queue from accumulating stale items that confuse orchestration.

**How it works:**
- `daily-review.mjs` scans `openspec/changes/*/status.json`
- Flags changes stuck in proposal/design >14 days
- Flags shipped changes not archived >7 days
- Output appears in daily review and dashboard
