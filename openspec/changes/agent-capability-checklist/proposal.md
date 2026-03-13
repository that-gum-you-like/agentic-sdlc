## Why

Agents silently stop using capabilities they're supposed to use. An agent might stop reading memory before tasks, skip OpenClaw browser verification, forget to record learnings, or never use semantic search — and nobody notices because there's no tracking. The system degrades invisibly. This is the "silent lazy drift" problem: agents don't fail loudly, they just quietly do less over time. Without explicit tracking, we discover drift weeks later when quality drops and we don't know why.

This is a quality guardrail that makes capability usage visible and auditable. Every agent run produces a capability checklist showing what was actually used. A monitoring agent reviews these checklists to catch drift, silent failures, and alignment loss before they compound.

## What Changes

- **Post-task capability checklist**: After every agent task completion, the agent produces a structured checklist of which capabilities/skills were used during that run (memory recall, memory record, semantic search, OpenClaw browser test, OpenClaw notifications, pattern-hunt, schema validation, defeat tests, etc.)
- **Checklist schema**: JSON schema defining the capability checklist format — boolean fields for each expected capability, plus notes for why any expected capability was skipped
- **Expected capabilities per agent**: Each agent's AGENT.md or a new `capabilities.json` config defines which capabilities that agent is expected to use on a typical task (e.g., Roy MUST read memory, SHOULD run defeat tests; Richmond MUST use checklist, MUST NOT write files)
- **Capability monitor agent**: A lightweight monitoring role (could be Richmond or a new role) that receives completed checklists and flags anomalies: expected capability not used without justification, capability usage declining over time, agent never using a capability it's configured to use
- **Drift alerts**: When capability usage drops below threshold (e.g., agent stops reading memory for 3+ consecutive tasks), notify.mjs fires a drift alert
- **Weekly capability report**: Aggregated in the weekly review — which capabilities are being used, which are being skipped, trend over time

## Value Analysis

**Who benefits:** Every project using the framework. Bryce specifically — he's been burned by agents quietly stopping behaviors (e.g., forgetting to send WhatsApp, skipping browser verification, not recording learnings).

**What problem it solves:** Silent degradation of agent behavior. Agents appear to be working (tests pass, code ships) but they're cutting corners on the full micro cycle. Without this, the only way to catch drift is manual review of every agent session — which defeats the purpose of autonomous agents.

**Priority:** High. This is a meta-quality guardrail — it protects all other guardrails from being silently skipped.

**What happens if we don't build this:** Agents gradually drift from their intended behavior. Memory stops being read, reviews get shallower, browser tests get skipped, notifications don't go out. Each individual skip seems harmless but compounds into systemic quality degradation. We've already seen this pattern (the "deployed but forgot WhatsApp" incident, the "wrote code but never deployed" incident).

**Success metrics:**
- Every completed task has a capability checklist attached
- Drift alerts fire within 24 hours of an agent skipping expected capabilities 3+ times
- Weekly capability report shows usage trends per agent
- Zero "silently stopped doing X" incidents after implementation

## Capabilities

### New Capabilities
- `capability-checklist`: Post-task capability usage tracking with structured JSON output, expected-vs-actual comparison, and anomaly detection
- `capability-monitor`: Monitoring agent/role that reviews checklists, detects drift patterns, fires alerts, and produces weekly capability usage reports

### Modified Capabilities
(none)

## Impact

### Scripts Modified
- `agents/worker.mjs` — inject capability checklist instructions into agent prompt (agent must output checklist as final structured JSON block)
- `agents/queue-drainer.mjs` — on task complete, parse and store capability checklist from agent output
- `agents/cycles/daily-review.mjs` — include capability usage summary in dashboard
- `agents/cycles/weekly-review.mjs` — produce weekly capability trend report
- `agents/notify.mjs` — add `capabilityDrift` trigger type

### New Files
- `agents/schemas/capability-checklist.schema.json` — JSON schema for the checklist
- `agents/templates/capabilities.json.template` — per-agent expected capabilities config
- `agents/capability-monitor.mjs` — script that ingests checklists, detects drift, fires alerts
- `agents/templates/AGENT.md.template` — add capability checklist output requirement to micro cycle

### Config Changes
- `project.json` — add `capabilityMonitoring.enabled` (default true), `capabilityMonitoring.driftThreshold` (default 3 consecutive skips)
- `notification.triggers` — add `capabilityDrift` trigger
