# April vs Cursor `/multitask`

**Source date**: 2026-05-27. Cursor's capabilities evolve fast — verify against Cursor's current docs before relying on this for production decisions.

## TL;DR

| Scenario | Recommended |
|---|---|
| Splitting a single in-session task into parallel subtasks while you watch | **Cursor `/multitask`** |
| Parallelizing across distinct queue items (different tasks, different agents, different domains) | **Framework April + queue-drainer** |
| Same task, different model attempts compared side-by-side | Either — `/multitask` is faster to fire; April has cost-tracking integration |
| Long-horizon autonomous run (hours-to-days, multiple commits, scheduled cycles) | **Framework queue-drainer + Cursor Background Agents** |
| Cross-tool work (some agents on Cursor, some on Claude Code, some on Aider) | **Framework April** — tool-agnostic by design |

## What each one is

**Cursor `/multitask`** (introduced in Cursor 3.2, April 2026) — a Cursor IDE slash command that breaks a single user goal into parallel subagent tasks. The subagents work inside Cursor's session, return results to the user. Designed for the "I want to refactor 5 files at once" pattern.

**Framework April** (Parallelization Analyst, `agents/templates/planning-agents/parallelization-analyst.md`) — a planning-phase agent that reads a roadmap, builds a dependency graph, and outputs `parallelization.md` defining work streams. Downstream execution agents then claim work from the streams (typically via the queue-drainer). Tool-agnostic — works whether the agents are Cursor, Claude Code, Aider, or a mix.

## When `/multitask` wins

- **In-session interactive work** — you're editing, you want help on multiple files simultaneously, you'll review the results immediately.
- **No queue/cron overhead** — fires in seconds; no `tasks/queue/*.json` plumbing required.
- **Cursor-native UX** — results appear in Cursor's sidebar, integrated with the editor's diff view.
- **Short horizon** — minutes-to-an-hour, ephemeral, no persistent state required.

## When April wins

- **Queue-level visibility** — every task is a versioned JSON file; cost-tracker, memory-manager, and cycle scripts all hook into it.
- **Cross-tool portability** — April's output (`parallelization.md`) is plain markdown; any AI client can read and act on it. `/multitask` is Cursor-only.
- **Long-horizon scheduling** — when you want a multi-day refactor with daily-review checkpoints, REM-sleep memory consolidation, and pattern-hunt drift detection, you need the framework's full apparatus.
- **OTel emission** — once `cost-tracker-otel` (proposed 2026-05-27) ships, framework-routed parallel work emits standard OTel GenAI spans for observability.
- **Replay regression** — once `replay-regression-ci-gate` (proposed 2026-05-27) ships, framework-routed runs feed the replay corpus.

## When either works

- **Same task, multiple model attempts** — both can fire N attempts and compare outputs. `/multitask` is faster to set up; framework's `model-manager.mjs` gives you cost-aware routing and historical fallback data.
- **Small parallel batches (2-4 items)** — either tool handles this fine. Pick based on whether you want session-ephemeral or queue-persistent.

## Pattern: combine them

The two are not exclusive. A common pattern:

1. **April plans the roadmap** — produces `parallelization.md` with N work streams.
2. **Queue-drainer dispatches stream-level tasks** to various agents (one per stream).
3. **Inside a stream's task, the executing agent uses `/multitask`** (if in Cursor) for sub-parallelism on a single file batch.

April is the macro-planner; `/multitask` is the micro-accelerator inside a single Cursor session.

## Cost notes

- `/multitask` consumes Cursor Pro+ credits per spawned subagent (verify current pricing).
- Framework April's planning step is cheap (one LLM call to produce `parallelization.md`); the cost lives in the downstream execution agents, governed by `budget.json` per-agent daily token limits.

## Related

- `agents/templates/planning-agents/parallelization-analyst.md` — April's full character sheet
- `framework/parallelization-guide.md` — dependency graph and work-stream patterns
- `docs/cursor-background-agents.md` — when to use Cursor's background agents (with vs without `/multitask`)
- `openspec/changes/cost-tracker-otel/` (proposed) — once shipped, makes framework parallel work observable in standard OTel backends
