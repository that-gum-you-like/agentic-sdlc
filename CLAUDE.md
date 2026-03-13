# Agentic SDLC Framework

This repo contains Bryce's universal methodology for AI-assisted software development. It provides scripts, templates, and documentation for running a multi-agent development team with Claude Code.

**This is a framework repo, not a project repo.** To use it with a project, run `node ~/agentic-sdlc/setup.mjs` in your project directory.

## Non-Negotiable Rules

1. **Every task must include tests.** Commits without tests are blocked.
2. **Agents follow the micro cycle:** Pick task → Implement → Write tests → Run tests → Commit if passing → Next.
3. **Agents read memory before starting** and write memory after completing.
4. **Review agent reviews every commit** via post-commit hook. The checklist grows over time.
5. **Small files, small commits.** Services < 150 lines, screens < 200 lines. One logical change per commit.
6. **Serialize dependent work. Parallelize independent work.** One agent doing 5 related things beats 5 agents conflicting.
7. **Anti-patterns get named specifically.** Not "it's bad" — "it's not modular" / "it's not testable" / "silent fallback to zero."
8. **Failures become core memories.** Every mistake an agent makes gets recorded and drives future self-correction.

## OpenSpec Workflow (Mandatory)

Every change MUST go through: **proposal → design → specs → tasks → implement → archive**.

### Skills
- `/openspec-new-change` — Start a new change
- `/openspec-continue-change` — Create the next artifact
- `/openspec-apply-change` — Implement tasks
- `/openspec-ff-change` — Fast-forward all artifacts at once
- `/openspec-verify-change` — Verify implementation matches specs
- `/openspec-archive-change` — Archive a completed change
- `/openspec-bulk-archive-change` — Archive multiple changes
- `/openspec-sync-specs` — Sync delta specs to main specs
- `/openspec-explore` — Thinking partner for investigation
- `/openspec-onboard` — Guided onboarding walkthrough

Every `proposal.md` MUST include a `## Value Analysis` section.

## Agent System

