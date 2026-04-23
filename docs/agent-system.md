# Multi-Agent SDLC System

## Overview

The multi-agent SDLC system enables autonomous, high-quality software development through a team of specialized AI agents. Each agent has a defined domain, a daily token budget, a role-specific system prompt, and a persistent memory system. Agents collaborate through a shared task queue and a Matrix-based communication layer.

This document covers the agent roster concept, queue lifecycle, memory system, communication infrastructure, cost tracking, and operational commands.

## Agent Roster Concept

The reference implementation ships with six agents organized into two tiers based on their role and model cost:

**Core agents** handle implementation work and run on full-capability models (e.g., Claude Sonnet). They receive larger daily token budgets because implementation tasks are token-intensive.

**Support agents** handle review, release coordination, and documentation. They run on faster, lower-cost models and receive smaller budgets appropriate for their workload.

| Role Archetype | Typical Responsibility | Budget Tier |
|----------------|----------------------|-------------|
| Backend Developer | Services, database, state management, hooks | Core (high) |
| AI/ML Engineer | LLM integration, pipeline, specialized services | Core (high) |
| Frontend Developer | Screens, components, navigation, UI | Core (high) |
| Code Reviewer | Post-commit review, quality gates, anti-pattern detection | Support (lower) |
| Release Manager | Merge sequencing, versioning, CI/CD orchestration | Support (lower) |
| Documentarian | Architecture docs, guides, reference material | Support (lower) |

Agent slugs, models, and budgets are configured in `agents/budget.json`. Agent directories (`agents/<name>/`) contain the system prompt (`AGENT.md`) and memory files.

You can rename, add, or remove agents to fit your project. The queue router (`AGENT_DOMAINS` in `queue-drainer.mjs`) maps file patterns to agents for automatic assignment. See `docs/portability-guide.md` for customization details.

## Queue Lifecycle

The task queue is a directory of JSON files (`tasks/queue/`) that move through four stages.

### Stage 1: Task Creation

Tasks are created as JSON files in `tasks/queue/`:

```json
{
  "id": "T-001",
  "title": "Build user authentication flow",
  "description": "Implement sign-up, login, and session management",
  "priority": "HIGH",
  "assignedTo": null,
  "claimedAt": null,
  "status": "pending",
  "estimatedTokens": 20000,
  "blockedBy": [],
  "tags": ["auth", "backend", "services"],
  "test_status": null,
  "created": "2026-01-01T10:00:00Z"
}
```

**Priority levels** (processed in this order): `CRITICAL` → `HIGH` → `MEDIUM` → `LOW`

**Token estimation reference:**

| Task Type | estimatedTokens | Use Case |
|-----------|-----------------|----------|
| Simple fix | 3,500 | Single-file change, config update, minor bug |
| Feature | 20,000 | New screen, service, or component |
| Architecture | 35,000 | Multi-file refactor, schema design, cross-cutting concern |
| Research | 65,000 | Investigation spike, design exploration |

**Blocking dependencies:** Set `"blockedBy": ["T-002", "T-003"]` to prevent a task from being assigned until all listed tasks are complete.

### Stage 2: Task Assignment

```bash
node agents/queue-drainer.mjs run              # Assign next highest-priority task
node agents/queue-drainer.mjs run --parallel   # Assign all independent pending tasks
node agents/queue-drainer.mjs status           # Show queue state with priorities, claims, and stale tasks
```

**Assignment logic:**
1. Find the highest-priority pending task with no unresolved blockers
2. Check whether any agent has sufficient budget remaining today
3. Route to the best-qualified agent based on `affectedFiles` matching `AGENT_DOMAINS` patterns
4. Update task: `status: "in_progress"`, `assignedTo: <agent>`, `claimedAt: <timestamp>`
5. Generate the full agent prompt via `worker.mjs`

### Stage 3: Agent Execution (Micro Cycle)

Each agent follows a standardized execution loop on every task:

