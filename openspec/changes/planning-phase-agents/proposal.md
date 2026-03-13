# Proposal: planning-phase-agents

**Date**: 2026-03-13
**Author**: Claude (with Bryce)
**Status**: proposed

---

## Problem

The SDLC has 6 execution-phase agents (Roy, Moss, Jen, Richmond, Denholm, Douglas) but zero planning-phase agents. The new spec-driven workflow (braindump → requirements → priorities → roadmap → parallelization → proposals → agents build) has no agent personas to drive the planning steps. Users must manually prompt Claude with long system prompts for each planning activity.

---

## Proposed Solution

Add 4 planning-phase agents to the framework, using IT Crowd characters:

1. **Bill Crouse** — Requirements Engineer (the office gossip who extracts information from everyone)
2. **Judy** — Business Value Analyst (Roy's pragmatic girlfriend who cuts through nonsense)
3. **Barbara** — Technical Product Manager (Denholm's wife who runs the household with iron discipline)
4. **April** — Parallelization Analyst (the efficiency expert)

Each agent gets: AGENT.md, memory directory (core.json), domain patterns, budget entry, capabilities config.

---

## Value Analysis

### Benefits
- Complete planning pipeline is agent-driven, not ad-hoc prompting
- Planning agents produce standardized artifacts (requirements.md, priorities.md, roadmap.md, parallelization.md)
- Consistent quality — agents reference the framework's requirements-guide, parallelization-guide
- Reusable across all projects using the framework

### Costs
- **Effort**: Medium — 4 AGENT.md files + config updates
- **Risk**: Low — additive, no existing functionality changes
- **Dependencies**: spec-driven-maturity-gaps change (completed)

### Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Generic prompts in docs | No memory, no consistency, no integration with queue |
| Single "planner" agent | Too broad — different planning phases need different expertise |
| Do nothing | Users must manually prompt each planning activity |

### Decision

Yes — these complete the spec-driven pipeline.

---

## Scope

### In Scope
- 4 new agent AGENT.md templates in framework
- 4 new agent directories in LinguaFlow project
- Updated domains.json, budget.json, capabilities config
- Updated CLAUDE.md references

### Out of Scope
- Modifying existing agent prompts
- New scripts
- Changes to queue-drainer logic
