# Proposal: replay-regression-ci-gate

**Date**: 2026-05-27
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: proposed

---

## Problem

`.github/workflows/test.yml` runs `npm test` and `npm run test:behavior` on every push. Both are good but neither is a **trace-replay regression suite** — replaying a corpus of past LLM interactions against the current adapter/prompt code to detect output drift.

Per 2026 evaluation-platform guidance (Galileo, Maxim, Arize), replay suites are now table-stakes for agentic frameworks:

> "No change passes without clearing the replay suite. If a previously-working trace no longer produces an equivalent response, the change is blocked or requires explicit approval."

Without this gate, a prompt-rules change or adapter refactor can silently regress behavior on tasks that don't have explicit unit tests. The framework currently has 2 test files (`adapter-and-model-manager.test.mjs`, `deploy-rollback.test.mjs`) plus behavior tests — adequate coverage for code, blind to prompt regressions.

---

## Discovery

- **Files involved**:
  - `.github/workflows/test.yml` (sole CI workflow)
  - `tests/` (2 unit files)
  - `agents/test-behavior.mjs` (behavior suite)
  - `pm/otel-spans.jsonl` (post `cost-tracker-otel`) — natural source of replay traces
- **Existing patterns**:
  - `test-behavior.mjs --framework` is a precedent for higher-tier tests
  - Adapter tests already mock LLM responses — replay extends this to real captured responses
- **Constraints**:
  - Replay must NOT call live LLMs in CI (cost + flakiness) — use captured responses
  - Equivalence checking is fuzzy; need a comparator (e.g. embeddings cosine sim ≥ 0.85, or LLM-as-judge for nuanced cases)

---

## Proposed Solution

1. Define a "trace corpus" — `tests/replay-corpus/*.json`, each file = one captured agent interaction (input, expected output, metadata)
2. Write `tests/replay.test.mjs` — for each corpus file, replay the input through the current code path, compare output to expected
3. Use a lightweight judge: substring-match for hard requirements, embedding cosine sim (via existing semantic-memory infra) for soft equivalence, optional LLM-as-judge (Haiku-tier) for complex cases
4. Add `replay-regression` job to `.github/workflows/test.yml` — required check
5. Seed the corpus with 5 high-value traces (one per major agent role) to start; expand over time
6. Document the corpus-curation workflow in `docs/replay-regression.md`
