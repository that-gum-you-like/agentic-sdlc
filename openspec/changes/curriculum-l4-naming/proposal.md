# Proposal: curriculum-l4-naming

**Date**: 2026-07-06
**Author**: Fable (claude-fable-5) with Bryce
**Status**: proposed

---

## Problem

The authoritative spec for this framework is the Multiverse School Agentic SDLC
curriculum, whose maturity ladder is **L0 Manual → L1 Assisted → L2 Automated →
L3 Orchestrated → L4 Autonomous → L5 Evolving → L6 Self-Improving**. The repo's
canonical model (`framework/maturity-model.md`) names Level 4 **"Quality"**.
`docs/curriculum-conformance.md` flagged this drift for confirmation; Bryce's
directive is to reconcile the docs so the model reads EXACTLY the curriculum's
L0→L6 ladder.

## Discovery

- Level-4 *content* is already aligned either way (defeat tests, code reviewer,
  browser E2E, blocking gates) — those quality gates are precisely what makes
  Level-4 autonomy safe. Only the NAME drifts.
- Files naming the ladder: `framework/maturity-model.md` (canonical),
  `CLAUDE.md` § Maturity Model, `README.md` levels table, `ONBOARDING.md`,
  `docs/levels/level-4-quality.md` (+ its filename), the level-3 playbook's
  forward link, `framework/case-studies.md`, `docs/curriculum-conformance.md`
  (the open flag), and `tests/adapter-and-model-manager.test.mjs:609` which
  pins the playbook filenames.

## Proposed Solution

Rename Level 4 from "Quality" to **"Autonomous"** everywhere the ladder is
spelled out, keeping the existing quality-gate content and noting that the
gates are what make autonomy safe. Rename
`docs/levels/level-4-quality.md` → `docs/levels/level-4-autonomous.md`, update
every link, update the filename-pinning test, and resolve the conformance
doc's open naming flag. Doc-only plus one test-constant update — no behavior
change.

## Value Analysis

- **Closes the last documented drift** between the repo and its authoritative
  rubric — the maturity model now reads exactly as the curriculum defines it.
- **Zero behavior risk:** documentation + one test string-list; the full suite
  and four-layer validation gate the change like any other.
- **Prevents future confusion:** the canonical file, playbooks, README,
  onboarding, and conformance map all agree on one ladder.
