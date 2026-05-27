# Spec: Enhanced Templates

**Date**: 2026-03-13
**Author**: Claude (with Bryce)
**Status**: specs

---

## Overview

Four template files must be created or updated: spec.md.template (enhanced), roadmap.md.template (new), tasks.md.template (enhanced), braindump.md.template (new).

---

## Requirements

### REQ-001: Spec Template REQ-xxx Format

**Statement:** The spec template shall include a Requirements section with REQ-xxx numbered entries, each containing: Statement, Acceptance Criteria (checkboxes), Dependencies, Complexity (S/M/L/XL), Value (Critical/High/Medium/Low), and Notes.

**Acceptance Criteria:**
- [ ] Each requirement has a unique REQ-xxx identifier
- [ ] Statement uses "The system shall..." format
- [ ] Acceptance criteria are checkbox items
- [ ] Dependencies reference other REQ-xxx IDs
- [ ] Complexity is one of S/M/L/XL
- [ ] Value is one of Critical/High/Medium/Low

**Dependencies:** None
**Complexity:** S
**Value:** Critical

### REQ-002: Spec Template Preserves WHEN/THEN

**Statement:** The spec template shall preserve the existing WHEN/THEN/AND scenario format below the requirements section, with each scenario cross-referenced to the requirement(s) it verifies.

**Acceptance Criteria:**
- [ ] WHEN/THEN/AND scenarios remain in template
- [ ] Each scenario has a "Verifies: REQ-xxx" reference
- [ ] Test Mapping table remains

**Dependencies:** REQ-001
**Complexity:** S
**Value:** High

### REQ-003: Roadmap Template

**Statement:** A new `roadmap.md.template` shall provide phased delivery planning with demo sentences, success criteria, dependency chains, work stream assignments, and phase handoff conditions.

**Acceptance Criteria:**
- [ ] Each phase has: Name, Duration, Demo Sentence, Requirements Included, Success Criteria, Risks/Blockers, Handoff to next phase
- [ ] Summary section with dependency graph and critical path
- [ ] Work stream assignments section with agent mapping
- [ ] Parallel tracks identified

**Dependencies:** REQ-001
**Complexity:** M
**Value:** Critical

### REQ-004: Tasks Template Work Streams

**Statement:** The tasks template shall include per-task Agent assignment, Parallel notation (yes/no/blocked-by), and a Work Stream Summary section.

**Acceptance Criteria:**
- [ ] Each task has an `Agent:` field
- [ ] Each task has a `Parallel:` field with yes/no/blocked-by-TASK_ID notation
- [ ] Work Stream Summary section groups tasks by agent
- [ ] Complexity field per task (S/M/L/XL)

**Dependencies:** None
**Complexity:** S
**Value:** High

### REQ-005: Braindump Template

**Statement:** A new `braindump.md.template` shall provide a lightweight intake artifact for raw ideas before the OpenSpec workflow begins.

**Acceptance Criteria:**
- [ ] Sections for: Raw Ideas, Features Wanted, Edge Cases & Nice-to-Haves, Constraints & Non-Negotiables, Target Users
- [ ] No formal structure required within sections (free-form is intentional)
- [ ] Header references the next step (openspec-new-change)

**Dependencies:** None
**Complexity:** S
**Value:** Medium

---

## Scenarios

### Scenario 1: Agent reads spec with REQ-xxx format

**WHEN** an agent reads a spec file generated from the updated template

**THEN** it finds numbered REQ-xxx requirements with testable statements, acceptance criteria, and complexity estimates

**AND** it can map each requirement to verification scenarios below

Verifies: REQ-001, REQ-002

### Scenario 2: PM creates phased roadmap

**WHEN** a roadmap is created from the template

**THEN** it contains phases with demo sentences, success criteria, and handoff conditions

**AND** work streams are mapped to agents with parallel tracks identified

Verifies: REQ-003

### Scenario 3: Task assignment with work streams

**WHEN** tasks are generated from the updated template

**THEN** each task has an agent assignment and parallel-safe notation

**AND** a Work Stream Summary shows the parallelization plan

Verifies: REQ-004

---

## Invariants

- Existing WHEN/THEN format is never removed, only augmented
- All new template fields are clearly marked with placeholder syntax ({{FIELD_NAME}})
- Templates remain tool-agnostic (no script-specific logic)

---

## Out of Scope

- Modifying openspec skill implementations to scaffold roadmap.md
- Auto-generating REQ-xxx numbers from WHEN/THEN scenarios
- Enforcing the new format on existing changes

---

## Test Mapping

| Scenario | Test File | Test Name |
|----------|-----------|-----------|
| Scenario 1 | `agents/__tests__/templates.test.mjs` | `spec template has REQ-xxx section` |
| Scenario 2 | `agents/__tests__/templates.test.mjs` | `roadmap template has phase structure` |
| Scenario 3 | `agents/__tests__/templates.test.mjs` | `tasks template has work stream fields` |
