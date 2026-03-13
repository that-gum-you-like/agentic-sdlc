# Proposal: production-workflow-maturity

**Date**: 2026-03-13
**Author**: Claude (with Bryce)
**Status**: proposed

---

## Problem

The framework has strong infrastructure (queue, memory, Matrix, cron, review hooks) but lacks the "last mile" operational patterns that real production autonomous workflows need:

1. **No `plans/` directory convention.** Planning artifacts (requirements.md, priorities.md, roadmap.md, parallelization.md) have no standardized home in projects. setup.mjs doesn't create it.

2. **No production prompt playbook.** Users have no library of ready-to-use prompts for common workflows (assign work, fix tests, garden roadmap, deploy, review architecture, etc.). They must compose prompts from scratch every time.

3. **No autonomous headless launcher.** worker.mjs generates prompts but doesn't spawn Claude Code instances. There's no script to run agents headlessly, check roadmaps, claim work, and auto-commit — the core of autonomous operation.

4. **No dev log convention.** No human-readable narrative journal of what was done. cycle-history.json is machine-readable; PM dashboard is status, not history.

5. **No roadmap gardening workflow.** openspec changes get archived, but roadmap items don't. No pattern for moving completed roadmap phases to an archive while keeping the active roadmap focused.

6. **No agent trigger conditions documentation.** domains.json handles file-pattern routing, but there's no human-readable "when to use which agent" reference beyond the lifecycle table.

---

## Proposed Solution

1. **`plans/` directory convention** — Add to setup.mjs, document in CLAUDE.md, create `plans/completed/` for archives
2. **Production prompt playbook** — `framework/prompt-playbook.md` with categorized ready-to-use prompts adapted for our SDLC
3. **Autonomous launcher script** — `agents/autonomous-launcher.sh` that spawns Claude Code headlessly, reads roadmap, claims work, auto-commits
4. **Dev log convention** — `plans/devlog.md` as append-only narrative journal, updated by agents after each task
5. **Roadmap gardening** — `agents/garden-roadmap.mjs` script + documentation for periodic roadmap maintenance
6. **Agent trigger conditions** — `framework/agent-routing.md` with comprehensive "when X, use agent Y" reference

---

## Value Analysis

### Benefits
- Users can copy-paste prompts for common workflows immediately
- Autonomous operation without human orchestration
- Clean planning artifact organization across all projects
- Human-readable progress history
- Focused roadmaps that don't grow unbounded

### Costs
- **Effort**: Medium — 2 new scripts, 3 new docs, setup.mjs update
- **Risk**: Low — additive changes, autonomous launcher is opt-in
- **Dependencies**: planning-phase-agents change (completed), spec-driven-maturity-gaps change (completed)

### Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Document prompts in README | Too long, README should stay focused on quick start |
| Skip autonomous launcher | Core value prop of the framework — autonomous agents |
| Do nothing | Users reinvent these patterns every project |

### Decision

Yes — these complete the operational layer of the framework.

---

## Scope

### In Scope
- `plans/` directory in setup.mjs
- framework/prompt-playbook.md
- agents/autonomous-launcher.sh
- Dev log convention and documentation
- Roadmap gardening script
- Agent routing reference

### Out of Scope
- Changes to existing scripts (queue-drainer, worker, etc.)
- VM-based deployment (cloud-specific)
- MCP server creation
- Changes to languageapp
