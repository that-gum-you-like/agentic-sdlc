# Spec: cursor-rules-organization

**Date**: 2026-05-27
**Status**: specs
**Capability**: MODIFIED

---

## Overview

Defines the size and scoping rules for `.cursor/rules/*.mdc` files and the deprecation of legacy `.cursorrules`.

---

## Requirements

### REQ-001: Legacy .cursorrules Removed

**Statement:** The system shall not contain a `.cursorrules` file at the repo root once all content has been migrated to `.cursor/rules/*.mdc`.

**Acceptance Criteria:**
- [ ] `.cursorrules` does not exist
- [ ] Diff of pre-deletion `.cursorrules` against union of `.cursor/rules/*.mdc` shows zero unique content lost
- [ ] Cursor session in repo loads `.cursor/rules/` correctly without warnings

**Complexity:** S
**Value:** Medium

---

### REQ-002: Glob-Scoped Rules Capped at 150 Lines

**Statement:** Every `.cursor/rules/*.mdc` file with `alwaysApply: false` shall be ≤150 lines.

**Acceptance Criteria:**
- [ ] `find .cursor/rules -name '*.mdc' -exec wc -l {} \;` shows all glob-scoped files ≤150 lines
- [ ] `sdlc-task-execution.mdc` split into two compliant files

**Complexity:** M
**Value:** Medium

---

### REQ-003: Always-Apply Rules Capped at 50 Lines

**Statement:** Every `.cursor/rules/*.mdc` file with `alwaysApply: true` shall be ≤50 lines.

**Acceptance Criteria:**
- [ ] `agentic-sdlc.mdc` is ≤50 lines after extraction of Memory protocol + Anti-patterns
- [ ] Extracted content lives in glob-scoped `.mdc` files

**Complexity:** M
**Value:** Medium

---

### REQ-004: .windsurfrules Decision Documented

**Statement:** The system shall either (a) delete `.windsurfrules` or (b) retain it with a header comment explaining what tool consumes it and why it duplicates `.cursor/rules/` content.

**Acceptance Criteria:**
- [ ] Either `.windsurfrules` is absent, OR
- [ ] `.windsurfrules` first line is a `#` comment naming Windsurf as the consumer

**Complexity:** S
**Value:** Low
