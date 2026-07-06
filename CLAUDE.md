# Agentic SDLC Framework

> **Setting up for the first time?** Read [ONBOARDING.md](ONBOARDING.md) — it walks you (or your AI agent) through discovery, assessment, and incremental integration. The rules below apply once the framework is integrated.

This repo contains a universal methodology for AI-assisted software development. It provides scripts, templates, and documentation for running a multi-agent development team with any AI coding tool.

**This is a framework repo, not a project repo.** To use it with a project, run `node ~/agentic-sdlc/setup.mjs` in your project directory.

> **Detail lives in [docs/appendix/](docs/appendix/).** This file is the canonical operating manual — always loaded, kept tight. Anything you need beyond the headlines is one click away in the appendix.

## Non-Negotiable Rules

1. **Every task must include tests.** Commits without tests are blocked.
2. **Agents follow the micro cycle:** Pick task → Implement → Write tests → Run tests → Commit if passing → Next.
3. **Agents read memory before starting** and write memory after completing.
4. **The review gate enforces.** An installed **pre-commit** hook (`node agents/review-hook.mjs install`) BLOCKS commits containing blocking violations (secrets, silent error swallowing); the reviewer agent then reviews every landed commit via post-commit hook (advisory — a post-commit hook cannot block the commit it runs after). The checklist grows over time.
5. **Small files, small commits.** Services < 150 lines, screens < 200 lines. One logical change per commit.
6. **Serialize dependent work. Parallelize independent work.** One agent doing 5 related things beats 5 agents conflicting.
7. **Anti-patterns get named specifically.** Not "it's bad" — "it's not modular" / "it's not testable" / "silent fallback to zero."
8. **Failures become core memories.** Every mistake an agent makes gets recorded and drives future self-correction.
9. **Scripts that export functions MUST guard their CLI entry point with `__isMainModule`.** Importing a script must never trigger CLI side effects. The `four-layer-validate.mjs` Layer 5 scan enforces this automatically.

## OpenSpec Workflow (Mandatory)

Every change MUST go through: **proposal → design → specs → tasks → implement → archive**.

### Skills
- `/openspec-new-change` — Start a new change (auto-runs cross-feature conflict check)
- `/openspec-continue-change` — Create the next artifact
- `/openspec-apply-change` — Implement tasks
- `/openspec-ff-change` — Fast-forward all artifacts at once
- `/openspec-verify-change` — Verify implementation matches specs
- `/openspec-archive-change` — Archive a completed change
- `/openspec-bulk-archive-change` — Archive multiple changes
- `/openspec-sync-specs` — Sync delta specs to main specs
- `/openspec-explore` — Thinking partner for investigation
- `/openspec-cross-feature` — Pairwise file/capability conflict scan across active changes
- `/openspec-onboard` — Guided onboarding walkthrough

Every `proposal.md` MUST include a `## Value Analysis` section.

**Intake & spec format:** REQ-xxx numbered requirements with Statement / Acceptance / Dependencies / Complexity (S/M/L/XL) / Value. See `framework/requirements-guide.md`. Brain-dump first via `openspec/templates/braindump.md.template`. Phased work via `openspec/templates/roadmap.md.template`. Parallelization via `framework/parallelization-guide.md`.

**Planning pipeline:** Brain dump → Requirements → Priorities → Roadmap → Parallelization. Each stage produces a persistent artifact in the `plans/` directory (`plans/requirements.md`, `plans/priorities.md`, `plans/roadmap.md`, `plans/parallelization.md`).

## Roadmap Discipline

The biggest threat to your roadmap isn't bad planning — it's scope creep.

**The "Never One More Thing" Rule:** When you get an idea mid-task: (1) capture it in BACKLOG.md or the roadmap, (2) don't execute — stay on current work, (3) review it in your next planning session.

**In-repo roadmaps:** Keep your roadmap as structured markdown in the repo, not in GitHub Issues. Agents can parse and update markdown directly.

**PM workflow:** Use a PM agent (or mindset) to capture ideas, evaluate priority, and update the roadmap — preventing dev agents from derailing their current task.

See `framework/agent-lifecycle.md` for the full CTO mindset, agent create/specialize/terminate decisions, and monitoring guidance.

## Agent System

