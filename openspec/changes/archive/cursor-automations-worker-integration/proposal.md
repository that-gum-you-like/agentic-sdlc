# Proposal: cursor-automations-worker-integration

**Date**: 2026-05-21
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: proposed

---

## Problem

Bryce has Cursor Pro+ via his work license. Pro+ unlocks **Cloud Agents** (Background Agents — sandboxed cloud sessions that work async) and **Automations** (scheduled triggers that fire those agents on cron, GitHub events, Slack messages, webhooks, etc.). Without scoped instructions, a Cursor Background Agent invoked from an Automation has no idea how to participate in the framework's SDLC — it doesn't know to read `tasks/queue/*.json`, run the micro cycle, follow the OpenSpec workflow, or use the existing framework scripts.

The result today: Bryce's $60/mo Cursor Pro+ subscription does NOT power his autonomous SDLC loop, even though the framework is "Cursor-ready" (rules files installed). He has to manually paste prompts each time he wants a Background Agent to do framework work.

This is the highest-leverage way to use Pro+: have Automations fire Background Agents on a schedule, with rules files that constrain them to the SDLC, so the agents clear the queue and run housekeeping cycles autonomously while staying within the framework's quality gates.

---

## Discovery

- **Cursor Automations format** (researched 2026-05-21 from cursor.com/docs/cloud-agent/automations):
  - **UI-configured, not file-based.** Automations live at cursor.com/automations, not in `.cursor/automations/*.yaml`. No checked-in config.
  - **Triggers supported**: schedule (cron), GitHub/GitLab events (PR/push/CI), Slack messages, Webhook, Linear, Sentry, PagerDuty.
  - **Spawn target**: Cloud Agents (Background Agents) in cloud sandboxes.
  - **Tools available to spawned agents**: Open PR, Comment on PR, Request reviewers, Send to Slack, Read Slack channels, MCP server, Memories.
  - **Billing**: Team usage pool or creator's account.
- **Cursor Background Agents read `.cursor/rules/*.mdc`** when they boot in the cloud sandbox — same as the foreground Cursor IDE.
- **Existing framework state**:
  - `~/agentic-sdlc/.cursor/rules/` has 3 rule files: `agentic-sdlc.mdc` (core rules), `azure-foundry.mdc` (Azure integration), `openspec-workflow.mdc` (OpenSpec commands)
  - `setup.mjs` (post-2026-05-21 commit `4c3cff5`) now copies `.cursorrules` and `.cursor/rules/*.mdc` into new projects
  - `tasks/queue/<id>.json` is the queue format; `agents/queue-drainer.mjs` provides the CLI
  - `cycles/daily-review.mjs`, `cycles/weekly-review.mjs`, `cost-tracker.mjs report`, `rem-sleep.mjs`, `pattern-hunt.mjs` are all CLI-invocable
- **What's missing**:
  - No rule file explaining to a Background Agent how to claim and execute a task from the queue
  - No rule file explaining to a Background Agent how to run housekeeping cycles
  - No documented playbook for the user to create the Automations in the Cursor UI

---

## Proposed Solution

Add two new `.cursor/rules/*.mdc` files that constrain Background Agents to the SDLC, plus a `docs/cursor-automations-playbook.md` that walks the user through creating the right Automations in the Cursor UI. The setup.mjs already copies `.cursor/rules/` to new projects so distribution is solved.

The user manually creates 5-7 Automations in Cursor's UI (one per recurring cycle) pointing at the appropriate rule file. The Automation fires on schedule, spawns a Background Agent in a cloud sandbox, the agent reads the rule file + framework scripts in the user's repo, executes the cycle, commits, pushes. Repeats.

Cost: $0 marginal (Cursor Pro+ already paid; auto mode is unlimited within the plan).

---

## Value Analysis

### Benefits

