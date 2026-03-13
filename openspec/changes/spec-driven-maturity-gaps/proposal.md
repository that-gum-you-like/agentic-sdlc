# Proposal: spec-driven-maturity-gaps

**Date**: 2026-03-13
**Author**: Claude (with Bryce)
**Status**: proposed

---

## Problem

The agentic SDLC framework lacks several artifacts and workflow layers that are standard in spec-driven development methodology:

1. **No REQ-xxx requirement format.** Specs use only WHEN/THEN scenarios — no numbered requirements with Actor/Action/Condition/Constraint/Acceptance Criteria, no complexity estimates (S/M/L/XL), no per-requirement value ranking.

2. **No roadmap artifact.** There is no template or guide for phased roadmaps with demo sentences, success criteria, dependency chains, and phase handoff conditions. The backlog is a flat list. The maturity model is level-based but doesn't map features to delivery phases.

3. **No requirements quality guide.** No documentation of anti-patterns (vague qualifiers, solution-disguised-as-requirement, multiple-reqs-in-one), granularity rules ("can an agent implement this in 1-3 days?"), or the 5-component structure.

4. **No parallelization analysis or interface contracts.** No template for dependency graphs, work stream mapping, parallel track identification, or upfront API/type contracts that let agents work independently against shared interfaces.

5. **Tasks template lacks work stream assignments and parallel-safe marking.** Tasks are "ordered by dependency" but have no agent assignment field, no parallelization notation, no blocked-by references.

6. **No agent lifecycle guide.** Evolution timeline covers maturation of existing agents but not when/how to create, specialize, or terminate agent roles.

7. **No in-repo roadmap convention.** No guidance that the roadmap should live in the repo as structured markdown (not in GitHub Issues), no PM agent role for roadmap discipline, no "never one more thing" workflow guidance.

---

## Proposed Solution

Enhance the framework's templates, guides, and workflow to close these gaps:

- **New requirement format** in the spec template: REQ-xxx numbering, 5-component structure, complexity/value fields
- **New `roadmap.md.template`**: Phased roadmap with demo sentences, success criteria, handoff conditions, dependency mapping
- **New `framework/requirements-guide.md`**: Anti-patterns, granularity rules, quality checklist, 5-component breakdown
- **New `framework/parallelization-guide.md`**: Dependency graphs, work streams, interface contracts, parallel track identification
- **Enhanced `tasks.md.template`**: Work stream assignments, parallel-safe marking, blocked-by fields
- **New `framework/agent-lifecycle.md`**: When to create, specialize, terminate agents; CTO monitoring mindset
- **Enhanced CLAUDE.md**: Roadmap discipline section, PM agent role, "never one more thing" rule, in-repo roadmap convention

---

## Value Analysis

### Benefits

- Framework reaches parity with spec-driven development best practices
- New users get a complete pipeline: brain dump → features → user stories → requirements → acceptance criteria → roadmap → proposals → agents build
- Agents produce higher-quality specs with REQ-xxx numbering and 5-component structure
- Parallelization is explicit and plannable, not just implicit in queue routing
- Roadmap discipline prevents scope creep via PM agent workflow

### Costs

- **Effort**: Medium — mostly new documentation and template updates, no script changes
- **Risk**: Low — additive changes only, nothing breaks
- **Dependencies**: None — all templates and docs are independent

### Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Only update spec template | Misses roadmap, parallelization, lifecycle — incomplete |
| Add as backlog items separately | These are all part of one coherent maturity gap — splitting loses the narrative |
| Do nothing | Framework stays below spec-driven methodology standard |

### Decision

Yes — these are foundational workflow gaps that affect every project using the framework.

---

## Scope

### In Scope

- New and updated templates (spec, tasks, roadmap)
- New framework guides (requirements, parallelization, agent lifecycle)
- CLAUDE.md enhancements (roadmap discipline, PM workflow)
- Updated BACKLOG.md to remove items now addressed

### Out of Scope

- Script changes (queue-drainer, worker, etc.)
- New CLI skills
- Changes to existing openspec skills
- LinguaFlow-specific changes

---

## Next Step

If approved: proceed to design phase using `openspec-continue-change`.
