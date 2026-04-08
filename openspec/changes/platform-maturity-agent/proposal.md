# Proposal: platform-maturity-agent

**Date**: 2026-04-08
**Author**: Claude
**Status**: proposed

---

## Discovery

- **Files examined**: All 15 execution agent templates in `agents/templates/execution-agents/`, `agents/templates/capabilities.json.template`, `framework/maturity-model.md`, `docs/safety-mechanisms.md`, `CLAUDE.md`
- **Existing patterns**: 15 execution templates + 5 planning templates. No template covers platform maturity, production readiness, or DORA metrics. The `performance-sentinel` template covers runtime benchmarks but not systemic maturity. The `qa-engineer` covers test quality but not operational readiness.
- **Key findings**: The framework has a maturity model (Levels 0-6) but no automated way to assess where a project actually stands. Assessment is manual via checklists in `framework/maturity-model.md`. No DORA metrics, no SRE production readiness review, no dependency health scanning.

---

## Problem

The framework tells users to "adopt incrementally" but provides no automated way to measure where they are, what's working, and what to improve next. The maturity model is a checklist you read — not a tool that analyzes your project and tells you. There's also no production readiness assessment (SRE-style), no DORA metrics tracking, no dependency/security posture check, and no technology currency evaluation.

---

## Proposed Solution

1. **New execution agent template**: `platform-maturity-sentinel` — specializes in assessing platform health, technology maturity, and production readiness across 8 dimensions drawn from SRE/DORA/CMMI research
2. **Assessment script**: `agents/maturity-assess.mjs` — automated scanner that reads project state and produces a scored report
3. **8 assessment dimensions**: SDLC maturity, testing, deployment, observability, security posture, dependency health, documentation, operational readiness

---

## Value Analysis

### Benefits
- Users know exactly where they stand without guessing
- Prioritized recommendations based on actual project state
- Repeatable — run monthly to track improvement
- Works on any project, not just ones using the full framework

### Costs
- **Effort**: Medium (1 template + 1 script)
- **Risk**: Low — read-only analysis, no project modifications

### Decision
Yes — "you can't improve what you can't measure" is the whole point of the maturity model.
