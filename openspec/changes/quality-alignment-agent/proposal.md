# Proposal: quality-alignment-agent

**Date**: 2026-03-13
**Author**: Claude (with Bryce)
**Status**: proposed

---

## Problem

The framework has scattered quality monitoring tools (capability-monitor, test-behavior, pattern-hunt, four-layer-validate, review-hook) but no unified agent that:

1. Continuously monitors agent behavior and SDLC process alignment
2. Detects when agents skip steps, drift from templates, or produce misaligned output
3. Suggests specific prompt adjustments to improve agent alignment
4. Maintains a self-improving checklist that grows from observed issues
5. Feeds quality findings back into the roadmap/backlog

Each tool runs independently and on-demand. There's no holistic view of "are our agents following the SDLC process correctly?" and no automated feedback loop that adjusts agent prompts based on observed behavior.

---

## Proposed Solution

1. **New agent template**: `agents/templates/planning-agents/quality-alignment.md` — the Quality Alignment Agent persona
2. **New script**: `agents/alignment-monitor.mjs` — orchestrates all existing quality tools into a single unified check, generates alignment reports, and suggests prompt adjustments
3. **Self-improving checklist**: `pm/alignment-checklist.json` — grows over time as new patterns are detected
4. **Integration with existing tools**: Calls capability-monitor, test-behavior, pattern-hunt, and four-layer-validate; synthesizes their outputs into a single alignment report

---

## Value Analysis

### Benefits
- Single source of truth for "are agents aligned with the SDLC?"
- Automated prompt adjustment suggestions prevent recurring drift
- Self-improving checklist catches new anti-patterns over time
- Persistent quality monitoring (not just on-demand)
- Closes the feedback loop: observed issue → checklist update → prompt adjustment → better agent behavior

### Costs
- **Effort**: Medium — new script + template, leverages existing tools
- **Risk**: Low — additive, calls existing scripts
- **Dependencies**: capability-monitor, test-behavior, pattern-hunt (all exist)

### Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Just run existing tools manually | No synthesis, no prompt suggestions, no self-improvement |
| Add to Richmond's role | Richmond reviews code, not agent process alignment |
| Do nothing | Agents drift silently, quality degrades |

### Decision

Yes — this is the missing feedback loop in the SDLC.

---

## Scope

### In Scope
- Quality Alignment Agent template
- alignment-monitor.mjs script
- Self-improving alignment checklist
- CLAUDE.md documentation
- Behavior tests for the new artifacts

### Out of Scope
- Modifying existing quality tools
- Auto-editing AGENT.md files (suggests only, human approves)
- Changes to languageapp
