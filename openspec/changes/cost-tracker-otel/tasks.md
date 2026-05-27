# Tasks: cost-tracker-otel

**Date**: 2026-05-27
**Status**: tasks

---

## Prerequisites

- [x] proposal.md approved
- [x] design.md written
- [x] spec written
- [x] `agents/adapters/*.mjs` exist with uniform `call()` signature

---

## Implementation Tasks

- [ ] **T-101**: Write `agents/otel-schema.mjs` — pure-function `makeGenAiSpan()` with zero deps
  - Complexity: S
  - Spec: REQ-001

- [ ] **T-102**: Write `agents/otel-emit.mjs` — `writeSpan()` NDJSON appender with `OTEL_DISABLED` no-op
  - Complexity: S
  - Spec: REQ-002

- [ ] **T-103**: Wire each `agents/adapters/<provider>.mjs` to emit a span per `call()`
  - Providers: anthropic, openai, groq, gemini, cerebras, ollama, azure-openai, azure-foundry
  - Complexity: M
  - Spec: REQ-001, REQ-003

- [ ] **T-104**: Add `tests/otel-emit.test.mjs` — span shape validation, NDJSON format, no-op respect
  - Complexity: S
  - Spec: REQ-001, REQ-002

- [ ] **T-105**: Write `docs/observability.md` — collector setup, OTel GenAI attribute reference, example queries
  - Complexity: S
  - Spec: REQ-004

- [ ] **T-106**: Verify on a real run: drain 5 queue tasks, confirm `pm/otel-spans.jsonl` contains valid spans
  - Complexity: S
  - Spec: VERIFY

---

## Verification

- `tests/otel-emit.test.mjs` passes
- After a real queue drain, `pm/otel-spans.jsonl` is non-empty and parses cleanly
- Span attributes match OTel GenAI conventions
