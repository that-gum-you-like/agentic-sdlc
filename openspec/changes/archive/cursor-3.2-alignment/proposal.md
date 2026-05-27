# Proposal: cursor-3.2-alignment

**Date**: 2026-05-27
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: proposed

---

## Problem

Cursor shipped two notable capabilities in Mar/Apr 2026 that the framework hasn't documented or compared against:

1. **`/multitask` subagents** (Cursor 3.2, Apr 24 2026, per InfoQ) — breaks large tasks into parallel chunks. The framework has its own April parallelization agent serving the same role.
2. **Self-hosted cloud agents** (Mar 2026, per Cursor blog) — runs Cursor's background agents in-network rather than Cursor's cloud. Aligns with the framework's privacy-first posture (no third-party data sale to gov/LE).

Neither is a code gap; both are docs/playbook gaps. New users on Cursor Pro+ won't know how the framework's parallelization agent relates to `/multitask`, nor when to choose Cursor cloud agents vs. self-hosted vs. the framework's own queue-drainer.

---

## Discovery

- **Existing artifacts**:
  - `docs/cursor-automations-playbook.md` (shipped 2026-05-21) — covers the 7-Automation UI setup
  - `docs/cursor-background-agents.md` — earlier reference doc on Cursor's cloud agents
  - `agents/templates/planning/april/AGENT.md` — the April parallelization agent character sheet
- **Constraints**:
  - These features evolve fast; the docs must be dated and flag freshness
  - The framework should not lock users into Cursor; docs frame Cursor as one of N supported clients

---

## Proposed Solution

1. **Compare April vs. Cursor `/multitask`** in `docs/april-vs-cursor-multitask.md`:
   - When to prefer each (e.g. `/multitask` for in-session task splits; April for queue-level parallelization)
   - Prompt-pattern comparison
   - Cost/latency comparison
2. **Extend `docs/cursor-background-agents.md`** with a "Self-hosted vs. Cursor-hosted vs. framework-queue-drainer" decision table — privacy implications front-and-center per Bryce's privacy-first rule
3. **Update `.cursor/rules/sdlc-housekeeping.mdc`** with a brief reference to the new docs so Cursor agents discover them
4. No code changes
