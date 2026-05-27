# Design: cursor-3.2-alignment

**Date**: 2026-05-27
**Status**: design

---

## Context

Cursor's 2026 capabilities expand fast and overlap with the framework. Users need clarity on which tool to use when. Today they get patchy guidance: framework docs say "use April for parallelization"; Cursor docs say "use `/multitask`"; neither acknowledges the other exists.

The framework's stance: support multiple AI clients (Cursor, Claude Code, Windsurf, Aider), don't lock in. So the docs must compare neutrally and recommend per-scenario.

---

## Goals

- A user opening the framework in Cursor 3.2 understands when to use `/multitask` vs. April
- A privacy-conscious user understands the data-handling difference between Cursor cloud, self-hosted Cursor cloud, and the framework's local queue-drainer
- Updated comparison surfaces aren't hidden — at least one `.cursor/rules/*.mdc` references the new docs

## Non-Goals

- Locking in Cursor as the recommended client
- Building an abstraction layer over `/multitask` and April (they're conceptually different — leave them distinct)
- Promising feature parity going forward (Cursor will keep evolving)

---

## Design

### `docs/april-vs-cursor-multitask.md` structure

```
## TL;DR table

| Scenario | Recommended |
|---|---|
| Splitting a single in-session task into subtasks | Cursor /multitask |
| Parallelizing across queue items (different tasks, different agents) | Framework April + queue-drainer |
| Same task, different model attempts in parallel | Either; April has the cost-tracker integration |
| Long-horizon autonomous run (hours) | Framework queue-drainer |

## When /multitask wins
... (latency, no inter-process overhead, native to the Cursor UX)

## When April wins
... (queue-level visibility, cost tracking, cross-tool portability, OTel emission post cost-tracker-otel)

## Prompt-pattern comparison
... (side-by-side example)
```

### Self-hosted decision table extension to `docs/cursor-background-agents.md`

```
| Mode | Data leaves your network? | Setup complexity | Cost | When to choose |
|---|---|---|---|---|
| Cursor cloud (default) | YES (Cursor's infra) | Low | $$ | Quick start, low sensitivity |
| Cursor self-hosted | NO | Med-High (k8s, container infra) | $$$ | Privacy-first orgs, regulated industries |
| Framework queue-drainer (local) | NO | Low (single Node script) | $ | Solo dev, full local control |
```

### Cursor rule update

Add 3 lines to `.cursor/rules/sdlc-housekeeping.mdc`:

```
- For task parallelization, see docs/april-vs-cursor-multitask.md
- For cloud-agent deployment options, see docs/cursor-background-agents.md
```
