# Design: spec-driven-maturity-gaps

**Date**: 2026-03-13
**Author**: Claude (with Bryce)
**Status**: design

---

## Context

### Current State

The framework has a mature OpenSpec workflow (proposal → design → specs → tasks → implement → archive) with 10 skills, a queue drainer, and 6 IT Crowd-themed agent personas. However, the workflow jumps from brain dump directly to proposals and WHEN/THEN specs, missing several intermediate layers that spec-driven methodology prescribes: features lists, user stories, numbered requirements, value rankings, phased roadmaps, dependency graphs, interface contracts, and parallelization analysis.

Templates exist for proposals, designs, specs, and tasks — but the spec template uses only Gherkin-style scenarios without REQ-xxx numbering, complexity estimates, or value fields. The tasks template lacks work stream assignments and parallel-safe notation.

No framework guidance exists for: requirements quality, agent lifecycle decisions, roadmap discipline, or the PM agent role.

### Problem Restatement

Add the missing spec-driven development layers (requirements format, roadmap, parallelization, lifecycle guidance) as templates and framework documentation.

---

## Goals

- Spec template supports REQ-xxx numbered requirements with 5-component structure (Actor/Action/Condition/Constraint/AC), complexity, and value
- New roadmap template with phases, demo sentences, success criteria, dependency chains, handoffs
- New framework guides for requirements quality, parallelization, and agent lifecycle
- Tasks template supports work stream assignments and parallel-safe marking
- CLAUDE.md documents roadmap discipline and PM workflow
- New braindump template as the intake artifact

---

## Non-Goals

