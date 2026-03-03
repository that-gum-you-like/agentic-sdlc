# Multi-Agent SDLC — Memory Protocol

Each agent in the system maintains a 5-layer memory architecture that persists across sessions, accumulates over the project lifetime, and drives self-correction. Agents read memory before starting any task and write memory after completing any task. Memory is never optional.

## Overview

| Layer | File | Contents | Managed By |
|-------|------|----------|------------|
| Core | `core.json` | Identity, non-negotiables, critical failure memories | Agent + human |
| Long-Term | `long-term.json` | Cross-sprint patterns, corrections received | REM Sleep promotion |
| Medium-Term | `medium-term.json` | Sprint context, active architecture decisions | Agent + REM Sleep |
| Recent | `recent.json` | Session events, immediate learnings | Agent, every task |
| Compost | `compost.json` | Deprecated approaches, failed ideas | Agent + memory-manager |

Memory files live at `agents/<name>/memory/` within the project tree. Each file is a JSON array or object containing typed entries.

## Layer 1: Core Memory (core.json)

**What it holds:** The agent's identity, foundational operating rules, and critical failure memories. This layer is permanent — entries are never promoted away or deleted. It represents what the agent has learned the hard way.

**Entry schema:**

```json
{
  "id": "agentname-failure-001",
  "date": "2026-01-15",
  "description": "Committed code without running defeat tests, anti-patterns reached production",
  "lesson": "Always run defeat tests before committing. Anti-patterns compound across the codebase.",
  "severity": "HIGH",
  "preventionRule": "Add defeat test step to micro cycle. Non-optional. Never skip under time pressure.",
  "checklist": [
    "Run defeat tests",
    "Verify test count increased from previous run",
    "Check for silent fallbacks"
  ]
}
```

**Severity levels:** `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`

**When to write:** Any time an agent makes a mistake that is caught by a reviewer, causes a regression, or violates a non-negotiable rule. The failure entry must include a concrete prevention rule, not just a description of what went wrong.

**Reading rule:** Agents must read `core.json` first, before any other memory layer, before starting any task.

## Layer 2: Long-Term Memory (long-term.json)

**What it holds:** Patterns that have proven reliable across multiple sprints. Domain expertise accumulated over weeks and months. Corrections the agent has internalized.

**Entry schema:**

```json
{
  "id": "agentname-pattern-001",
  "date": "2026-01-20",
  "pattern": "When integrating external APIs, always validate response structure before passing downstream",
  "trustScore": 0.95,
  "frequency": "Every task involving external service calls",
  "source": "Promoted from medium-term after consistent validation across 5 tasks"
}
```

**How entries arrive:** Most long-term entries are promoted from `medium-term` by the REM Sleep process after they age past 30 days. You can also write directly to long-term for patterns that are immediately clear and enduring.

**Deduplication:** REM Sleep removes duplicate entries in long-term on each consolidation run.

## Layer 3: Medium-Term Memory (medium-term.json)

**What it holds:** Current sprint context. Active architecture decisions. Patterns that have been observed more than once but have not yet been validated long enough to promote to long-term.

**Entry schema:**

```json
{
  "id": "sprint-context-003",
  "date": "2026-03-01",
  "context": "Phase 3 in progress: services complete, beginning quality pass",
  "relevantTasks": ["T-045", "T-046", "T-047"],
  "decisionContext": "Switched from X to Y for Z reason — do not revert without team discussion",
  "expiresAfter": "2026-04-01"
}
```

**How entries arrive:** Agents write sprint context entries here at the start of a new phase of work. REM Sleep promotes entries older than 30 days to long-term.

**When to update:** At the start of each sprint, when a significant architecture decision is made, or when context from the previous session is needed to avoid rework.

## Layer 4: Recent Memory (recent.json)

**What it holds:** What happened in the current session. The last task completed. Immediate learnings that have not yet been evaluated for promotion. Next focus areas.

**Entry schema:**

```json
{
  "timestamp": "2026-03-03T14:30:00Z",
  "event": "Completed T-042: Added analytics dashboard",
  "tokens": {
    "input": 15000,
    "output": 8000
  },
  "learnings": "Component composition patterns prevented duplication in this case",
  "failures": null,
  "nextFocus": "Integration tests for the analytics service"
}
```

**Writing rule:** After every task, the agent records a `recent` entry covering what was done, tokens used, what was learned, and what to focus on next. This is the primary mechanism for continuity across context window resets.

