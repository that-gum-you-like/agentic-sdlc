# Proposal: cursor-rules-modernization

**Date**: 2026-05-27
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: proposed

---

## Problem

Three rule files coexist at the repo root, all loaded by their respective tools on every request:

- `.cursorrules` (legacy Cursor format, 6176 bytes) — deprecated by Cursor in favor of `.cursor/rules/*.mdc`
- `.windsurfrules` (5718 bytes) — Windsurf's equivalent
- `.cursor/rules/*.mdc` (5 modern files, 548 lines total) — current Cursor recommendation

Two issues:

1. **Legacy duplication**: `.cursorrules` content is also present (re-stated) in `.cursor/rules/agentic-sdlc.mdc`. Cursor reads both, paying the token tax twice. Per Cursor docs (2026), `.cursorrules` should be removed when `.cursor/rules/` is present.
2. **Over-cap rule**: `.cursor/rules/sdlc-task-execution.mdc` is **167 lines** — over the Morph 2026 recommendation of ≤150 lines for glob-scoped rules. Always-on rules should be ≤50.

This isn't a correctness bug; it's a per-request cost + signal-clarity issue across every Cursor session.

---

## Discovery

- **Files involved**:
  - `.cursorrules` (legacy)
  - `.windsurfrules` (Windsurf-only — preserve unless Windsurf is dropped)
  - `.cursor/rules/agentic-sdlc.mdc` (87 lines, always-apply)
  - `.cursor/rules/openspec-workflow.mdc` (96 lines, glob-scoped)
  - `.cursor/rules/sdlc-task-execution.mdc` (167 lines, glob-scoped — over cap)
  - `.cursor/rules/sdlc-housekeeping.mdc` (122 lines, glob-scoped)
  - `.cursor/rules/azure-foundry.mdc` (76 lines, glob-scoped)
- **Constraints**:
  - Must not drop coverage for Windsurf/Aider users — `.windsurfrules` likely stays.
  - Existing rule content is battle-tested; this is a refactor, not a rewrite.

---

## Proposed Solution

1. **Delete `.cursorrules`** — Cursor will fall back to `.cursor/rules/*.mdc`. Confirm via test session.
2. **Split `sdlc-task-execution.mdc`** into two glob-scoped files:
   - `sdlc-task-claim.mdc` (~60 lines) — pre-flight + claim mechanics
   - `sdlc-task-implement.mdc` (~80 lines) — implement + test + commit loop
3. **Reduce `agentic-sdlc.mdc`** (always-apply, currently 87 lines) toward the Morph ≤50 recommendation by moving non-always content to glob-scoped files. Specifically the "Memory protocol" and "Anti-patterns" sections.
4. **Audit `.windsurfrules`** for duplication with `.cursor/rules/` content; document the rationale for keeping it (or delete if Windsurf is no longer used).

Net effect: lower per-request token cost on every Cursor invocation, sharper rule scoping, alignment with 2026 best practice.
