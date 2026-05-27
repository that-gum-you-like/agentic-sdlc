# Proposal: claude-md-token-diet

**Date**: 2026-05-27
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: proposed

---

## Problem

`CLAUDE.md` is 33 KB / ~2000 lines and is loaded on every Claude Code request. `AGENTS.md` is 162 lines (just over the ASDLC.io 2026 recommended ≤150-line ceiling). Always-loaded context bills against every turn for every agent for every user — small fixed cost, large recurring multiplier.

Research signal:
- ASDLC.io 2026 study of 2500+ repos: AGENTS.md beyond 150 lines yields diminishing returns and raises inference cost ~20-23%
- Anthropic prompt-caching guidance: only the static prefix is cached; bloated always-loaded context still costs cache-write tokens

`CLAUDE.md` covers many sections that are reference material consulted on-demand (Glossary, Iteration Cycles detail, Capability Monitoring details, full Prompt Playbook). These don't need to be in the always-loaded prefix.

---

## Discovery

- **Files involved**:
  - `CLAUDE.md` (33 KB, ~2000 lines, always-loaded by Claude Code)
  - `AGENTS.md` (162 lines, loaded by AGENTS.md-spec-aware agents)
- **Existing sections in `CLAUDE.md`** (per inventory):
  Non-Negotiable Rules, OpenSpec Workflow, Intake & Spec Format, Roadmap Discipline, Agent System, Micro Cycle, Documentation Mode, Testing Requirements, Safety Mechanisms, Notification/Approval, Permission Tiers, Human Wellness Guardrails, Iteration Cycles, Memory System, Evolution Protocol, Session Protocols, Scaling, Human Task Queue, Maturation Tracking, Capability Monitoring, Performance Feedback, Git Conventions, Plans Directory, Autonomous Operation, Quality Alignment, Agent Routing, Prompt Playbook, Voice Input, Getting Started, Daily Updates, Maturity Model.
- **Constraint**: Must not break agents that depend on specific section content. The hot path (Non-Negotiable Rules, Micro Cycle, OpenSpec Workflow, Testing Requirements, Safety Mechanisms) stays in `CLAUDE.md`. The rest moves to on-demand docs in `docs/`.

---

## Proposed Solution

Two parallel slim-downs:

1. **`CLAUDE.md` → core + appendix split**
   - Keep in `CLAUDE.md` (target ≤500 lines): Non-Negotiable Rules, OpenSpec Workflow summary, Micro Cycle, Testing Requirements summary, Safety Mechanisms summary, Memory System summary, Done Checklist, pointers to appendix
   - Move to `docs/appendix/` (one file per topic): full Agent System roster, Iteration Cycles, Capability Monitoring, Performance Feedback, Prompt Playbook, Voice Input setup, Glossary, Maturity Model detail
   - Each `CLAUDE.md` summary section ends with `→ See docs/appendix/<topic>.md`

2. **`AGENTS.md` → ≤150 lines**
   - Audit current 162 lines; remove any LLM-generated padding
   - Target: build/test commands, "definition of done", escalation rules, monorepo scoping — in that priority order
