# Proposal: onboarding-and-context-diet

**Date**: 2026-05-27
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: proposed
**Supersedes**: `onboarding-maturity` (archived 2026-05-27) + `claude-md-token-diet` (archived 2026-05-27)

---

## Problem

Two parallel changes were in flight aimed at "make the framework approachable to a new user." Both name the same root cause from different angles:

- **`onboarding-maturity`**: 641-line CLAUDE.md as a new user's first impression; inconsistent maturity-level numbering across docs; no quick-start path; reading-order ambiguity across 8+ docs.
- **`claude-md-token-diet`**: same 33KB CLAUDE.md (now 644 lines) is loaded on every Cursor + Claude Code request, paying token tax forever; AGENTS.md just over the 150-line ASDLC 2026 ceiling.

Splitting CLAUDE.md without unifying terminology and adding a quick-start is a wasted edit. Adding a quick-start without slimming CLAUDE.md leaves the wall-of-text wall. Both are the same body of work and should ship together.

---

## Discovery

- **Files involved**:
  - `CLAUDE.md` (644 lines, always loaded by Claude Code; mirrored to .cursor/rules/agentic-sdlc.mdc topology)
  - `AGENTS.md` (162 lines, ASDLC.io 2026 recommends ≤150)
  - `README.md` (174 lines, no quick-start section)
  - `ONBOARDING.md` (308 lines; missing API key setup section)
  - `framework/maturity-model.md`, `docs/levels/level-*.md`, README maturity table — three places, two different numbering schemes
  - `setup.mjs` (currently no `--help`; silently ignores unknown flags)
  - `agents/test-behavior.mjs` (verbose output before summary)
- **Existing patterns**:
  - The framework already has `docs/appendix/`-style organization potential (e.g. `framework/`, `docs/`)
  - Cursor rules already split into 7 glob-scoped files (post `cursor-rules-modernization`)
- **Constraints**:
  - Cannot lose any content during the CLAUDE.md split; everything must remain reachable via pointers
  - Cannot break agent behavior — battery of real micro-cycle tasks must still complete
  - Cannot add npm dependencies

---

## Proposed Solution

Three workstreams, all shipping under one change:

### A. Context slim (from claude-md-token-diet)

1. Split `CLAUDE.md` (644 → ≤500 lines) into a tight core + `docs/appendix/<topic>.md` files. Reproducible via committed `agents/claude-md-split.mjs` one-shot.
2. Slim `AGENTS.md` (162 → ≤150 lines) — audit for padding, prioritize build/test commands, definition of done, escalation, scoping.

### B. Onboarding paths (from onboarding-maturity)

3. Unify maturity-level numbering as **0-6** across README, ONBOARDING.md, maturity-model.md, level-* docs.
4. Document the `openspec` CLI as a prerequisite in ONBOARDING.md.
5. Add a "Try It in 5 minutes" quickstart to README.md.
6. Rewrite README features as user benefits + add reading order + add glossary.
7. Add API key setup section to ONBOARDING.md.
8. Fix stale references (safety-mechanisms counts, portability-guide paths, .windsurfrules notes — many already addressed by `cursor-rules-modernization`; audit remainder).

### C. Code polish

9. Add `--help` flag to `setup.mjs`; reject unknown flags with a clear error.
10. `test-behavior.mjs`: print summary line first, then detail.

---

## Value Analysis

**Who benefits:** Every new user evaluating the framework; every agent session paying the always-loaded token tax; Bryce on travel-laptop bootstraps.

**What it solves:** Two distinct symptoms of the same root cause — "framework is excellent but the front door is overwhelming." Slimming context lowers per-request cost; unifying terminology + adding quickstart raises adoption.

**Priority:** High. CLAUDE.md token tax compounds on every request; onboarding bounce rate compounds on every new user.

**Risk:** Low for B+C (docs + small script flags). Medium for A — content must survive the split intact. Mitigated by reproducible script + post-split battery test.

**Success metrics:**
- `wc -l CLAUDE.md` ≤ 500
- `wc -l AGENTS.md` ≤ 150
- Maturity-level numbering identical across all docs (single grep proves it)
- New-user time-to-first-`setup.mjs`-run ≤ 5 minutes from README open
- Battery of 3 standard tasks (backend, frontend, openspec) passes post-split
