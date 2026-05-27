# Spec: CLAUDE.md Enhancement

**Date**: 2026-03-13
**Author**: Claude (with Bryce)
**Status**: specs

---

## Overview

Enhance CLAUDE.md with roadmap discipline section and updated OpenSpec references.

---

## Requirements

### REQ-009: Roadmap Discipline Section in CLAUDE.md

**Statement:** CLAUDE.md shall include a Roadmap Discipline section documenting the in-repo roadmap convention, "never one more thing" rule, and PM workflow.

**Acceptance Criteria:**
- [ ] Section titled "Roadmap Discipline"
- [ ] In-repo roadmap convention explained (not GitHub Issues)
- [ ] "Never one more thing" rule: idea → capture → return to current work
- [ ] PM agent workflow referenced
- [ ] Link to `framework/agent-lifecycle.md`

**Dependencies:** REQ-008
**Complexity:** S
**Value:** High

### REQ-010: Updated OpenSpec References

**Statement:** The OpenSpec Workflow section in CLAUDE.md shall reference the braindump template as the entry point and mention the REQ-xxx format and roadmap template.

**Acceptance Criteria:**
- [ ] Braindump template mentioned as optional entry point before `/openspec-new-change`
- [ ] REQ-xxx format mentioned for specs
- [ ] Roadmap template mentioned for multi-phase changes

**Dependencies:** REQ-001, REQ-003, REQ-005
**Complexity:** S
**Value:** Medium

---

## Scenarios

### Scenario 1: Agent reads CLAUDE.md and encounters new idea mid-task

**WHEN** an agent gets a new feature idea during implementation

**THEN** it follows the "never one more thing" rule: captures idea in roadmap/backlog

**AND** returns to current task without implementing the idea

Verifies: REQ-009

---

## Invariants

- CLAUDE.md additions are concise — no more than 30 lines added
- Existing sections are not modified, only new sections appended

---

## Out of Scope

- Restructuring CLAUDE.md
- Adding sections for topics already covered