1. **Read task and memory** — Load the task JSON, then read `core.json`, `long-term.json`, and `medium-term.json`
2. **Implement** — Write code and make commits following the project's style rules
3. **Test** — Run the full test suite as defined in `project.json`'s `testCmd`
4. **Anti-pattern check** — Run defeat tests to catch regressions
5. **Conditional completion:**
   - Tests pass: commit, update task to `test_status: "passing"`, mark ready for completion
   - Tests fail: fix and re-run (maximum 3 attempts); if still failing, flag blockers and request human intervention
6. **Update memory** — Record learnings, failures, and observations in `recent.json`; record failures in `core.json`
7. **Pick next task** — Read queue status and claim the next available task

### Stage 4: Completion and Archival

```bash
node agents/queue-drainer.mjs complete <task-id> passing   # Mark task done (requires passing tests)
node agents/queue-drainer.mjs archive                       # Move completed tasks to tasks/completed/
```

`test_status: "passing"` is mandatory. The `complete` command is rejected for any other value. This is enforced unconditionally — see `docs/safety-mechanisms.md`.

Archived tasks are moved to `tasks/completed/` with a completion timestamp appended to the filename.

## Memory System

Each agent maintains a 5-layer memory system that persists across sessions and accumulates over the project lifetime. See `docs/memory-protocol.md` for the full schema reference and management commands.

**Summary of layers:**

| Layer | File | Contents | Lifetime |
|-------|------|----------|----------|
| Core | `core.json` | Identity, non-negotiable rules, critical failure memories | Permanent |
| Long-Term | `long-term.json` | Patterns learned across sprints, corrections received | Months |
| Medium-Term | `medium-term.json` | Current sprint context, active architecture decisions | Weeks |
| Recent | `recent.json` | Current session events, immediate learnings | Days |
| Compost | `compost.json` | Deprecated approaches, failed ideas to avoid | Permanent archive |

Agents must read memory before starting any task and write memory after completing any task. The weekly REM Sleep process promotes stale entries up the layer hierarchy automatically.

## Communication Infrastructure

### Matrix Server

Agents communicate through a local Matrix server (Conduwuit or any Synapse-compatible implementation). The server URL and credentials are configured in `agents/project.json`.

**Standard room layout:**

| Room | Purpose | Primary Participants |
|------|---------|----------------------|
| `#general` | Announcements, task assignments, blockers | All agents |
| `#backend` | Service design, schema changes, data layer | Backend agents |
| `#frontend` | Screen design, components, navigation | Frontend agents |
| `#ai-pipeline` | LLM integration, specialized pipelines | AI/ML agents |
| `#releases` | Deployment planning, version management | Release manager + all |
| `#reviews` | Code review handoffs, quality notes | Reviewer + all |
| `#docs` | Documentation updates, knowledge base | Documentarian + all |

You can add or remove rooms to match your team structure. Update agent system prompts to reference the correct room names.

**Communication commands:**

Matrix is optional — start your own Matrix/Synapse/conduwuit homeserver (or skip Matrix entirely and use another channel). Once your homeserver is running:

```bash
# Send a message to a room
node agents/matrix-client/matrix-cli.mjs send <agent> <room> "<message>"

# Read recent messages from a room
node agents/matrix-client/matrix-cli.mjs read <agent> <room> --limit 10
```

**Protocol:**
- Every task assignment is announced in `#general`
- Agents post status updates to their domain room after each significant step
- Blockers go to `#general` or the relevant domain room
- Code reviews are submitted via the standardized handoff template (see `agents/handoff-template.md`)

### Handoff Template

When submitting code for review, agents post to `#reviews` using this structure:

```markdown
## Task: [T-XXX] [Task Title]

### Summary
[2-3 sentence overview of what changed and why]

### Changes
- [File 1]: [What changed]
- [File 2]: [What changed]
- [Tests]: [New test count]

### Test Results
[Test runner output showing passing results]

### Questions for Reviewer
[Any concerns or areas requiring judgment]

### Ready for Review
Yes | No | Blocked
```

## Cost Tracking and Budget Management

### Recording Usage

Token usage is recorded after each task completion:

