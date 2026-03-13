# Tasks: spec-driven-maturity-gaps

**Date**: 2026-03-13
**Author**: Claude (with Bryce)
**Status**: tasks

---

## Overview

Create/update 4 templates and 3 framework guides, plus enhance CLAUDE.md. All documentation — no script changes.

---

## Prerequisites

- [x] Design is approved
- [x] Specs are written and reviewed

---

## Implementation Tasks

### Phase 1: Templates

- [ ] **T-001**: Update spec.md.template — add REQ-xxx Requirements section above existing Scenarios
  - Files: `openspec/templates/spec.md.template`
  - Spec: REQ-001, REQ-002
  - Agent: Any
  - Parallel: yes
  - Complexity: S

- [ ] **T-002**: Create roadmap.md.template — phased delivery planning
  - Files: `openspec/templates/roadmap.md.template`
  - Spec: REQ-003
  - Agent: Any
  - Parallel: yes
  - Complexity: M

- [ ] **T-003**: Update tasks.md.template — add work stream assignments and parallel notation
  - Files: `openspec/templates/tasks.md.template`
  - Spec: REQ-004
  - Agent: Any
  - Parallel: yes
  - Complexity: S

- [ ] **T-004**: Create braindump.md.template — lightweight intake artifact
  - Files: `openspec/templates/braindump.md.template`
  - Spec: REQ-005
  - Agent: Any
  - Parallel: yes
  - Complexity: S

### Phase 2: Framework Guides

- [ ] **T-005**: Create framework/requirements-guide.md
  - Files: `framework/requirements-guide.md`
  - Spec: REQ-006
  - Agent: Any
  - Parallel: yes
  - Complexity: M

- [ ] **T-006**: Create framework/parallelization-guide.md
  - Files: `framework/parallelization-guide.md`
  - Spec: REQ-007
  - Agent: Any
  - Parallel: yes
  - Complexity: M

- [ ] **T-007**: Create framework/agent-lifecycle.md
  - Files: `framework/agent-lifecycle.md`
  - Spec: REQ-008
  - Agent: Any
  - Parallel: yes
  - Complexity: M

### Phase 3: CLAUDE.md & Cleanup

- [ ] **T-008**: Add Roadmap Discipline section to CLAUDE.md
  - Files: `CLAUDE.md`
  - Spec: REQ-009
  - Agent: Any
  - Parallel: blocked-by T-007
  - Complexity: S

- [ ] **T-009**: Update OpenSpec Workflow section in CLAUDE.md with new references
  - Files: `CLAUDE.md`
  - Spec: REQ-010
  - Agent: Any
  - Parallel: blocked-by T-001, T-002, T-004
  - Complexity: S

### Phase 4: Tests

- [ ] **T-010**: Write template validation tests
  - Files: `agents/__tests__/templates.test.mjs`
  - Covers: REQ-001 through REQ-005
  - Agent: Any
  - Parallel: blocked-by T-001, T-002, T-003, T-004
  - Complexity: S

### Phase 5: Cleanup

- [ ] **T-011**: Update status.json to implemented
  - Files: `openspec/changes/spec-driven-maturity-gaps/status.json`
  - Agent: Any
  - Complexity: S

---

## Work Stream Summary

All tasks can be done by a single agent sequentially, or Phase 1 tasks (T-001 through T-004) and Phase 2 tasks (T-005 through T-007) can all run in parallel since they touch different files.

---

## Completion Criteria

This change is complete when:

- [ ] All implementation tasks are checked off
- [ ] All templates are valid markdown
- [ ] CLAUDE.md is updated
- [ ] Change is committed and pushed