Specialist agents, each with an `AGENT.md` (system prompt), `memory/` (5-layer), and domain patterns. 5 planning agents (requirements → priorities → roadmap → parallelization → quality alignment) feed 21 **Execution Agent Templates** (cto, reviewer, release, backend, frontend, ai-engineer, documentarian, security, qa, integration-tester, ethics, architect, dependency-auditor, performance-sentinel, platform-maturity-sentinel, constitutional-ai-engineer, context-engineering-master, memory-architect, twelve-factor-agent, rag-specialist, token-embedding-analyzer) — in `agents/templates/execution-agents/` — routed by file pattern. Per-agent model tier + fallback chains are resolved by `model-manager.mjs` from `budget.json` (`node ~/agentic-sdlc/agents/model-manager.mjs models`).

→ Full roster, planning pipeline, execution template table, doc-mode variant, task queue commands, token estimate table, worker launcher: **[docs/appendix/agent-system.md](docs/appendix/agent-system.md)**

## Micro Cycle (Every Task)

1. Read task from `tasks/queue/<task-id>.json` (if queue is used) or user request
2. Read memory: `node ~/agentic-sdlc/agents/memory-manager.mjs recall <agent>`
3. Implement code changes
4. Write tests (happy path + at least one error case)
5. Run tests
6. IF frontend files changed: browser E2E against local production build (Playwright or equivalent)
7. Tests pass → commit → mark task completed. Fail → fix → re-run (max 3 attempts, then flag blocked)
8. Record learnings in memory
9. Pick next task → repeat

## Testing Requirements

### Test Tiers
```bash
<test-cmd>                                          # Full unit suite (Tier 1)
<test-cmd> --integration (or project-specific)      # Service↔store integration (Tier 2)
<test-cmd> --defeat (or project-specific)            # Anti-pattern scans (Tier 3)
node ~/agentic-sdlc/agents/four-layer-validate.mjs   # Four-layer validation
node ~/agentic-sdlc/agents/test-behavior.mjs         # Agent prompt quality
# Browser E2E (Tier 5) — see below
```

**Tier 5: Browser E2E** — run when any change to app screens, navigation, state management, or components. Build production artifact → serve locally → run browser E2E against the local build. Must pass before deploy.

- **After any code change:** run full test suite
- **Before every commit:** run defeat tests to catch anti-pattern regressions
- **After editing any AGENT.md:** run behavior tests (MUST pass before committing)

### Defeat Tests
Catch known anti-patterns: `any` types, `console.log`, file size limits, missing error handling. Pattern hunt identifies recurring issues and proposes new defeat tests.

## Safety Mechanisms

1. **Conservation Mode** — `conservationMode: true` in budget.json halves all daily token limits
2. **Budget Circuit Breaker** — Blocks task assignment when an agent exceeds daily budget
3. **Stale Claim Detection** — Flags tasks in_progress > 30 minutes
4. **REM Sleep** — Weekly memory consolidation (recent → medium-term → long-term)
5. **Test-Gated Completion** — Cannot mark task complete without `passing` test status

## Notification & Approval Layer

Agents communicate with the human owner via a pluggable notification channel (`openclaw`/WhatsApp, `telegram` (Bot API, opt-in), `file`/local, or `none`).

Configure `notification` in `project.json` with `provider`, `channel`, and `triggers` (recognized triggers: blocker, budgetAlert, deployComplete, highSeverityFailure, dailySummary, approvalTimeout, capabilityDrift, deployFailed, deployRolledBack).

```bash
node ~/agentic-sdlc/agents/notify.mjs send <message> [--media <path>]
node ~/agentic-sdlc/agents/notify.mjs approve <message> --task <id> [--timeout <secs>]
node ~/agentic-sdlc/agents/notify.mjs check-mailbox
node ~/agentic-sdlc/agents/notify.mjs pending
node ~/agentic-sdlc/agents/notify.mjs resolve <id> approved|rejected [--note <text>]
```

**Approval gates:** add `"approvalRequired": true` to task JSON. Timeout 1h → reminder → auto-approve after 2x timeout. Files in `pm/approvals/`.

## Permission Tiers

Agents have configurable permission levels in `budget.json`:
- `read-only` — Can read, search, analyze. Cannot write or commit.
- `edit-gated` — Can read + propose edits. Cannot commit without review approval.
- `full-edit` — Can read, write, test, commit. Cannot deploy. **(default)**
- `deploy` — Full access including deploy pipeline.

Queue-drainer enforces permissions on task assignment. Worker.mjs injects constraints into agent prompts.

## Human Wellness Guardrails

Optional in `project.json`:
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

When enabled, cost-tracker monitors session hours and notify.mjs sends advisory alerts when thresholds are exceeded. Alerts are informational only — the queue is never paused.