- Changing the OpenSpec skill implementations (skills/*.md)
- Adding new scripts or modifying existing scripts
- Changing the queue-drainer, worker, or any .mjs files
- Retrofitting existing archived changes to the new format
- Adding actual agent personas (Requirements Reviewer, Business Analyst, PM) — that's a separate change

---

## Design

### Overview

This is a documentation-and-templates change. Seven new or modified files:

1. **`openspec/templates/spec.md.template`** — Enhanced with REQ-xxx format alongside existing WHEN/THEN scenarios
2. **`openspec/templates/roadmap.md.template`** — New: phased roadmap with Bryce's provided format
3. **`openspec/templates/tasks.md.template`** — Enhanced with work stream assignments and parallel notation
4. **`openspec/templates/braindump.md.template`** — New: intake artifact for raw ideas
5. **`framework/requirements-guide.md`** — New: how to write good requirements
6. **`framework/parallelization-guide.md`** — New: dependency graphs, interface contracts, work streams
7. **`framework/agent-lifecycle.md`** — New: create/specialize/terminate decisions, CTO mindset
8. **`CLAUDE.md`** — Enhanced with roadmap discipline section

### Components

#### Enhanced Spec Template

**File(s)**: `openspec/templates/spec.md.template`

The spec template will support BOTH formats:
- **Requirements section** with REQ-xxx numbering using Bryce's provided format (Statement, Acceptance Criteria checkboxes, Dependencies, Complexity S/M/L/XL, Value Critical/High/Medium/Low, Notes)
- **Scenarios section** preserving existing WHEN/THEN/AND format for behavioral verification
- Requirements map to scenarios: each REQ references which scenarios verify it

This is additive — existing WHEN/THEN format stays, REQ-xxx layer is added above it.

#### New Roadmap Template

**File(s)**: `openspec/templates/roadmap.md.template`

Uses Bryce's provided phase format:
- Phase N: Name, Duration, Demo Sentence, Requirements Included, Success Criteria, Risks/Blockers, Handoff to Phase N+1
- Summary section with dependency graph (text-based), critical path, parallel work streams
- Agent assignments per work stream

#### Enhanced Tasks Template

**File(s)**: `openspec/templates/tasks.md.template`

Add to each task:
- `Agent:` field (which agent/work stream)
- `Parallel:` yes/no/blocked-by notation
- `Complexity:` S/M/L/XL (inherited from requirement)

Add a new section: **Work Stream Summary** showing which agents handle which task groups.

#### New Braindump Template

**File(s)**: `openspec/templates/braindump.md.template`

Lightweight intake document:
- Raw ideas (unfiltered)
- Features wanted
- Edge cases and nice-to-haves
- Constraints and non-negotiables
- Target users

This is the entry point before `/openspec-new-change`.

#### Requirements Quality Guide

**File(s)**: `framework/requirements-guide.md`

Covers:
- The 5-component structure (Actor/Action/Condition/Constraint/AC)
- Granularity rules ("1-3 days of agent work")
- Anti-patterns (vague qualifiers, solution-as-requirement, multi-req bundling, missing AC)
- Quick checklist (testable? atomic? success+failure? dependencies? no implementation dictation? right size?)
- Requirement types: Functional, Non-Functional, Interface, Data
- Edge case discipline: think about failure modes during spec, not after build

#### Parallelization Guide

**File(s)**: `framework/parallelization-guide.md`

Covers:
- Dependency graph notation (text-based, showing REQ→REQ chains)
- Critical path identification
- Parallel track identification (don't share files, don't share tables, clear interface boundaries)
- Interface contract format (TypeScript interfaces or OpenAPI-style)
- Work stream assignments (Backend/Frontend/Infrastructure)
- The parallelization decision matrix
- Handoff points between streams

#### Agent Lifecycle Guide

**File(s)**: `framework/agent-lifecycle.md`

Covers:
- When to create a new agent (repeated context needed, specific expertise, clear boundary)
- When to specialize (hit context limits, need parallel independence, fresh perspective)
- When to terminate (phase complete, context stale, task done, switching contexts)
- Generic → specialized progression pattern
- CTO mindset: watch roadmap not code, monitor status/errors/progress, don't micromanage
- PM agent role: capture ideas, evaluate priority, update roadmap, prevent derailment
- "Never one more thing" rule: idea → capture in roadmap → return to current work
- In-repo roadmap (not GitHub Issues): structured, version-controlled, agent-parseable

#### CLAUDE.md Enhancement

**File(s)**: `CLAUDE.md`

Add new section: **Roadmap Discipline**
- In-repo roadmap convention
- "Never one more thing" rule
- PM agent workflow for capturing ideas
- Reference to `framework/agent-lifecycle.md`

Add to existing OpenSpec section:
- Reference to braindump template as entry point
- Reference to roadmap template
- Mention REQ-xxx format in specs

### Data Flow

```
braindump.md (raw ideas)
       ↓
openspec-new-change → proposal.md (problem/solution/value)
       ↓
openspec-continue-change → design.md (technical approach)
       ↓
openspec-continue-change → specs/ (REQ-xxx requirements + WHEN/THEN scenarios)
       ↓
openspec-continue-change → roadmap.md (phases with dependencies)
       ↓
openspec-continue-change → tasks.md (work items with agent assignments)
       ↓
seed-queue-from-openspec → task queue → agents build
```

Note: roadmap.md is a new artifact in the flow, positioned between specs and tasks.

### Schema / Interface Changes

No schema changes. All changes are markdown templates and documentation.

---

## Decisions

### Decision 1: Additive spec format (REQ-xxx + WHEN/THEN coexist)

**Chosen**: Add REQ-xxx requirements section above existing WHEN/THEN scenarios

**Considered**: Replace WHEN/THEN with REQ-xxx only

**Rationale**: WHEN/THEN scenarios are valuable for behavioral testing and are already in use across active changes. REQ-xxx adds the numbered, trackable layer on top. Requirements reference scenarios; scenarios verify requirements.

### Decision 2: Roadmap as separate template, not part of tasks

**Chosen**: `roadmap.md.template` as its own artifact

**Considered**: Embed phasing into `tasks.md.template`

**Rationale**: The roadmap is a planning document reviewed by the CTO/PM. Tasks are an execution document read by agents. Different audiences, different cadences. Roadmap changes when priorities shift; tasks change when work progresses.

### Decision 3: Guides in framework/ not docs/

**Chosen**: New guides go in `framework/`

**Considered**: Put them in `docs/`

**Rationale**: `framework/` contains methodology guidance (maturity model, validation patterns, iteration cycles, evolution timeline). `docs/` contains system documentation (agent system, memory protocol, troubleshooting). These new guides are methodology, not system docs.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Template bloat — too many fields overwhelms users | Medium | Medium | Mark optional fields clearly; keep required fields minimal |
| Existing changes don't match new format | Low | Low | Explicitly out of scope — no retrofitting |
| Roadmap template adds workflow friction | Low | Medium | Template is optional per change; only needed for multi-phase work |

---

## Testing Approach

- **Unit tests**: Test that all templates are valid markdown (no broken syntax)
- **Integration tests**: Verify openspec skills can still scaffold from updated templates
- **Manual verification**: Create a sample change using all new/updated templates end-to-end

---

## Next Step

Proceed to specs phase using `openspec-continue-change`.
