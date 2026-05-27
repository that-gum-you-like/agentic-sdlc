# Tasks: onboarding-and-context-diet

**Date**: 2026-05-27
**Status**: tasks

---

## Prerequisites

- [x] proposal.md approved
- [x] design.md written
- [x] specs written

---

## Workstream A — Context slim

- [x] **T-101**: Audit `CLAUDE.md` sections — classify each `##` header as keep-verbatim / keep-summary / move-to-appendix
  - Complexity: M

- [ ] **T-102**: Write `agents/claude-md-split.mjs` (zero deps, reproducible)
  - Complexity: M

- [x] **T-103**: Run split script; produce new `CLAUDE.md` + `docs/appendix/*.md`
  - Complexity: S

- [x] **T-104**: Verify `wc -l CLAUDE.md` ≤ 500
  - Complexity: XS

- [x] **T-105**: Audit `AGENTS.md` — flag padding for deletion
  - Complexity: S

- [x] **T-106**: Slim `AGENTS.md` to ≤150 lines
  - Complexity: S

---

## Workstream B — Onboarding paths

- [ ] **T-201**: Decide canonical maturity numbering scheme (0-6 per ONBOARDING.md)
  - Complexity: XS

- [ ] **T-202**: Update README, framework/maturity-model.md, level-* docs to canonical numbering
  - Complexity: S

- [ ] **T-203**: Add "Try It in 5 minutes" quickstart to README
  - Complexity: S

- [ ] **T-204**: Add "Read these in order" section to README
  - Complexity: XS

- [ ] **T-205**: Write `docs/glossary.md` (~30 terms)
  - Complexity: M

- [ ] **T-206**: Add Prerequisites section to ONBOARDING.md (Node 18+, openspec CLI, API keys per provider table)
  - Complexity: S

- [ ] **T-207**: Add API Key Setup section to ONBOARDING.md
  - Complexity: S

- [ ] **T-208**: Stale-reference audit (grep for `.cursorrules`, line counts) + fix
  - Complexity: S

---

## Workstream C — Code polish

- [ ] **T-301**: Add `--help` to `setup.mjs`; reject unknown flags
  - Complexity: S

- [ ] **T-302**: `test-behavior.mjs` — print summary line first, then detail
  - Complexity: XS

---

## Verification

- [ ] **V-1**: `wc -l CLAUDE.md` ≤ 500
- [ ] **V-2**: `wc -l AGENTS.md` ≤ 150
- [ ] **V-3**: `grep -rE "Level [0-9]" README.md ONBOARDING.md framework/maturity-model.md docs/levels/` shows only 0-6 references
- [ ] **V-4**: README has "Try it (5 minutes)" + "Read these in order"
- [ ] **V-5**: `docs/glossary.md` exists with ≥25 entries
- [ ] **V-6**: ONBOARDING.md has Prerequisites + API Key Setup sections
- [ ] **V-7**: `setup.mjs --help` returns exit 0 with usage; `setup.mjs --bogus` returns exit 2 with error
- [ ] **V-8**: `test-behavior.mjs` first non-debug output line includes the word "Summary"
- [ ] **V-9**: Battery test — 3 standard tasks (backend, frontend, openspec) complete without missing-context failures
