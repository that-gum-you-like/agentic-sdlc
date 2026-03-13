# Spec: Framework Guides

**Date**: 2026-03-13
**Author**: Claude (with Bryce)
**Status**: specs

---

## Overview

Three new framework guide documents covering requirements quality, parallelization, and agent lifecycle management.

---

## Requirements

### REQ-006: Requirements Quality Guide

**Statement:** The framework shall include a `framework/requirements-guide.md` documenting the 5-component requirement structure, granularity rules, anti-patterns, quality checklist, and requirement types.

**Acceptance Criteria:**
- [ ] Covers 5 components: Actor, Action, Condition/Trigger, Constraint, Acceptance Criteria
- [ ] Granularity rule: "Can an agent implement this in 1-3 days?"
- [ ] Documents 4+ anti-patterns (vague qualifiers, solution-as-requirement, multi-req bundling, missing AC)
- [ ] Quick checklist with 6+ questions
- [ ] Covers requirement types: Functional, Non-Functional, Interface, Data
- [ ] Edge case discipline section

**Dependencies:** None
**Complexity:** M
**Value:** Critical

### REQ-007: Parallelization Guide

**Statement:** The framework shall include a `framework/parallelization-guide.md` documenting dependency graphs, interface contracts, work stream mapping, and the parallelization decision matrix.

**Acceptance Criteria:**
- [ ] Dependency graph notation with examples
- [ ] Critical path identification method
- [ ] Parallel track criteria (no shared files, no shared tables, clear interfaces)
- [ ] Interface contract format (TypeScript interfaces example)
- [ ] Work stream template (Backend/Frontend/Infrastructure)
- [ ] Decision matrix (situation → strategy table)

**Dependencies:** None
**Complexity:** M
**Value:** High

### REQ-008: Agent Lifecycle Guide

**Statement:** The framework shall include a `framework/agent-lifecycle.md` documenting when to create, specialize, and terminate agents, plus CTO mindset and roadmap discipline.

**Acceptance Criteria:**
- [ ] Create criteria: repeated context, specific expertise, clear boundary
- [ ] Specialize criteria: context limits, parallel independence, fresh perspective
- [ ] Terminate criteria: phase complete, context stale, task done
- [ ] Generic → specialized progression pattern
- [ ] CTO mindset: watch roadmap/status/errors, not every line of code
- [ ] PM workflow: capture ideas → evaluate → update roadmap → return to current work
- [ ] "Never one more thing" rule
- [ ] In-repo roadmap rationale (not GitHub Issues)

**Dependencies:** None
**Complexity:** M
**Value:** High

---

## Scenarios

### Scenario 1: New user writes first requirement

**WHEN** a new user reads the requirements guide

**THEN** they can produce a REQ-xxx formatted requirement with all 5 components

**AND** they can self-check against the quality checklist

Verifies: REQ-006

### Scenario 2: Team plans parallel agent work

**WHEN** a team reads the parallelization guide

**THEN** they can draw a dependency graph, identify parallel tracks, and define interface contracts

**AND** agents can work independently against shared contracts

Verifies: REQ-007

### Scenario 3: Operator decides to specialize an agent

**WHEN** an operator reads the lifecycle guide

**THEN** they can determine whether to create, specialize, or terminate an agent based on clear criteria

**AND** they understand the CTO monitoring mindset

Verifies: REQ-008

---

## Invariants

- Guides reference existing framework docs (maturity model, evolution timeline, validation patterns) rather than duplicating content
- All examples use the agentic SDLC context, not generic software examples
- Guides are methodology docs (framework/) not system docs (docs/)

---

## Out of Scope

- Adding actual PM/BA/Requirements Reviewer agent personas
- Modifying scripts to enforce requirements format
- Auto-generating dependency graphs from specs
