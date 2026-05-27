# Proposal: spec-kit-cross-feature-analysis

**Date**: 2026-05-27
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: proposed

---

## Problem

GitHub's Spec Kit (93k+ stars as of 2026) introduced **cross-feature interaction analysis** — a tooling step that reads all per-feature spec files and reports interaction risks (shared state, conflicting invariants, ordering dependencies). OpenSpec doesn't have this; it analyzes one change at a time.

For a framework with 22 active openspec changes simultaneously in flight, this is a real blind spot. Today, two changes can land that both touch `agents/memory-manager.mjs` and silently introduce semantic conflicts (e.g. one assumes synchronous writes, the other adds an async layer). The conflict is only caught at test time, not at planning time.

OpenSpec's delta markers (ADDED/MODIFIED/REMOVED) are a brownfield differentiator Spec Kit lacks — keep OpenSpec, borrow the cross-feature analysis idea.

---

## Discovery

- **Files involved**:
  - `openspec/changes/*/proposal.md`, `design.md`, `specs/*.md` — corpus
  - `openspec/specs/` — committed specs (currently empty / archive-driven)
  - `.claude/skills/openspec-*` — existing skill suite
- **Existing patterns**:
  - `openspec-explore` skill exists (per inventory) — natural place to extend
  - `agents/ast-analyzer.mjs` exists — could be repurposed to extract "files-touched" from each open change
- **Constraints**:
  - Must work on the existing OpenSpec corpus shape — no schema migration
  - Output should be actionable (which two changes conflict, on what file/concept)

---

## Proposed Solution

1. Write `agents/cross-feature-analyze.mjs` — reads every active change folder, extracts:
   - Files mentioned (from proposal.md "Files involved" and tasks.md "File:" entries)
   - Specs touched (from `specs/*.md` filenames)
   - Capability tags (NEW / MODIFIED / REMOVED from spec headers)
2. Builds an N×N conflict matrix — flags changes that touch the same files or same capability
3. Produces a Markdown report at `pm/cross-feature-report.md` — sorted by severity
4. Add `openspec-cross-feature` skill that invokes the analyzer
5. Document the workflow in `docs/cross-feature-analysis.md`
6. Optionally: run automatically as part of `openspec-new-change` to flag conflicts at proposal time
