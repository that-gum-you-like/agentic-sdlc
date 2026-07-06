# Design: curriculum-l4-naming

**Date**: 2026-07-06

## Approach

Mechanical, reviewable rename with one canonical source:

1. `framework/maturity-model.md` stays the canonical model. Level 4 becomes
   **"Autonomous"**; the level description keeps its quality-gate content and
   gains one framing line ("agents run unattended because these gates block
   bad work"). Pyramid diagram + canonical-note ladder updated to
   `Manual → Assisted → Automated → Orchestrated → Autonomous → Evolving →
   Self-Improving`.
2. `docs/levels/level-4-quality.md` → `git mv` → `level-4-autonomous.md`;
   title becomes "Level 4: Autonomous — Automated Quality Gates". Content
   unchanged otherwise.
3. All referrers updated: CLAUDE.md, README.md, ONBOARDING.md,
   `docs/levels/level-3-orchestrated.md`, `framework/case-studies.md`.
4. `tests/adapter-and-model-manager.test.mjs` filename list updated to
   `level-4-autonomous.md` (the test keeps pinning that all six playbooks
   exist).
5. `docs/curriculum-conformance.md`: the "flagged for Bryce's confirmation"
   note is resolved (directive received 2026-07-06).

## Non-goals

- No renaming of `level-5-evolution.md` (the ladder word "Evolving" appears in
  prose; the filename is a stem, not a ladder name, and churn there buys
  nothing).
- No behavior/code changes.
