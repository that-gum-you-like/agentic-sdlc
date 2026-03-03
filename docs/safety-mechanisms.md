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
