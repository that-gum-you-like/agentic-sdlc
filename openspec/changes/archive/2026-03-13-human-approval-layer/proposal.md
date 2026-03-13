## Why

The agentic SDLC framework runs agents autonomously — they pick tasks, implement, test, commit, and move on. But there is no mechanism for agents to communicate with the human who owns the project. When an agent hits a blocker, exceeds budget, finishes a deploy, or needs a judgment call, the only feedback loop is memory entries that the human may never read. There is no way to send a test link, request approval before a risky action, or receive async feedback that agents can act on.

This creates a gap between "agents completed work" and "human verified it's correct." The framework's own done checklist (deploy → visual test → notify human) is unenforceable because there's no notification channel to the human and no way to wait for their response.

## Value Analysis

**Who benefits:** Any human using the agentic SDLC. Currently the framework assumes the human is watching — this change makes it work when they're not.

**What happens if we don't build this:** Agents operate in a vacuum. Deploys happen without human verification. Blockers sit unnoticed. The human must manually poll dashboards and task queues to know what happened. The "done checklist" remains aspirational rather than enforced.

**Success metrics:**
- Agents can send notifications to a human via a configured channel (WhatsApp, Slack, etc.)
- Agents can request approval and pause until the human responds
- Human feedback (approve/reject/free-text) flows back into the agent workflow
- The notification channel is pluggable — not hardcoded to any single service

## What Changes

- **New: Notification channel abstraction** — A pluggable interface that agents use to send messages and receive responses from humans, with provider implementations (OpenClaw/WhatsApp as reference, extensible to Slack/email/SMS)
- **New: Approval gate mechanism** — A way for agents to pause work and wait for human approval before proceeding, with timeout and escalation behavior
- **New: Human mailbox** — An inbound message file that agents check for async human feedback, with structured parsing
- **New: Notification triggers** — Configurable events that automatically notify the human (blocker detected, budget threshold hit, deploy complete, high-severity failure memory recorded)
- **Modified: Done checklist enforcement** — The framework's done checklist gains actual enforcement: agents must notify the human and receive confirmation before marking work as truly done
- **Modified: Queue drainer** — Gains optional approval gates for task assignment and completion
- **Modified: CLAUDE.md** — Documents the notification/approval layer, configuration, and usage

## Capabilities

### New Capabilities
- `notification-channel`: Pluggable notification interface with send/receive/check commands, provider configuration (OpenClaw/WhatsApp reference implementation), message formatting, media attachment support, and channel health checks
- `human-approval-gate`: Approval request/response workflow with pause-and-wait semantics, timeout behavior, escalation rules, and integration with the task queue and done checklist

### Modified Capabilities
_(none — no existing specs are being changed at the requirement level)_

## Impact

- **New scripts:** `agents/notify.mjs` (notification CLI), `agents/approval-gate.mjs` (approval workflow)
- **New config:** `notification` section in `project.json` (provider, channel ID, mailbox path, trigger rules)
- **New template:** `agents/templates/notification.json.template` (provider config)
- **Modified scripts:** `queue-drainer.mjs` (optional approval gates), `cycles/daily-review.mjs` (end-of-day summary notification)
- **Modified docs:** `CLAUDE.md` (notification/approval docs), `docs/agent-system.md` (communication section update)
- **Dependencies:** OpenClaw CLI for WhatsApp provider (optional — framework works without it, just skips notifications)