**Promotion:** REM Sleep promotes entries older than 7 days to `medium-term`. Recent memory is expected to grow and be trimmed regularly.

## Layer 5: Compost Memory (compost.json)

**What it holds:** Approaches that were tried and failed. Deprecated libraries or patterns. Ideas that were explored and rejected. Architectural paths that were considered but abandoned.

**Entry schema:**

```json
{
  "id": "failed-approach-001",
  "date": "2026-01-10",
  "approach": "Attempted to use solution X for problem Y",
  "whyFailed": "Caused Z issue, conflicted with the small-files principle, rejected by reviewer",
  "lesson": "Do not revisit X for Y. Use the established pattern instead.",
  "composted": "2026-02-15"
}
```

**Purpose:** Compost prevents an agent from re-attempting approaches that were already evaluated and rejected. Without compost, agents may cycle through the same failed ideas across sessions.

**How entries arrive:** Manually via `memory-manager.mjs compost`, or via REM Sleep when an entry is flagged as `"deprecated"`. Compost entries are never promoted — they are permanent.

## Memory Manager Commands

```bash
# Display an agent's full memory across all five layers
node agents/memory-manager.mjs recall <agent>

# Record a new entry in a specific layer
node agents/memory-manager.mjs record <agent> <layer> '<entry-json>'

# Promote stale entries up the layer hierarchy for a specific agent
node agents/memory-manager.mjs consolidate <agent>

# Move a specific entry to compost
node agents/memory-manager.mjs compost <agent> <entry-id>
```

**Layer values for record command:** `core`, `long-term`, `medium-term`, `recent`, `compost`

**Examples:**

```bash
# Recall full memory for an agent before spawning a subagent
node agents/memory-manager.mjs recall backend-agent

# Record a failure memory after a code review rejection
node agents/memory-manager.mjs record backend-agent core '{"id":"failure-002","date":"2026-03-03","description":"...","lesson":"...","severity":"HIGH"}'

# Move a deprecated architecture approach to compost
node agents/memory-manager.mjs compost backend-agent failed-approach-001
```

## REM Sleep (Weekly Consolidation)

REM Sleep is the automated memory maintenance process that keeps memory layers healthy over time. It runs on a weekly schedule and can also be triggered manually at any time.

### What It Does

1. Scans `recent.json` for entries older than 7 days — promotes them to `medium-term`
2. Scans `medium-term.json` for entries older than 30 days — promotes them to `long-term`
3. Scans `long-term.json` for duplicate entries — removes the older duplicates, keeping the most recent
4. Scans all layers for entries flagged `"deprecated": true` — moves them to `compost`

Promotions copy the entry to the destination layer and remove it from the source layer. The entry's content is preserved exactly.

### Manual Execution

```bash
# Preview all changes without writing anything
node agents/rem-sleep.mjs --dry-run

# Apply consolidation across all agents
node agents/rem-sleep.mjs
```

Always run `--dry-run` first when consolidating manually to verify the expected promotions before writing.

### Scheduled Execution

REM Sleep runs automatically every Sunday at 23:00 UTC via cron. Manage the schedule with:

```bash
openclaw cron list                          # See all scheduled jobs
openclaw cron enable rem-sleep-weekly       # Enable the weekly job
openclaw cron disable rem-sleep-weekly      # Disable (e.g., during maintenance)
openclaw cron run rem-sleep-weekly          # Trigger immediately
```

### Why REM Sleep Matters

Without periodic consolidation:
- `recent.json` grows unbounded and eventually crowds out useful signal with noise
- Important patterns from individual sessions are never elevated to long-term storage
- Agents lose continuity across weeks because old `recent` entries expire without promotion
- Duplicate entries accumulate in `long-term`, reducing signal quality

REM Sleep ensures that what agents learn in individual sessions does not disappear when `recent` entries age out. The most important learnings are systematically elevated to where they will be read on future tasks.

## Memory Protocol for Agent Sessions

Every agent session follows this memory access pattern:

**Before starting any task:**
1. Read `core.json` — review non-negotiables and failure memories
2. Read `long-term.json` — recall established patterns and domain expertise
3. Read `medium-term.json` — orient to current sprint context and active decisions

**After completing any task:**
1. Write a `recent` entry covering: what happened, tokens used, learnings, next focus
2. If a mistake was made: write a `core` failure entry immediately
3. If a new pattern was observed: write a `medium-term` or `long-term` entry as appropriate

**Cross-session continuity:** The next session reads `recent.json` to pick up where the previous session left off. This is the primary handoff mechanism between context windows.
