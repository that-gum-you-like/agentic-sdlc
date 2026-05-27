# Spec: onboarding-and-context

**Date**: 2026-05-27
**Status**: specs
**Capability**: NEW (supersedes draft specs from `onboarding-maturity` + `claude-md-token-diet`)

---

## Overview

Combined spec for new-user onboarding clarity and always-loaded context size.

---

## Requirements

### REQ-001: CLAUDE.md ≤ 500 Lines With Appendix Pointers

**Statement:** The system shall keep `CLAUDE.md` ≤500 lines and host displaced reference content in `docs/appendix/<topic>.md` files reachable via a "Pointers" section in `CLAUDE.md`.

**Acceptance Criteria:**
- [ ] `wc -l CLAUDE.md` reports ≤500
- [ ] Every section deleted from `CLAUDE.md` has a corresponding `docs/appendix/<slug>.md`
- [ ] Every appendix file starts with `**Source**: CLAUDE.md (pre-split)` header
- [ ] `CLAUDE.md` has a "## Pointers" section listing every appendix file
- [ ] `agents/claude-md-split.mjs` exists, is reproducible, committed

**Complexity:** L
**Value:** High

---

### REQ-002: AGENTS.md ≤ 150 Lines

**Statement:** The system shall keep `AGENTS.md` ≤150 lines with section ordering build/test → definition-of-done → escalation → monorepo-scoping → other.

**Acceptance Criteria:**
- [ ] `wc -l AGENTS.md` reports ≤150
- [ ] No content silently lost — any deleted content was padding OR moved to `docs/`

**Complexity:** S
**Value:** Medium

---

### REQ-003: Single Maturity Numbering (0-6)

**Statement:** The system shall use the 0-6 maturity-level numbering scheme uniformly across `README.md`, `ONBOARDING.md`, `framework/maturity-model.md`, and `docs/levels/`.

**Acceptance Criteria:**
- [ ] `grep -rE "Level [0-9]"` against the 4 paths returns only 0-6 references
- [ ] `docs/levels/` filenames are `level-0-*.md` through `level-6-*.md` (or all renamed consistently)
- [ ] No document references the old 1-7 scheme

**Complexity:** S
**Value:** Medium

---

### REQ-004: README Has 5-Minute Quickstart + Reading Order

**Statement:** README.md shall include a "Try it (5 minutes)" quickstart section and a "Read these in order" section listing the documentation reading sequence.

**Acceptance Criteria:**
- [ ] README has a `## Try it (5 minutes)` section near the top with copy-pasteable bash
- [ ] README has a `## Read these in order` section listing at least 5 docs in sequence
- [ ] Quickstart uses only `git clone` + `node` commands (no installer required)

**Complexity:** S
**Value:** High

---

### REQ-005: Glossary

**Statement:** The system shall provide a `docs/glossary.md` defining at least 25 framework-specific terms.

**Acceptance Criteria:**
- [ ] `docs/glossary.md` exists
- [ ] Alphabetically ordered
- [ ] Each entry: term + one-paragraph definition
- [ ] Includes at minimum: micro cycle, REM sleep, four-layer validate, defeat test, capability checklist, fallback chain, queue-drainer, maturity level, OpenSpec

**Complexity:** M
**Value:** Medium

---

### REQ-006: ONBOARDING.md Prerequisites + API Keys

**Statement:** ONBOARDING.md shall include a Prerequisites section and an API Key Setup section.

**Acceptance Criteria:**
- [ ] Prerequisites section lists Node 18+, `openspec` CLI, at least one LLM API key
- [ ] API Key Setup section has a per-provider table with env var name + where to obtain the key
- [ ] Free-tier providers (Groq, Gemini, Cerebras) called out explicitly

**Complexity:** S
**Value:** High

---

### REQ-007: setup.mjs --help + Unknown-Flag Rejection

**Statement:** `setup.mjs` shall support `--help` (exit 0 with usage) and reject unknown flags (exit 2 with error message).

**Acceptance Criteria:**
- [ ] `node setup.mjs --help` prints usage including all supported flags + at least 3 example invocations
- [ ] `node setup.mjs --bogus` exits 2 with message "Unknown flag: --bogus. See --help"
- [ ] Existing flags (`--discover`, `--dry-run`, `--dir`) continue to work

**Complexity:** S
**Value:** Low

---

### REQ-008: test-behavior.mjs Summary-First Output

**Statement:** `agents/test-behavior.mjs` shall print a summary line as its first output, before per-test detail.

**Acceptance Criteria:**
- [ ] First non-empty output line includes the word "Summary"
- [ ] Detail follows the summary
- [ ] No regression in exit codes (0 pass, non-zero fail)

**Complexity:** XS
**Value:** Low

---

### REQ-009: Agent Behavior Preserved Post-Split

**Statement:** Standard micro-cycle agent tasks shall complete successfully after the CLAUDE.md split, with no missing-context failures.

**Acceptance Criteria:**
- [ ] Battery of 3 standard tasks (backend, frontend, openspec) runs to completion
- [ ] Zero "I don't know how to X" failures attributable to moved content
- [ ] Any failure traced to the split rolls back the offending section to `CLAUDE.md`

**Complexity:** M
**Value:** Critical
