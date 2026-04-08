# Proposal: onboarding-maturity

**Date**: 2026-04-08
**Author**: Onboarding Analyst Agent + Claude
**Status**: proposed

---

## Discovery

- **Files examined**: README.md (98 lines), ONBOARDING.md (279 lines), CLAUDE.md (641 lines), .cursorrules (171 lines), .windsurfrules (171 lines), docs/levels/level-1 through level-6, docs/safety-mechanisms.md, docs/portability-guide.md, framework/maturity-model.md, setup.mjs (--help and --dry-run behavior)
- **Existing patterns**: Maturity levels described in 3 places with different numbering (README: 1-6, ONBOARDING: 0-6, maturity-model.md: 1-7 with different names). setup.mjs silently ignores unknown flags.
- **Key findings**: Onboarding analyst ran full fresh-user walkthrough. Found 3 critical blockers, 5 high-friction issues, 5 medium rough edges, 4 nice-to-haves. Core problems: inconsistent terminology, no quick-start path, missing prerequisites, information overload.

---

## Problem

A new user arriving at the GitHub repo faces: conflicting maturity level numbering across documents, undocumented prerequisites (openspec CLI), no quick "try it in 5 minutes" path, a 641-line CLAUDE.md as their first impression, features described without benefits, no reading order for 8+ docs, and stale references in several guides. The framework is excellent but the onboarding doesn't match its quality.

---

## Proposed Solution

Fix all P0-P2 issues from the onboarding analyst report in one batch:
1. Unify maturity level numbering (0-6) across all documents
2. Add openspec CLI prerequisite, --help flag to setup.mjs
3. Add "Try It (5 min)" quickstart to README
4. Rewrite README features as benefits, add reading order, add glossary
5. Fix all stale docs (safety-mechanisms count, portability-guide paths, .windsurfrules note)
6. Add API key setup to ONBOARDING.md
7. Print summary first in test-behavior.mjs

---

## Value Analysis

### Benefits
- New users can evaluate the framework in 5 minutes instead of 30
- Zero "command not found" surprises on first use
- Consistent mental model across all documents
- ONBOARDING.md becomes a complete standalone guide

### Costs
- **Effort**: Medium (mostly documentation edits, 2 small code changes)
- **Risk**: Near zero — documentation changes, no behavioral changes to core scripts

### Decision
Yes — these are the lowest-effort, highest-impact changes possible. Documentation is the product's front door.
