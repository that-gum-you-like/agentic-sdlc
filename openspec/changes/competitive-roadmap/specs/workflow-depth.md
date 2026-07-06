# Spec: workflow-depth

**Date**: 2026-07-05
**Status**: specs
**Capability**: NEW · Track 4

Match how teams actually receive agent work (PRs), give agents real codebase grounding, and extend our strongest surface (OpenSpec) past Spec Kit / Kiro. Capability-gap notes reference the numbered matrix H6 builds.

---

### REQ-P8: PR-Native Workflow + Autonomous PR Review  · *Parity*

**Statement:** Agent work shall flow issue→branch→draft-PR per task, with the reviewer agent posting inline PR review comments gated on CI.

**Acceptance Criteria:**
- [ ] Task execution opens a draft PR (the `autonomous-drain` already does branch→PR; generalize it to the worker/launcher path)
- [ ] The reviewer agent posts **inline PR comments** (BugBot-style) using the growing checklist — this is where the enforcing review lives (the local post-commit `review-hook` can't gate; see H1), so PR review + CI is the gate
- [ ] CI gates the PR (depends on H2); review verdict recorded on the PR
- [ ] Works with `gh`; no SaaS dependency; tests on a fixture PR; docs (closes the **PR-native / autonomous-PR-review** gaps, matrix rows in H6)

**Dependencies:** H2 (CI gate), H1 (enforcing review). **Complexity:** M. **Value:** High.

---

### REQ-P10: Codebase RAG + Auto-Wiki  · *Parity*

**Statement:** The framework shall index the target codebase for semantic code search and generate a cited architecture wiki as agent context.

**Acceptance Criteria:**
- [ ] Extends `rag-indexer.mjs` to index **code** (not just docs/memory), local embeddings only (privacy-first), with the deterministic lexical fallback
- [ ] Semantic code search surfaced to agents as a tool / context step (Devin-Search analog)
- [ ] An auto-generated, cited architecture wiki in `pm/` refreshed by `document-sync` (Devin-Wiki analog)
- [ ] Distinct from memory RAG; tests; docs (closes the **codebase-RAG** gap, matrix row in H6)

**Dependencies:** none (builds on shipped `rag-indexer`). **Complexity:** L. **Value:** Medium.

---

### REQ-P11: Spec Registry + Enforced Constitution  · *Advantage*

**Statement:** OpenSpec shall gain a reusable dependency-spec registry and an enforced project constitution.

**Acceptance Criteria:**
- [ ] A `constitution.md` of non-negotiable principles (Spec Kit / Kiro-steering analog) that formalizes the rules scattered in CLAUDE.md and is **checked** in the OpenSpec gate + `test-behavior`
- [ ] A local **spec/dependency registry** (Tessl analog) capturing API contracts of key dependencies to curb hallucinated APIs; referenced during design/implement
- [ ] Deepens our proposal→archive + Value-Analysis lifecycle past Spec Kit/Kiro on the change-management dimension
- [ ] Tests (constitution enforcement fires on a violation); docs (closes the **enforced-constitution** gap, matrix row in H6)

**Dependencies:** H1/H2 (enforcement surface for the constitution check). **Complexity:** M. **Value:** Medium.
