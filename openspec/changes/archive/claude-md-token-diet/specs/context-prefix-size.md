# Spec: context-prefix-size

**Date**: 2026-05-27
**Status**: specs
**Capability**: MODIFIED

---

## Overview

Defines size caps for the always-loaded agent context files and the on-demand appendix structure that absorbs the displaced content.

---

## Requirements

### REQ-001: CLAUDE.md ≤ 500 Lines, Appendix Carries the Rest

**Statement:** The system shall keep `CLAUDE.md` at ≤500 lines and host the displaced reference content in `docs/appendix/<topic>.md` files reachable via pointers from `CLAUDE.md`.

**Acceptance Criteria:**
- [ ] `wc -l CLAUDE.md` reports ≤500
- [ ] Every section deleted from `CLAUDE.md` has a corresponding `docs/appendix/<slug>.md` file
- [ ] Every appendix file has a `**Source**: CLAUDE.md (pre-split)` header
- [ ] `CLAUDE.md` contains a "## Pointers" section listing every appendix file
- [ ] `agents/claude-md-split.mjs` exists, is reproducible, committed

**Complexity:** L
**Value:** High

---

### REQ-002: AGENTS.md ≤ 150 Lines

**Statement:** The system shall keep `AGENTS.md` at ≤150 lines, prioritizing build/test commands, definition of done, escalation rules, and monorepo scoping.

**Acceptance Criteria:**
- [ ] `wc -l AGENTS.md` reports ≤150
- [ ] Section ordering: build/test commands → definition of done → escalation → scoping → other
- [ ] No content is silently lost — any deleted content has been (a) padding, or (b) moved to `docs/`

**Complexity:** S
**Value:** Medium

---

### REQ-003: Agent Behavior Preserved

**Statement:** Standard micro-cycle agent tasks shall complete successfully after the split, with no missing-context failures.

**Acceptance Criteria:**
- [ ] Battery of 3 standard tasks (one backend, one frontend, one openspec) runs to completion
- [ ] Zero "I don't know how to X" failures attributable to moved content
- [ ] Any failure traced to the split rolls back the offending section to `CLAUDE.md`

**Complexity:** M
**Value:** Critical