```bash
node agents/cost-tracker.mjs record <agent> <task-id> <input-tokens> <output-tokens>
```

Usage is stored in `agents/cost-log.json`:

```json
{
  "entries": [
    {
      "date": "2026-01-01",
      "agent": "agentname",
      "taskId": "T-042",
      "inputTokens": 15000,
      "outputTokens": 8000,
      "totalTokens": 23000,
      "timestamp": "2026-01-01T14:30:00Z"
    }
  ]
}
```

### Reports

```bash
node agents/cost-tracker.mjs report           # Daily summary per agent
node agents/cost-tracker.mjs report --weekly  # Weekly rollup
```

Sample report output:

```
=== Project Token Usage — 2026-01-01 ===

AGENTNAME (Domain)
  Usage:     45,200 / 100,000 tokens (45.2%)
  Budget:    54,800 remaining
  Tasks:     T-042, T-043

...

TOTAL:     394,500 / 600,000 tokens (65.75%)
```

### Budget Enforcement

The queue drainer checks cost log entries before assigning each task. If an agent's daily total meets or exceeds their limit in `agents/budget.json`, assignment is blocked. The task stays pending until another agent can take it or daily budgets reset at midnight UTC.

Conservation mode (`"conservationMode": true` in `budget.json`) halves all limits. See `docs/safety-mechanisms.md` for the full budget circuit breaker documentation.

## Failure Memory and Self-Correction

Every agent mistake is recorded as a structured entry in that agent's `core.json`. These entries drive future self-correction and are validated by automated behavior tests.

**Failure memory schema:**

```json
{
  "id": "agentname-failure-001",
  "date": "2026-01-01",
  "description": "Committed without running defeat tests, caught by reviewer",
  "lesson": "Always run defeat tests before committing. Anti-patterns compound.",
  "severity": "HIGH",
  "preventionRule": "Add defeat test step to micro cycle checklist, non-optional",
  "checklist": ["Run defeat tests", "Check for anti-patterns", "Verify test count increased"]
}
```

**Automated validation:**

```bash
node agents/test-behavior.mjs
```

This runs a 30-point test suite validating that agent system prompts correctly encode the micro cycle, memory protocol, anti-pattern rules, and other operating requirements. If `test-behavior.mjs` fails, the agent's `AGENT.md` has stale or incomplete content and must be updated.

## Model Manager

The **model-manager** is a dedicated agent responsible for token budget monitoring, model assignment, and performance tracking. It does not write code or execute tasks.

**How it works:**
- Runs on a cron schedule (default: every 15 minutes) or on-demand
- Reads cost-tracker utilization data for all agents
- At 90%+ budget: sends alert, prepares fallback model
- At 100%: writes `activeModel` to `budget.json` with next model from `fallbackChain`
- Logs all events to `pm/model-performance.jsonl` (the performance ledger)
- Daily reset clears all `activeModel` overrides, restoring preferred models

**Performance ledger** (`pm/model-performance.jsonl`): Append-only JSONL recording task completions with agent, model, provider, success/failure, tokens, duration. Enables data-driven model selection.

**Fallback chains** in `budget.json`: Each agent defines an ordered list of models to fall back to when budget runs out (e.g., `["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"]`).

**Model preferences** in `budget.json`: Per-task-type overrides (e.g., `"simple fix": "claude-haiku-4-5"`, `"architecture": "claude-opus-4-6"`). The worker reads these when spawning agents.

```bash
node agents/model-manager.mjs check      # Monitor utilization, swap if needed
node agents/model-manager.mjs report     # Stats by agent × model
node agents/model-manager.mjs recommend  # Data-driven model suggestions
node agents/model-manager.mjs reset      # Daily budget reset
```

## Operational Commands Reference

### Queue Management

