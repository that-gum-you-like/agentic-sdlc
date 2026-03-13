# Agent Lifecycle Guide

When to create, specialize, and terminate agents. Plus the CTO mindset for monitoring multi-agent work.

## When to Create a New Agent

Create a specialized agent when:
- **Multiple related tasks need the same context** — a group of work items share domain knowledge
- **Specific expertise is required** — security, UI/UX, data pipeline, etc.
- **Clear boundary exists** — the agent's work doesn't heavily overlap with another agent's files

Don't create a new agent when:
- A generic agent can handle it alongside current work
- The task is a one-off (less than a day)
- You'd need to duplicate most of the context another agent already has

## When to Specialize

Start generic, specialize when needed:

```
Start: 1 generic agent building MVP

After Phase 1: Split into:
- Backend agent (knows API patterns)
- Frontend agent (knows UI patterns)
- Infra agent (knows deployment)
```

Specialize when:
- **Hit context limits** — agent is juggling too many concerns
- **Need parallel independence** — two work streams must run simultaneously
- **Need fresh perspective** — existing agent has accumulated assumptions

Each specialized agent reads CLAUDE.md (shared context) + the roadmap (current phase) + focuses on their domain.

## When to Terminate

Terminate when:
- Phase is complete (requirements → now building different phase)
- Agent context is stale (working from old roadmap version)
- Specialized task is done (e.g., security audit complete)
- Switching contexts entirely

Don't terminate when:
- Agent made a mistake (correct it instead)
- You need a break (agents can wait)
- Switching files (same agent can handle multiple files in its domain)

## The CTO Mindset

You are the CTO. Your job is to make decisions, not write code.

### What to monitor

| Watch | Don't Watch |
|-------|-------------|
| Roadmap progress (requirements completing) | Every line of code being written |
| Agent status (working/blocked/done) | File changes in real-time |
| Error messages (blockers) | Individual function implementations |
| Test results (failures need intervention) | Code style preferences |

### When to intervene

**Intervene:**
- Agent asks a question
- Agent reports an unresolvable error
- Agent makes an architectural decision you disagree with
- Tests are failing repeatedly

**Don't intervene:**
- Agent is writing boilerplate (let it finish)
- Agent is refactoring (trust the process)
- Code style isn't your preference (consistency > preference)

## Roadmap Discipline

The biggest threat to your roadmap isn't bad planning — it's "one more thing."

### The "Never One More Thing" Rule

When you get an idea mid-work:

1. **Capture it** — add to roadmap backlog or openspec BACKLOG.md
2. **Don't execute** — stay focused on current task/phase
3. **Review later** — evaluate in your next planning session

### The PM Workflow

Use a PM agent (or PM mindset) to:
1. Capture new ideas as requirements
2. Evaluate them for value priority
3. Update the roadmap
4. Keep you from derailing current work

When ideas overflow, talk to the PM agent — not the dev agent.

### In-Repo Roadmaps

Keep your roadmap in your repo as structured markdown, not in GitHub Issues.

**Why:**
- **Agents need structure** — Markdown files are easy to parse
- **You control the signal** — No external noise from comments/threads
- **Version controlled** — Track how priorities change over time
- **Directly interactable** — Agents can read and update the roadmap

GitHub Projects and PRs are great for collaboration. But the authoritative backlog lives in-repo.

## Agent Role Examples

Common agent personas for spec-driven development:

| Role | Focus | When Active |
|------|-------|-------------|
| Requirements Reviewer | Validates requirement quality against the 5-component checklist | Planning phase |
| Business Analyst | Evaluates business value, prioritizes features | Planning phase |
| Project Manager | Manages roadmap, captures ideas, prevents derailment | Always |
| Backend Developer | API, database, services | Implementation |
| Frontend Developer | UI, components, styling | Implementation |
| Reviewer | Code review, quality gates | Post-implementation |

Not all roles need to be active simultaneously. Activate based on current phase.

## Lifecycle Summary

```
Project Start
    → 1 generic agent (exploration, brain dump → requirements)
    → Add PM agent (roadmap management)

Phase 1 (MVP)
    → Specialize: Backend + Frontend agents
    → PM monitors roadmap

Phase 2+ (Features)
    → Add agents as work streams demand
    → Terminate phase-specific agents when phase completes
    → PM continues capturing and prioritizing

Maintenance
    → Reduce to 1-2 agents
    → PM handles incoming requests
```