- **Bryce's Pro+ subscription actually drives the SDLC loop** instead of sitting idle for autonomous work
- **Cloud-hosted, always-on autonomous bots** — no laptop-must-be-on constraint (the Level 6 systemd plan's biggest tradeoff)
- **Portable across machines** — Automations live in Bryce's Cursor account, follow him to work laptop / new computer / phone
- **High-quality output** — Cursor auto mode picks Claude/GPT for code, much better than Groq Llama 70B
- **Bypasses the Level 6 chicken-and-egg** — Cursor Automations don't need systemd, don't need projects.json, don't need multi-project-orchestrator. The framework's existing scripts work as-is.
- **Builds on what just shipped** — the work-ready push (commits `4c3cff5`, `50b4eaa`) means a fresh project clone already has the rule files
- **Career signal** — a working, real-cloud-hosted autonomous SDLC running off rule files is a strong demo for Bryce's work pitch

### Costs

- **Effort**: ~3-4 hours total. ~1h to write 2 rule files + playbook doc + setup.mjs verification. ~1h for user to create the Automations in Cursor UI (one-time). ~1-2h observation + tuning over the first week.
- **Risk**:
  - **Background Agent quality variance** — auto mode picks the model; quality may vary across runs. Mitigated by the rule files enforcing four-layer-validate + tests before commit.
  - **Automation runs against the wrong branch / commits to main** — Mitigated by rule file requiring the agent to branch (`agent/<name>/<task-id>`) before any work.
  - **Cursor UI drift** — Cursor's Automations UI may change between releases. Mitigated by the playbook noting the date and Cursor version; revisit quarterly.
  - **Token spend** — auto mode is "unlimited" but heavy use could degrade. Mitigated by sensible cadences (no every-5-min queue drain; minimum hourly).
- **Dependencies**:
  - Cursor Pro+ subscription (Bryce has via work)
  - User's project repo accessible from Cursor cloud sandboxes (standard for any GitHub-connected project)
  - GROQ_API_KEY / GEMINI_API_KEY env vars if any rule directs the agent to use a specific provider (none do by default — agents use Cursor auto mode)

### Alternatives Considered

| Alternative | Reason Rejected |
|---|---|
| Wait for Level 6 to ship first | Bryce explicitly paused Level 6 and wants the work-ready loop running tomorrow. #17 doesn't need Level 6. |
| Cursor Background Agents only (no Automations) | Bryce would have to manually fire each one. Defeats the "autonomous" point. |
| GitHub Actions instead of Cursor Automations | Burns Actions minutes, requires public repo or paid Actions, no Cursor account integration. |
| systemd local cron firing Cursor API | Cursor's Background Agent API exists but the systemd path was the Level 6 plan Bryce paused. |
| Do nothing — let Bryce manually run scripts | Pro+ subscription not earning ROI; loop never actually runs autonomously. |

### Decision

**Yes, proceed.** This is the highest-leverage way to use Bryce's existing Cursor Pro+ subscription, addresses his immediate "use the framework at work" goal, and bypasses the Level 6 chicken-and-egg.

---

## Scope

### In Scope

- `.cursor/rules/sdlc-task-execution.mdc` — instructs any Background Agent how to claim, execute, and complete a task from `tasks/queue/`
- `.cursor/rules/sdlc-housekeeping.mdc` — instructs any Background Agent how to run a named housekeeping cycle (queue-drain, daily-review, weekly-review, pattern-hunt, etc.)
- `docs/cursor-automations-playbook.md` — user-facing UI playbook for creating the 7 recommended Automations (queue drain hourly, daily review at 22:00, weekly review Sun 23:00, etc.) with screenshots-style step descriptions
- Update `README.md` Cursor Pro+ row to point to the new playbook
- Update `AGENTS.md` Cursor Pro+ section to mention Automations setup
- Verify `setup.mjs` already copies the new `.mdc` files (it copies the whole `.cursor/` dir — confirmed)

### Out of Scope

- The `workerTier` field per task (Level 6, deferred)
- Multi-project-orchestrator integration (Level 6, deferred)
- Replacing `autonomous-launcher.sh` with Cursor agent triggering (Level 6+, separate change)
- Cursor MCP server integration (interesting but separate, future change)
- A `.cursor/automations/*.yaml` checked-in format (doesn't exist — Cursor uses UI)

---

## Next Step

If approved: proceed to design.md to lock the rule file structure, the playbook content, and the 7 recommended Automations.