## Iteration Cycles

Micro (per task) → Daily (`daily-review.mjs`) → Weekly (`weekly-review.mjs`, `pattern-hunt.mjs`, `rem-sleep.mjs`, `test-behavior.mjs`) → Monthly (behavior audit, agent versioning, compost cleanup).

→ Schedules, OpenClaw cron one-liners, cycle history conventions: **[docs/appendix/iteration-cycles.md](docs/appendix/iteration-cycles.md)**

## Memory System

5-layer memory per agent: `core.json` (permanent), `long-term.json` (patterns), `medium-term.json` (sprint), `recent.json` (session), `compost.json` (deprecated).

```bash
node ~/agentic-sdlc/agents/memory-manager.mjs recall <agent>
node ~/agentic-sdlc/agents/memory-manager.mjs search <agent> "<query>"   # Semantic top 5
node ~/agentic-sdlc/agents/memory-manager.mjs record <agent> <layer> <entry>
node ~/agentic-sdlc/agents/memory-manager.mjs consolidate <agent>
node ~/agentic-sdlc/agents/memory-manager.mjs compost <agent> <entry-id>
```

Semantic search uses local vector embeddings when `sentence-transformers` is installed (`pip install -r agents/requirements-nlp.txt`); falls back to full recall otherwise.

## Agent Evolution Protocol

All AGENT.md files MUST have `<!-- version: X.X.X | date: YYYY-MM-DD -->` as the first line. Increment version when adding failure memories or changing operating rules.

When editing any agent's AGENT.md:
1. **Before:** `node ~/agentic-sdlc/agents/version-snapshot.mjs snapshot`
2. **After:** `node ~/agentic-sdlc/agents/migrate-memory.mjs --check`
3. **Apply:** `node ~/agentic-sdlc/agents/migrate-memory.mjs --apply`
4. **Validate:** `node ~/agentic-sdlc/agents/test-behavior.mjs`

## Session Protocols

### On Session Start
1. Read CLAUDE.md (this file)
2. Check task queue: `node ~/agentic-sdlc/agents/queue-drainer.mjs status`
3. Check mailbox: `node ~/agentic-sdlc/agents/notify.mjs check-mailbox`
4. Read PM dashboard: `pm/DASHBOARD.md`
5. Pick up next unblocked tasks
6. If using Paperclip: `source .paperclip.env`

### Adapters (orchestration + LLM provider)
**Adapter Configuration:** the framework is platform-agnostic. Configure via `project.json`. Default: `file-based` orchestration + `anthropic` LLM. Other providers: groq, openai, gemini, cerebras, ollama, azure-openai, azure-foundry-claude. Free-tier fallbacks (Groq, Gemini, Cerebras) should end every fallback chain.

→ Full provider list, env vars, Paperclip sync, SDLC-as-source-of-truth: **[docs/appendix/adapters.md](docs/appendix/adapters.md)**

### On Context Getting Low
1. Update PM dashboard with current progress
2. Mark in-progress tasks with status notes in their task JSON
3. Commit and push all work

### Done Checklist (Configurable)

Configured per project in `project.json` via the `doneChecklist` array.

**Default (apps):** `["openspec", "tests", "commit", "deploy", "verify", "notify"]`
**Default (framework repos):** `["openspec", "tests", "commit", "push"]`

"Wrote the code" is NOT "shipped the fix." Every configured step must complete:

| Step | Description |
|------|-------------|
| `openspec` | Change went through OpenSpec workflow |
| `tests` | Tests pass — unit + defeat + behavior |
| `commit` | Atomic commit with clear message |
| `push` | Push to remote |
| `deploy` | Deploy via pipeline (never manual deploys) |
| `verify` | Post-deploy browser verification with screenshots |
| `notify` | Notify stakeholder LAST — only after verification passes |

## Instance Scaling

Agents can run multiple parallel instances when configured (`maxInstances` in budget.json). Queue-drainer assigns up to `maxInstances` independent tasks with unique instance IDs (`roy-1`, `roy-2`). File pattern conflict detection prevents overlapping assignments. All instances share the agent type's daily token budget.

## Human Task Queue

Bidirectional human-agent task management:
```bash
node ~/agentic-sdlc/agents/queue-drainer.mjs human-status     # List pending human tasks
node ~/agentic-sdlc/agents/queue-drainer.mjs human-complete <id>   # Mark done, auto-unblock
```
Agents create human task JSONs when blocked. `notify.mjs` notifies. `daily-review.mjs` surfaces a "YOUR Action Items" section. Bottleneck detection alerts when human tasks block agent work > 24h.

