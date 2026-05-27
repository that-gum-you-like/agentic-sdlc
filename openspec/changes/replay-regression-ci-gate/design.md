# Design: replay-regression-ci-gate

**Date**: 2026-05-27
**Status**: design

---

## Context

Galileo's 2026 eval platform comparison and Arize's LLM-as-judge primer converge on a pattern: capture real production traces, store them as a versioned corpus, replay on every PR. Differences vs. expected outputs trigger either a hard block or a "needs review" label.

The framework already has the raw material:
- After `cost-tracker-otel`: `pm/otel-spans.jsonl` captures every LLM call with input/output
- Adapter layer is already test-isolatable (mock injection)

What's missing is the corpus + replay harness + CI wiring.

---

## Goals

- A test job runs in CI that replays a corpus and blocks on regression
- Zero live LLM calls in CI (deterministic, free)
- Corpus is versioned, human-readable, and growable
- A regression is actionable: clear diff between expected and actual outputs

## Non-Goals

- Auto-curating the corpus (humans pick high-value traces)
- Live-traffic replay against production
- Replacing existing unit/behavior tests

---

## Design

### Corpus format

`tests/replay-corpus/<agent>-<scenario>.json`:

```json
{
  "agent": "roy-backend",
  "scenario": "queue-task-bug-fix",
  "capturedAt": "2026-05-15T12:34:00Z",
  "input": {
    "system": "...full system prompt...",
    "messages": [{"role": "user", "content": "..."}],
    "model": "claude-sonnet-4-6"
  },
  "expected": {
    "content": "...captured assistant response...",
    "toolCalls": [{"name": "Edit", "args": {...}}]
  },
  "tolerance": {
    "type": "embedding-cosine",
    "threshold": 0.85
  },
  "criticalSubstrings": ["openspec/changes/", "REQ-"]
}
```

### Replay harness

`tests/replay.test.mjs`:
1. Load every `tests/replay-corpus/*.json`
2. For each: invoke `agents/adapters/anthropic.mjs` (or whichever) with a stubbed transport that returns the captured `expected.content`
3. Re-run the full code path that *uses* the response — prompt assembly, post-processing, side-effect calls
4. Compare actual side effects (tool calls, file edits, queue updates) to expected
5. Apply `criticalSubstrings` as hard requirements (must appear in output)
6. Apply `tolerance` as soft requirement (cosine sim or LLM judge)

### CI integration

Add to `.github/workflows/test.yml`:

```yaml
  replay-regression:
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm run test:replay
```

Required check on `main` branch protection.

### Failure UX

On replay failure, write `pm/replay-diff/<scenario>.diff` with:
- Side-by-side: expected vs. actual
- Cosine score if applicable
- Suggested next step ("re-capture if intentional, otherwise revert")
