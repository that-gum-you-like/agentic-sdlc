# Spec Delta: maturity-model (curriculum-l4-naming)

## REQ-L4N-1 — Ladder names match the curriculum exactly

**Statement:** Every document that spells out the maturity ladder MUST name it
`L0 Manual → L1 Assisted → L2 Automated → L3 Orchestrated → L4 Autonomous →
L5 Evolving → L6 Self-Improving`, with `framework/maturity-model.md` canonical.

**Acceptance:**
- `grep -rn "Orchestrated → Quality"` over tracked docs returns nothing.
- `framework/maturity-model.md`, CLAUDE.md, README.md, ONBOARDING.md all name
  Level 4 "Autonomous".
- `docs/levels/level-4-autonomous.md` exists; no tracked doc links to
  `level-4-quality.md`.
- `npm test` passes (including the playbook-filename pin in
  `tests/adapter-and-model-manager.test.mjs`).

**Dependencies:** none. **Complexity:** S. **Value:** closes the final
documented rubric drift (conformance doc's open flag).