```bash
node agents/queue-drainer.mjs run                     # Assign next task by priority
node agents/queue-drainer.mjs run --parallel          # Assign all independent pending tasks
node agents/queue-drainer.mjs status                  # Show queue state with priorities, claims, stale flags
node agents/queue-drainer.mjs assign <id>             # Manually assign a specific task
node agents/queue-drainer.mjs claim <id> <agent>      # Claim a task for a specific agent
node agents/queue-drainer.mjs release <id>            # Release a claimed task back to pending
node agents/queue-drainer.mjs reset <id>              # Reset a stuck task to pending, clearing assignment
node agents/queue-drainer.mjs complete <id> passing   # Mark task done (requires passing test status)
node agents/queue-drainer.mjs archive                 # Move completed tasks to tasks/completed/
```

### Memory Management

```bash
node agents/memory-manager.mjs recall <agent>                     # Show agent's full memory across all layers
node agents/memory-manager.mjs record <agent> <layer> <entry>     # Record a new memory entry
node agents/memory-manager.mjs consolidate <agent>                # Promote stale memories up the layer hierarchy
node agents/memory-manager.mjs compost <agent> <entry-id>         # Move a specific entry to compost
```

### Cost Tracking

```bash
node agents/cost-tracker.mjs record <agent> <task> <input> <output>   # Record token usage
node agents/cost-tracker.mjs report                                    # Daily cost summary
node agents/cost-tracker.mjs report --weekly                           # Weekly cost summary
```

### Matrix Communication (Optional)

```bash
# Matrix/conduwuit/Synapse homeserver runs separately — not shipped with this framework.
node agents/matrix-client/matrix-cli.mjs send <agent> <room> "<message>"
node agents/matrix-client/matrix-cli.mjs read <agent> <room> --limit N
```

### Testing and Validation

```bash
<testCmd from project.json>               # Full unit suite (e.g., npm test, jest, etc.)
npm run test:integration                  # Service-to-store integration tests
npm run test:defeat                       # Anti-pattern detection scans
node agents/test-behavior.mjs             # Agent prompt validation — 30 checks
```

### Memory Consolidation

```bash
node agents/rem-sleep.mjs --dry-run       # Preview what will be promoted or composted
node agents/rem-sleep.mjs                 # Apply REM sleep consolidation
```

### Worker Launcher

Generate a full agent prompt with injected memory for subagent spawning:

```bash
node agents/worker.mjs --agent <name> --task <task-id>
```

## Human Communication

In addition to agent-to-agent communication via Matrix, the framework provides a notification and approval layer for human-in-the-loop workflows.

### Notification Providers

| Provider | Mechanism | Use Case |
|----------|-----------|----------|
| `openclaw` | WhatsApp via OpenClaw CLI | Production — real-time mobile notifications |
| `file` | Append to local markdown file | Development — no external dependencies |
| `none` | Print to stdout | Default — autonomous operation |

Configuration lives in `project.json` under the `notification` key. See the main CLAUDE.md for command reference.

### Approval Workflow

1. Agent requests approval: `notify.mjs approve "Ready to deploy?" --task T-042`
2. Notification sent to human via configured provider
3. Approval file created at `pm/approvals/<id>.json`
4. Human responds via messaging channel or `notify.mjs resolve`
5. Agent checks with `notify.mjs check-mailbox` or `notify.mjs pending`
6. On timeout: reminder sent → on double timeout: auto-approved with warning logged

### Mailbox

The mailbox file (`pm/mailbox.md`) serves as the async communication channel:
- Agent messages: `**[timestamp] Agent →** message`
- Human messages: `**[timestamp] Human →** message`
- Plain text responses are also parsed for approval keywords

## Architecture Benefits

1. **Specialization** — Each agent has deep expertise in their domain and does not cross into others
2. **Parallelization** — Independent tasks run simultaneously across agents
3. **Transparency** — Every decision, failure, and learning is recorded and traceable
4. **Autonomy** — Agents execute the full micro cycle without human intervention per task
5. **Safety** — Budget limits, stale claim detection, test-gated completion, and memory consolidation all run automatically
6. **Scalability** — New agents and new tasks can be added without redesigning the system
7. **Auditability** — Every task, test result, commit, and memory entry is permanently stored
8. **Continuous learning** — Agents improve over time through failure memories and weekly REM sleep
