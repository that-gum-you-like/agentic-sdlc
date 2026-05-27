# Spec: cross-feature-conflict-detection

**Date**: 2026-05-27
**Status**: specs
**Capability**: NEW

---

## Overview

Defines a static-analysis tool that reads all active OpenSpec change folders and reports pairwise conflicts: shared file mentions and shared capability names.

---

## Requirements

### REQ-001: File-Mention Extraction

**Statement:** The analyzer shall extract every file path mentioned in proposal.md, design.md, and tasks.md of every active change.

**Acceptance Criteria:**
- [ ] Regex captures paths matching `[\w.-]+/[\w./-]+\.(mjs|md|json|sh|mdc|ts|tsx|js)`
- [ ] Backtick-delimited and whitespace-delimited paths both captured
- [ ] Per-change result is a deduplicated set of paths
- [ ] Active changes are `openspec/changes/*/` excluding `archive/`

**Complexity:** S
**Value:** High

---

### REQ-002: Pairwise Intersection

**Statement:** The analyzer shall compute, for every pair of active changes, the intersection of their file-mention sets and their capability-name sets.

**Acceptance Criteria:**
- [ ] All N*(N-1)/2 pairs evaluated
- [ ] Non-empty file intersection → high-severity flag
- [ ] Non-empty capability-name intersection (from spec filename) → medium-severity flag
- [ ] Stable ordering: sort by (severity DESC, change-A name ASC, change-B name ASC)

**Complexity:** S
**Value:** High

---

### REQ-003: Report Output

**Statement:** The analyzer shall write a human-readable Markdown report to `pm/cross-feature-report.md` with sections per severity tier.

**Acceptance Criteria:**
- [ ] Report includes generation timestamp
- [ ] Sections: High-severity (same file), Medium-severity (same capability), Low-severity (additive)
- [ ] Each flagged pair lists the conflicting items
- [ ] Each flag includes a one-line "Action" suggestion

**Complexity:** S
**Value:** Medium

---

### REQ-004: Skill Invocation

**Statement:** The system shall provide an `openspec-cross-feature` skill that invokes the analyzer and surfaces the report.

**Acceptance Criteria:**
- [ ] `.claude/skills/openspec-cross-feature/SKILL.md` exists
- [ ] Invocation runs `agents/cross-feature-analyze.mjs`
- [ ] On completion, the skill returns the report contents (or a path to it)

**Complexity:** S
**Value:** Medium

---

### REQ-005: Documentation

**Statement:** The workflow shall be documented at `docs/cross-feature-analysis.md` covering when to run it, how to read the report, and how to act on flags.

**Acceptance Criteria:**
- [ ] File exists at `docs/cross-feature-analysis.md`
- [ ] Contains "When to run" section
- [ ] Contains "Reading the report" section with one example flag walkthrough
- [ ] Contains "Acting on a flag" section with the resolve/defer/coordinate options

**Complexity:** S
**Value:** Medium

---

### REQ-006 (optional): Proposal-Time Gate

**Statement:** OpenSpec change creation shall optionally run the analyzer immediately after writing a new proposal and warn if conflicts with active changes are detected.

**Acceptance Criteria:**
- [ ] `openspec-new-change` skill hooks the analyzer post-write
- [ ] Warnings printed to stdout; do NOT block creation
- [ ] Opt-out via env var `OPENSPEC_SKIP_CROSS_FEATURE=true`

**Complexity:** S
**Value:** Low (optional)