## Agent Maturation Tracking

Agents mature: New → Corrected → Remembering → Teaching → Autonomous → Evolving. `weekly-review.mjs` computes per-agent metrics; `memory-manager.mjs` auto-advances on milestones; `test-behavior.mjs` detects correction-rate spikes; `daily-review.mjs` dashboard shows level + trend.

## Capability Monitoring

Tracks which capabilities agents actually use per task (system-instrumented logs + agent self-report). Drift alerts when a required capability has zero log entries for 3+ consecutive tasks.

```bash
node ~/agentic-sdlc/agents/capability-monitor.mjs check    # Scan recent tasks
node ~/agentic-sdlc/agents/capability-monitor.mjs report   # Per-agent usage table
```

→ Schema, configuration, UIX-specific capabilities, drift notifications: **[docs/appendix/capability-monitoring.md](docs/appendix/capability-monitoring.md)**

## Performance Feedback

Cost-tracker computes per-agent efficiency: avg tokens/task (5-task window), first-attempt success rate, comparison to type average. Worker injects metrics into agent prompts for self-awareness.

## Git Conventions

Branch naming: `feature/<short-description>` or `agent/<agent-name>/<task-id>`.

## Script Reference

40+ framework scripts — full table in **[docs/appendix/script-reference.md](docs/appendix/script-reference.md)**.

## Plans Directory + Autonomous Operation

Projects use `plans/` for persistent planning artifacts (`requirements.md`, `priorities.md`, `roadmap.md`, `parallelization.md`, `devlog.md`, `completed/`). `setup.mjs` scaffolds it.

Headless autonomous mode via `bash ~/agentic-sdlc/agents/autonomous-launcher.sh --agent <name>` — checks roadmap/queue, claims work, runs micro cycle, updates devlog, auto-commits.

→ Dev log conventions, roadmap gardening, autonomous-launcher flags: **[docs/appendix/plans-and-autonomous.md](docs/appendix/plans-and-autonomous.md)**

## Quality Alignment Monitor

`alignment-monitor.mjs` orchestrates all quality tools (capability drift, behavior, roadmap, queue, planning compliance). Outputs an alignment score (0-100) + drift alerts + prompt-adjustment suggestions. The checklist grows over time.

```bash
node ~/agentic-sdlc/agents/alignment-monitor.mjs              # Full check + report
node ~/agentic-sdlc/agents/alignment-monitor.mjs --checklist  # Show self-improving checklist
```

## Agent Routing

See `framework/agent-routing.md` for the complete "when to use which agent" reference. Pipeline: planning agents → implementation agents (backend/frontend/ai routed by file pattern) → quality (review + four-layer-validate + test-behavior) → release.

## Prompt Playbook

See `framework/prompt-playbook.md` for ready-to-use prompts (planning, execution, roadmap, review, autonomous, deployment, delegation).

## Voice Input

In Claude Code: `/voice` built-in (hold spacebar, release to send). Anywhere else: `voice-intake-toggle.sh` is a hotkey-driven voice-to-clipboard (Groq Whisper). See `docs/voice-intake.md` for setup.

## Getting Started

New project: `node ~/agentic-sdlc/setup.mjs` (interactive). Existing project with `agents/project.json`: framework scripts auto-detect from CWD. AI agents bootstrapping: use `--yes` flag to skip prompts.

## Daily Updates

This repo auto-updates daily at 04:00 via OpenClaw cron: `openclaw cron list` to see scheduled jobs.

## Maturity Model

7-level pyramid, Levels 0–6 (Manual → Assisted → Automated → Orchestrated → Quality → Evolving → Self-Improving). Each level builds on the previous — no skipping. Canonical model in `framework/maturity-model.md`; per-level playbooks (Levels 1–6) in `docs/levels/`.

---

## Appendix index

The slim sections above point into these on-demand files:

- `docs/appendix/agent-system.md` — Full agent roster, templates, task queue commands
- `docs/appendix/iteration-cycles.md` — Daily/weekly/monthly cycles, cron schedules
- `docs/appendix/capability-monitoring.md` — Schema, config, drift alerts
- `docs/appendix/script-reference.md` — Complete script catalog (40+ scripts)
- `docs/appendix/plans-and-autonomous.md` — Plans dir + autonomous launcher detail
- `docs/appendix/adapters.md` — LLM providers, Paperclip integration, SDLC-as-source-of-truth