### Roster Concept
Projects use specialist agents, each with:
- **AGENT.md** — System prompt with identity, role, operating rules
- **memory/** — 5-layer memory (core, long-term, medium-term, recent, compost)
- **Domain patterns** — File patterns and keywords that route tasks

### Micro Cycle (Every Task)
1. Read task from `tasks/queue/<task-id>.json`
2. Read memory files (core, long-term, medium-term)
3. Implement code changes
4. Write tests (happy path + at least one error case)
5. Run tests
6. IF frontend files changed (screens, navigation, components, state management): Run browser E2E against local production build using a browser automation tool (e.g., Playwright)
7. If tests pass → commit → mark task completed
8. If tests fail → fix → re-run (max 3 attempts, then flag blocked)
9. Record learnings in memory
10. Pick next task → repeat

### Task Queue Commands
```bash
node ~/agentic-sdlc/agents/queue-drainer.mjs status                  # See queue
node ~/agentic-sdlc/agents/queue-drainer.mjs run                     # Assign next task
node ~/agentic-sdlc/agents/queue-drainer.mjs run --parallel           # Assign all independent
node ~/agentic-sdlc/agents/queue-drainer.mjs claim <id> <agent>       # Claim a task
node ~/agentic-sdlc/agents/queue-drainer.mjs release <id>             # Release a claimed task
node ~/agentic-sdlc/agents/queue-drainer.mjs complete <id> passing    # Mark done
node ~/agentic-sdlc/agents/queue-drainer.mjs archive                  # Archive completed
node ~/agentic-sdlc/agents/queue-drainer.mjs reset <id>               # Reset stuck task
```

**Token Estimate Reference (use for `estimatedTokens` field in task JSON):**
| Task Type | estimatedTokens | When to Use |
|-----------|----------------|-------------|
| simple fix | 3500 | Single-file change, config update, minor bug fix |
| feature | 20000 | New screen, service, or component |
| architecture | 35000 | Multi-file refactor, schema design |
| research | 65000 | Investigation spike, design exploration |

### Worker Launcher
```bash
node ~/agentic-sdlc/agents/worker.mjs --agent <name> --task <task-id>
```

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

**Tier 5: Browser E2E**
- **Run when:** any change to app screens, navigation, state management, or components
- **What it checks:** real browser rendering, navigation flows, state persistence, refresh resilience
- **Tools:** browser automation tool (e.g., Playwright, Puppeteer, or equivalent)
- **Gate:** must pass before deploy to production
- **How:** build the production artifact → serve locally → run browser E2E against the local build

- **After any code change:** run full test suite
- **Before every commit:** run defeat tests to catch anti-pattern regressions
- **After editing any AGENT.md:** run behavior tests (MUST pass before committing)

### Defeat Tests
Tests that catch known anti-patterns: `any` types, `console.log`, file size limits, missing error handling. Pattern hunt identifies recurring issues and proposes new defeat tests.

## Safety Mechanisms

1. **Conservation Mode** — `conservationMode: true` in budget.json halves all daily token limits
2. **Budget Circuit Breaker** — Blocks task assignment when an agent exceeds daily budget
3. **Stale Claim Detection** — Flags tasks in_progress > 30 minutes
4. **REM Sleep** — Weekly memory consolidation (recent → medium-term → long-term)
5. **Test-Gated Completion** — Cannot mark task complete without `passing` test status

## Notification & Approval Layer

Agents communicate with the human project owner through a pluggable notification channel.

### Configuration
Set `notification` in `project.json`:
- `provider`: `"openclaw"` (WhatsApp), `"file"` (local), or `"none"` (default)
- `channel`: Destination (phone number for OpenClaw)
- `triggers`: Which events auto-notify (blocker, budgetAlert, deployComplete, highSeverityFailure, dailySummary, approvalTimeout)

### Commands
```bash
node ~/agentic-sdlc/agents/notify.mjs send <message> [--media <path>]
node ~/agentic-sdlc/agents/notify.mjs approve <message> --task <id> [--timeout <secs>] [--media <path>]
node ~/agentic-sdlc/agents/notify.mjs check-mailbox
node ~/agentic-sdlc/agents/notify.mjs pending
node ~/agentic-sdlc/agents/notify.mjs resolve <id> approved|rejected [--note <text>]
node ~/agentic-sdlc/agents/notify.mjs status
```

### Approval Gates
- Add `"approvalRequired": true` to task JSON to require human approval before completion
- Approvals timeout after 1 hour → reminder → auto-approve after 2x timeout
- Approval files stored in `pm/approvals/`

### Automatic Triggers
| Trigger | Event | Message |
|---------|-------|---------|
| blocker | Task stale claim detected | "Task X has stale claim" |
| budgetAlert | Agent at 80%+ daily budget | "Agent X at Y% budget" |
| deployComplete | Task completed with passing tests | "Task X completed" |
| highSeverityFailure | Failure recorded in core memory | "New failure: ..." |
| dailySummary | Daily review runs | "N completed, M blocked" |
| approvalTimeout | Approval pending past timeout | "REMINDER: approval pending" |

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

### Micro (Minutes)
Pick → Implement → Test → Browser E2E (if frontend changed) → Commit → Next

### Daily
- After every task: update task JSON, record cost
- End of session: `node ~/agentic-sdlc/agents/cycles/daily-review.mjs`

### Weekly
- Weekly review: `node ~/agentic-sdlc/agents/cycles/weekly-review.mjs`
- Pattern review: `node ~/agentic-sdlc/agents/pattern-hunt.mjs`
- Memory cleanup: `node ~/agentic-sdlc/agents/rem-sleep.mjs`
- Behavior tests: `node ~/agentic-sdlc/agents/test-behavior.mjs`

### Automated via OpenClaw Cron (Optional)
- Weekly REM sleep: `openclaw cron add --name rem-sleep-weekly --cron "0 23 * * 0" --message "Run: node ~/agentic-sdlc/agents/rem-sleep.mjs" --session isolated`
- Daily cost report: `openclaw cron add --name cost-report-daily --cron "0 6 * * *" --message "Run: node ~/agentic-sdlc/agents/cost-tracker.mjs report" --session isolated`

### Monthly
- Behavior audit, agent versioning, compost cleanup, cost review

## Memory System

5-layer memory per agent:
- **core.json** — Permanent: identity, values, failure memories
- **long-term.json** — Patterns learned, corrections received
- **medium-term.json** — Current sprint context
- **recent.json** — What just happened this session
- **compost.json** — Failed ideas, deprecated approaches

```bash
node ~/agentic-sdlc/agents/memory-manager.mjs recall <agent>
node ~/agentic-sdlc/agents/memory-manager.mjs search <agent> "<query>"   # Semantic search (top 5)
node ~/agentic-sdlc/agents/memory-manager.mjs record <agent> <layer> <entry>
node ~/agentic-sdlc/agents/memory-manager.mjs consolidate <agent>
node ~/agentic-sdlc/agents/memory-manager.mjs compost <agent> <entry-id>
```

### Semantic Memory Search (Optional)
When `sentence-transformers` is installed (`pip install -r agents/requirements-nlp.txt`), memory search uses vector embeddings for semantic similarity. Without it, `search` falls back to full recall.

```bash
node ~/agentic-sdlc/agents/semantic-index.mjs embed <agent>              # Build index
node ~/agentic-sdlc/agents/semantic-index.mjs search <agent> "<query>"   # Search
node ~/agentic-sdlc/agents/semantic-index.mjs status <agent>             # Index stats
```

## Agent Evolution Protocol

All AGENT.md files MUST have `<!-- version: X.X.X | date: YYYY-MM-DD -->` as the first line. Increment version when adding failure memories or changing operating rules.

When editing any agent's AGENT.md:
1. **Before:** Snapshot: `node ~/agentic-sdlc/agents/version-snapshot.mjs snapshot`
2. **After:** Check memories: `node ~/agentic-sdlc/agents/migrate-memory.mjs --check`
3. **Apply:** Flag stale entries for review: `node ~/agentic-sdlc/agents/migrate-memory.mjs --apply`
4. **Validate:** Behavior tests: `node ~/agentic-sdlc/agents/test-behavior.mjs`

## Session Protocols

### On Session Start
1. Read CLAUDE.md (this file)
2. Check task queue status: `node ~/agentic-sdlc/agents/queue-drainer.mjs status`
2.5. Check mailbox: `node ~/agentic-sdlc/agents/notify.mjs check-mailbox`
3. Read PM dashboard: `pm/DASHBOARD.md`
4. Pick up next unblocked tasks

### On Context Getting Low
1. Update PM dashboard with current progress
2. Mark in-progress tasks with status notes in their task JSON
3. Commit and push all work

### Done Checklist (For Frontend Changes)

"Wrote the code" is NOT "shipped the fix." Every step must complete before reporting done:

1. **Tests pass** — unit + defeat + behavior
2. **Browser E2E pass** — run browser automation (e.g., Playwright) against the production build for any frontend change
3. **Commit + push** — atomic commit, push to remote
4. **Deploy via pipeline** — use the project's deploy script/pipeline, never manual deploys
5. **Post-deploy browser verification** — exercise every changed feature in a real browser against the production URL:
   - Screenshot at every step
   - Visually confirm each screenshot shows correct rendering
   - Fix and re-deploy if any verification fails
6. **Notify stakeholder LAST** — only after browser verification passes on production

## Instance Scaling

Agents can run multiple parallel instances when configured:
```json
// budget.json
{ "roy": { "maxInstances": 2, "dailyTokenLimit": 500000 } }
```
- Queue-drainer assigns up to `maxInstances` independent tasks with unique instance IDs (`roy-1`, `roy-2`)
- File pattern conflict detection prevents overlapping assignments
- All instances share the agent type's daily token budget
- `queue-drainer.mjs status` shows scale suggestions when queue is deep

## Human Task Queue

Bidirectional human-agent task management:
```bash
node ~/agentic-sdlc/agents/queue-drainer.mjs human-status              # List pending human tasks
node ~/agentic-sdlc/agents/queue-drainer.mjs human-complete <id>        # Mark done, auto-unblock agents
```
- Agents create human task JSON files when hitting unresolvable blockers
- `notify.mjs` sends immediate notifications on human task creation
- `daily-review.mjs` shows "YOUR Action Items" section at dashboard top
- Bottleneck detection alerts when human tasks are blocking agent work > 24h

## Agent Maturation Tracking

Agents mature through 6 levels: New → Corrected → Remembering → Teaching → Autonomous → Evolving

- `weekly-review.mjs` computes per-agent maturation metrics (corrections, self-corrections, review severity)
- `memory-manager.mjs` auto-advances maturation level on milestone achievements
- `test-behavior.mjs` includes regression detection (correction rate spikes)
- `daily-review.mjs` dashboard shows maturation level, weeks at level, and trend

## Capability Monitoring

Tracks which capabilities (memory, tests, notifications, etc.) agents actually use per task. Uses dual-layer tracking:

- **System-instrumented logs (primary):** Each capability script (`memory-manager.mjs`, `cost-tracker.mjs`, `notify.mjs`, etc.) appends a JSONL line to `pm/capability-log.jsonl` as a side effect of running. Agents cannot skip or falsify these entries.
- **Agent self-report (secondary):** Agents output a `<!-- CAPABILITY_CHECKLIST -->` JSON block at task completion with `skipReason` for unused capabilities. Provides context the system log can't infer.

Drift is detected when a `required` capability has zero system-log entries for 3+ consecutive tasks without a valid `skipReason`. The monitor cross-references both sources: if an agent claims it used memory but the system log has no matching entry, that discrepancy is flagged.

### Commands
```bash
node ~/agentic-sdlc/agents/capability-monitor.mjs check    # Scan recent tasks for drift
node ~/agentic-sdlc/agents/capability-monitor.mjs report   # Full per-agent usage rate table
node ~/agentic-sdlc/agents/capability-monitor.mjs status   # Quick health check
```

### Config
Add to `project.json`:
```json
{
  "capabilityMonitoring": {
    "enabled": true,
    "driftThreshold": 3,
    "windowSize": 10
  }
}
```

Per-agent expected capabilities are defined in `agents/capabilities.json` (scaffolded by `setup.mjs`). Each agent entry has `required`, `conditional`, and `notExpected` capability lists. Using a `notExpected` capability triggers a scope creep alert.

Enable drift notifications by adding `"capabilityDrift": true` to `notification.triggers` in `project.json`.

## Performance Feedback

Cost-tracker computes per-agent efficiency metrics:
- Average tokens per task (rolling 5-task window)
- First-attempt success rate
- Comparison to type average

Worker injects these metrics into agent prompts for self-awareness.

## Cycle History

All automated cycle runs are recorded in `pm/cycle-history.json` with type, timestamp, success/failure, and summary stats. Both daily and weekly reviews append entries automatically.

## Git Conventions

Branch naming: `feature/<short-description>` or `agent/<agent-name>/<task-id>`

## Script Reference

| Script | Purpose |
|--------|---------|
| `agents/queue-drainer.mjs` | Task queue management + human task queue |
| `agents/worker.mjs` | Generate agent prompts for subagent spawning |
| `agents/seed-queue.mjs` | Initialize task queue from seed-tasks.json template |
| `agents/review-hook.mjs` | Post-commit review hook (install/run) |
| `agents/memory-manager.mjs` | 5-layer memory CRUD + maturation tracking |
| `agents/rem-sleep.mjs` | Automated memory consolidation (+ similarity dedup) |
| `agents/migrate-memory.mjs` | Memory migration on prompt upgrades |
| `agents/version-snapshot.mjs` | Agent version snapshots |
| `agents/cost-tracker.mjs` | Token usage, efficiency metrics, session hours |
| `agents/test-behavior.mjs` | Agent prompt quality + maturation regression |
| `agents/four-layer-validate.mjs` | AST anti-pattern scanning |
| `agents/ast-analyzer.mjs` | TypeScript semantic analysis |
| `agents/pattern-hunt.mjs` | Review pattern mining (+ semantic clustering) |
| `agents/cycles/daily-review.mjs` | Daily summary + dashboard + bottleneck detection |
| `agents/cycles/weekly-review.mjs` | Weekly review + REM sleep + maturation metrics |
| `agents/matrix-client/matrix-cli.mjs` | Matrix communication CLI (+ schema validation) |
| `agents/start.sh` | System startup (Matrix + queue status) |
| `agents/notify.mjs` | Notification, approval, wellness checks |
| `agents/mailbox-sync.mjs` | Sync inbound WhatsApp messages to mailbox |
| `agents/semantic-index.mjs` | Vector embedding index for semantic memory search |
| `agents/embed.py` | Local embedding generation (sentence-transformers) |
| `agents/schema-validator.mjs` | JSON Schema validation for inter-agent data contracts |
| `agents/capability-monitor.mjs` | Capability drift detection, usage reports, health checks |
| `docs/comparison.md` | Framework comparison (vs LangGraph, Autogen, CrewAI, etc.) |
| `docs/troubleshooting.md` | Common issues and recovery patterns |

## Getting Started

### New Project Setup
```bash
node ~/agentic-sdlc/setup.mjs
```

This interactive script creates all necessary directories, config files, agent templates, and skills in your project.

### Existing Project
If your project already has an `agents/project.json`, all scripts will find it automatically when run from the project directory:
```bash
cd ~/your-project
node ~/agentic-sdlc/agents/queue-drainer.mjs status
```

## Daily Updates

This repo auto-updates daily at 04:00 via OpenClaw cron:
```bash
openclaw cron list  # See scheduled jobs
```

## Maturity Model

See `framework/maturity-model.md` for the 7-level maturity pyramid:
1. Foundation → 2. Automation → 3. Scale → 4. Quality → 5. Evolution → 6. Continuous Improvement → 7. Mastery

Each level builds on the previous — no skipping.
