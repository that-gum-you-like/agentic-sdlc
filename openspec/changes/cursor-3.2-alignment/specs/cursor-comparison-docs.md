# Spec: cursor-comparison-docs

**Date**: 2026-05-27
**Status**: specs
**Capability**: NEW

---

## Overview

Defines comparison documentation between Cursor 2026 capabilities (`/multitask`, self-hosted cloud agents) and the framework's equivalent capabilities (April parallelization agent, queue-drainer).

---

## Requirements

### REQ-001: April vs /multitask Comparison Doc

**Statement:** The system shall provide `docs/april-vs-cursor-multitask.md` with a TL;DR decision table, scenario-by-scenario guidance, and a prompt-pattern comparison.

**Acceptance Criteria:**
- [ ] File exists at `docs/april-vs-cursor-multitask.md`
- [ ] Contains a TL;DR table with at least 4 scenarios
- [ ] Contains "When /multitask wins" and "When April wins" sections
- [ ] Contains side-by-side prompt-pattern example
- [ ] Dated at top; notes Cursor version referenced
- [ ] Cross-linked from `agents/templates/planning/april/AGENT.md`

**Complexity:** M
**Value:** Medium

---

### REQ-002: Self-Hosted Decision Table

**Statement:** The system shall extend `docs/cursor-background-agents.md` with a 4-column decision table comparing Cursor cloud, Cursor self-hosted, and framework queue-drainer modes on data-handling, complexity, cost, and use case.

**Acceptance Criteria:**
- [ ] `docs/cursor-background-agents.md` contains the table
- [ ] Columns: Mode, Data leaves your network?, Setup complexity, Cost, When to choose
- [ ] Includes at least 3 modes
- [ ] Privacy column is the leftmost data column (Bryce's privacy-first rule)

**Complexity:** S
**Value:** Medium

---

### REQ-003: Discoverability Via Cursor Rule

**Statement:** The system shall reference both new/extended docs from `.cursor/rules/sdlc-housekeeping.mdc` so Cursor agents surface them when relevant.

**Acceptance Criteria:**
- [ ] `.cursor/rules/sdlc-housekeeping.mdc` contains a pointer to `docs/april-vs-cursor-multitask.md`
- [ ] Same file contains a pointer to `docs/cursor-background-agents.md`
- [ ] File remains within size cap defined by `cursor-rules-modernization`

**Complexity:** XS
**Value:** Low
