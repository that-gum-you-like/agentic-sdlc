# Spec: otel-genai-emission

**Date**: 2026-05-27
**Status**: specs
**Capability**: NEW

---

## Overview

Defines OTel GenAI-compliant span emission from every LLM adapter, written to `pm/otel-spans.jsonl` as NDJSON. Zero npm deps; additive to existing cost-tracker.

---

## Requirements

### REQ-001: makeGenAiSpan Produces OTel GenAI-Compliant Spans

**Statement:** The system shall provide a `makeGenAiSpan()` function that produces span objects conforming to OpenTelemetry GenAI semantic conventions (2026 stable).

**Acceptance Criteria:**
- [ ] `agents/otel-schema.mjs` exports `makeGenAiSpan(params)`
- [ ] Returned span includes required attributes: `gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`
- [ ] Returned span includes optional attributes when supplied: `gen_ai.response.model`, `gen_ai.usage.cost.usd`, `gen_ai.agent.name`, `gen_ai.agent.task_id`, `error.message`
- [ ] `startTimeUnixNano` / `endTimeUnixNano` are integer nanoseconds (not ms)
- [ ] `status.code` is 1 on success, 2 on error
- [ ] Zero npm dependencies

**Complexity:** S
**Value:** High

---

### REQ-002: writeSpan Appends NDJSON, Respects OTEL_DISABLED

**Statement:** The system shall provide a `writeSpan()` function that appends spans to `pm/otel-spans.jsonl` as NDJSON (one JSON object per line, newline-terminated). The function shall no-op if `OTEL_DISABLED=true` is set.

**Acceptance Criteria:**
- [ ] `agents/otel-emit.mjs` exports `writeSpan(spanObj)`
- [ ] Append-only; creates parent dir if missing
- [ ] Output is valid NDJSON (parseable line-by-line by standard tools)
- [ ] When `OTEL_DISABLED=true`, the function returns without I/O
- [ ] Concurrent writes from multiple processes do not interleave bytes (use `fs.appendFileSync` with single-write contract)

**Complexity:** S
**Value:** High

---

### REQ-003: All LLM Adapters Emit Spans

**Statement:** Every LLM adapter under `agents/adapters/` shall emit one span per `call()` invocation, regardless of success or failure.

**Acceptance Criteria:**
- [ ] Adapters covered: anthropic, openai, groq, gemini, cerebras, ollama, azure-openai, azure-foundry
- [ ] Failure path emits a span with `status.code=2` and `error.message` set
- [ ] Span timestamps capture true wall-clock duration (start before request, end after response)
- [ ] Token counts and cost USD are populated from the adapter's existing usage extraction

**Complexity:** M
**Value:** Critical

---

### REQ-004: Observability Setup Documented

**Statement:** The system shall document end-to-end collector setup so a user can ingest `pm/otel-spans.jsonl` into a standard OTel backend (Grafana Tempo, Honeycomb, Datadog) without trial-and-error.

**Acceptance Criteria:**
- [ ] `docs/observability.md` exists
- [ ] Includes a working Grafana Alloy `filelog` receiver config snippet
- [ ] Documents every emitted attribute with the OTel GenAI semantic-convention reference link
- [ ] Includes 2 example queries (e.g. "cost per agent per day", "p95 latency by model")

**Complexity:** S
**Value:** Medium
