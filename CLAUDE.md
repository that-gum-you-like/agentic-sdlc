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
6. If tests pass → commit → mark task completed
7. If tests fail → fix → re-run (max 3 attempts, then flag blocked)
8. Record learnings in memory
9. Pick next task → repeat

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

### Worker Launcher
```bash
node ~/agentic-sdlc/agents/worker.mjs --agent <name> --task <task-id>
```

## Testing Requirements

### Test Tiers
```bash
# Project's test command (from project.json)
<test-cmd>

# Four-layer validation (import resolution, checklist, AST, statistics)
node ~/agentic-sdlc/agents/four-layer-validate.mjs [--files <glob>] [--json]

# Agent prompt quality (behavior tests)
node ~/agentic-sdlc/agents/test-behavior.mjs [--dry-run]
```

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

## Iteration Cycles

### Micro (Minutes)
Pick → Implement → Test → Commit → Next

### Daily
- After every task: update task JSON, record cost
- End of session: `node ~/agentic-sdlc/agents/cycles/daily-review.mjs`

### Weekly
- Pattern review: `node ~/agentic-sdlc/agents/pattern-hunt.mjs`
- Memory cleanup: `node ~/agentic-sdlc/agents/rem-sleep.mjs`
- Behavior tests: `node ~/agentic-sdlc/agents/test-behavior.mjs`

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
node ~/agentic-sdlc/agents/memory-manager.mjs record <agent> <layer> <entry>
node ~/agentic-sdlc/agents/memory-manager.mjs consolidate <agent>
node ~/agentic-sdlc/agents/memory-manager.mjs compost <agent> <entry-id>
```

## Agent Evolution Protocol

When editing any agent's AGENT.md:
1. **Before:** Snapshot: `node ~/agentic-sdlc/agents/version-snapshot.mjs snapshot`
2. **After:** Check memories: `node ~/agentic-sdlc/agents/migrate-memory.mjs --check`
3. **Validate:** Behavior tests: `node ~/agentic-sdlc/agents/test-behavior.mjs`

## Script Reference

| Script | Purpose |
|--------|---------|
| `agents/queue-drainer.mjs` | Task queue management |
| `agents/worker.mjs` | Generate agent prompts for subagent spawning |
| `agents/seed-queue.mjs` | Initialize task queue from sprint tasks |
| `agents/memory-manager.mjs` | 5-layer memory CRUD |
| `agents/rem-sleep.mjs` | Automated memory consolidation |
| `agents/migrate-memory.mjs` | Memory migration on prompt upgrades |
| `agents/version-snapshot.mjs` | Agent version snapshots |
| `agents/cost-tracker.mjs` | Token usage logging and reporting |
| `agents/test-behavior.mjs` | Agent prompt quality validation |
| `agents/four-layer-validate.mjs` | AST anti-pattern scanning |
| `agents/ast-analyzer.mjs` | TypeScript semantic analysis |
| `agents/pattern-hunt.mjs` | Review pattern mining |
| `agents/cycles/daily-review.mjs` | End-of-day summary + dashboard update |
| `agents/cycles/weekly-review.mjs` | Weekly pattern review + REM sleep |
| `agents/matrix-client/matrix-cli.mjs` | Matrix communication CLI |
| `agents/start.sh` | System startup (Matrix + queue status) |

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
