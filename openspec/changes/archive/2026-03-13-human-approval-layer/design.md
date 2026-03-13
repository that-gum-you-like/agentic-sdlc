## Context

The agentic SDLC framework provides autonomous multi-agent operation with agent-to-agent communication via Matrix. All safety mechanisms (budget circuit breaker, stale claims, test-gated completion) are automated. There is no channel for agents to reach the human project owner, and no mechanism for agents to pause work pending human input.

The framework is a standalone GitHub repo (`~/agentic-sdlc`) that projects adopt via `setup.mjs`. Any notification layer must follow the same pattern: generic in the framework, configured per-project.

**Constraints:**
- Must not require any specific messaging service — the framework is portable
- Must work when no notification provider is configured (graceful degradation)
- Must not break existing autonomous operation — notifications are additive, not blocking by default
- OpenClaw/WhatsApp is the reference implementation but must not be the only option
- All new scripts must use `loadConfig()` from `load-config.mjs`

## Goals / Non-Goals

**Goals:**
- Agents can send structured messages to a human via a configured channel
- Agents can request approval and optionally wait for a response
- Human responses (via WhatsApp, mailbox file, etc.) flow back to agents as actionable data
- Notification triggers fire automatically on key events (blockers, budget alerts, deploys, failures)
- The provider interface is pluggable — swap WhatsApp for Slack by changing config
- The done checklist can require human confirmation before marking work truly complete

**Non-Goals:**
- Real-time bidirectional chat between humans and agents (this is async notification, not a chatbot)
- Multiple simultaneous human approvers (single project owner model)
- GUI or web dashboard for notifications (CLI and file-based only)
- Replacing Matrix for agent-to-agent communication (Matrix stays for inter-agent coordination)

## Decisions

### D1: Provider abstraction via a single `notify.mjs` script

All notification logic goes through one script: `agents/notify.mjs`. It reads the provider config from `project.json` and dispatches to the correct implementation. This is the same pattern as `load-config.mjs` — one entry point, project-specific behavior from config.

**Why not a plugin directory?** Over-engineering. A switch statement on `provider` in one file is simpler and easier to audit than dynamic module loading. New providers are added by adding a case to the switch.

**Providers:**
- `openclaw` — Uses `openclaw message send` CLI. Reference implementation.
- `file` — Writes to a local file (e.g., `pm/notifications.md`). Works everywhere, no dependencies.
- `none` — Silently succeeds. Default when no provider configured.

### D2: Notification config lives in `project.json`

Add a `notification` section to `project.json`:

```json
{
  "notification": {
    "provider": "openclaw",
    "channel": "+19184079794",
    "mailboxPath": "pm/mailbox.md",
    "mediaDir": "pm/media",
    "triggers": {
      "blocker": true,
      "budgetAlert": true,
      "deployComplete": true,
      "highSeverityFailure": true,
      "dailySummary": true,
      "approvalTimeout": true
    }
  }
}
```

**Why in project.json?** It's already the single source of project config. Adding another config file fragments discovery. `load-config.mjs` already reads it — the notification fields get resolved the same way.

### D3: Approval gates use a file-based mailbox with polling

When an agent requests approval, `notify.mjs` sends the request to the human and then writes a pending approval entry to `pm/approvals/<approval-id>.json`. The agent polls this file for a response.

The human responds via their messaging channel (WhatsApp reply → OpenClaw relays to `pm/mailbox.md`), or by directly editing the approval file. A `notify.mjs check-mailbox` command parses inbound messages and matches them to pending approvals.

**Why file-based?** Agents already work with the filesystem. No new infrastructure. Works across restarts. Human-readable and auditable. The mailbox file is the same pattern used for task queue JSON files.

**Approval file schema:**
```json
{
  "id": "approval-001",
  "type": "deploy-confirm",
  "requestedBy": "agentname",
  "taskId": "T-042",
  "message": "Deploy complete. Visual test screenshots attached. Approve?",
  "media": ["pm/media/screenshot-1.png"],
  "status": "pending",
  "requestedAt": "2026-03-03T12:00:00Z",
  "timeout": 3600,
  "response": null,
  "respondedAt": null
}
```

### D4: Approval gates are opt-in, not default

The queue drainer and done checklist do NOT require human approval by default. Projects opt in by setting `"requireApproval"` on specific triggers or by adding `"approvalRequired": true` to individual task JSON files.

**Why opt-in?** The framework's value is autonomous operation. Making approval mandatory by default breaks the core workflow. Projects that want human gates add them explicitly.

### D5: Timeout and escalation for pending approvals

Approvals have a configurable timeout (default: 1 hour). After timeout:
1. Notification re-sent with "REMINDER" prefix
2. After second timeout: approval auto-granted with `"autoApproved": true` flag logged
3. Agent proceeds but records the auto-approval in memory as a warning

**Why auto-approve on timeout?** Blocking indefinitely defeats autonomous operation. The human is notified twice. If they don't respond, the agent proceeds and logs it. The human can review later.

### D6: `notify.mjs` CLI interface

```bash
# Send a notification
node agents/notify.mjs send "Deploy complete for T-042" [--media path.png]

# Request approval (blocks until response or timeout)
node agents/notify.mjs approve "Ready to deploy to production?" --task T-042 --timeout 3600

# Check mailbox for inbound messages
node agents/notify.mjs check-mailbox

# List pending approvals
node agents/notify.mjs pending

# Resolve an approval manually
node agents/notify.mjs resolve <approval-id> approved|rejected [--note "reason"]
```

### D7: Trigger integration points

Rather than modifying every existing script, triggers are fired by adding `notify.mjs send` calls at specific points:

| Trigger | Where fired | Message |
|---------|-------------|---------|
| Blocker detected | `queue-drainer.mjs` when task flagged blocked after 3 retries | "Task T-XXX blocked: [reason]" |
| Budget alert | `queue-drainer.mjs` when agent hits 80% of daily budget | "Agent X at 80% budget" |
| Deploy complete | Agent's done checklist (documented in CLAUDE.md) | "Deploy complete. Approve?" + screenshot |
| High-severity failure | `memory-manager.mjs` when recording severity HIGH/CRITICAL | "New failure memory: [description]" |
| Daily summary | `cycles/daily-review.mjs` at end of session | "Daily summary: X tasks completed, Y blocked" |
| Approval timeout | `notify.mjs` when approval exceeds timeout | "REMINDER: Approval pending for T-XXX" |

## Risks / Trade-offs

**[Risk] OpenClaw dependency for WhatsApp** → Mitigation: OpenClaw is optional. `file` provider works without it. `none` provider is the default. Framework never breaks without OpenClaw.

**[Risk] Polling-based approval could miss time-sensitive responses** → Mitigation: Agents check mailbox at the start of every task (added to session protocol). Timeout + auto-approve prevents indefinite blocking.

**[Risk] Mailbox file parsing is fragile for free-text WhatsApp replies** → Mitigation: Keep parsing simple — look for "approved", "rejected", "yes", "no" keywords. Unrecognized messages are logged but don't resolve approvals. Human can always use `notify.mjs resolve` CLI directly.

**[Risk] Auto-approve on timeout may allow bad deploys** → Mitigation: Auto-approve is logged prominently. Agent records it in memory. Next daily review flags auto-approved items. Human is notified twice before auto-approve.

## Open Questions

- Should `check-mailbox` run on a cron schedule via OpenClaw, or only when agents explicitly call it?
- Should approval history be archived alongside completed tasks, or kept in a separate audit log?
