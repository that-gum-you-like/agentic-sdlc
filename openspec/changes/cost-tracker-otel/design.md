# Design: cost-tracker-otel

**Date**: 2026-05-27
**Status**: design

---

## Context

OTel GenAI semantic conventions (stable as of 2026) define standard attribute names for AI spans:

- `gen_ai.system` — provider (e.g. "anthropic", "groq")
- `gen_ai.request.model` — model id
- `gen_ai.response.model` — actually-used model (may differ on fallback)
- `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`
- `gen_ai.usage.cost.usd` (extension)
- `gen_ai.agent.name` — our agent role (Roy, Moss, etc.)
- `gen_ai.agent.task_id` — task queue id when present

A span per LLM call gives us correlatable traces without changing the framework's zero-dep posture.

---

## Goals

- Every LLM call through `agents/adapters/*` emits an OTel-compliant span line to `pm/otel-spans.jsonl`
- Zero npm deps added
- Existing `agents/cost-tracker.mjs` behavior unchanged (additive)
- Documented path for users to pipe spans into Grafana / Honeycomb / Datadog via OTel collector

## Non-Goals

- Bundling an OTel collector
- Live OTLP/HTTP export (deferred — file-based first)
- Trace propagation across processes (single-process for now)

---

## Design

### otel-schema.mjs

```javascript
export function makeGenAiSpan({
  agent, taskId, system, requestModel, responseModel,
  inputTokens, outputTokens, costUsd, startTime, endTime, status, error
}) {
  return {
    name: `gen_ai.${system}.chat`,
    kind: 'CLIENT',
    startTimeUnixNano: startTime * 1e6,
    endTimeUnixNano: endTime * 1e6,
    attributes: {
      'gen_ai.system': system,
      'gen_ai.request.model': requestModel,
      'gen_ai.response.model': responseModel ?? requestModel,
      'gen_ai.usage.input_tokens': inputTokens,
      'gen_ai.usage.output_tokens': outputTokens,
      'gen_ai.usage.cost.usd': costUsd,
      'gen_ai.agent.name': agent,
      ...(taskId && { 'gen_ai.agent.task_id': taskId }),
      ...(error && { 'error.message': error })
    },
    status: { code: status === 'ok' ? 1 : 2 }
  };
}
```

### Adapter integration

Each `agents/adapters/<provider>.mjs` exports `call(params)`. Wrap with:

```javascript
import { makeGenAiSpan } from '../otel-schema.mjs';
import { writeSpan } from '../otel-emit.mjs';

export async function call(params) {
  const start = Date.now();
  try {
    const result = await _callImpl(params);
    writeSpan(makeGenAiSpan({ ...spanContext, ...result.usage, startTime: start, endTime: Date.now(), status: 'ok' }));
    return result;
  } catch (e) {
    writeSpan(makeGenAiSpan({ ...spanContext, startTime: start, endTime: Date.now(), status: 'error', error: e.message }));
    throw e;
  }
}
```

### Emission

`agents/otel-emit.mjs` — single function `writeSpan(span)` that appends NDJSON to `pm/otel-spans.jsonl`. Optional `OTEL_DISABLED=true` env var to no-op for tests.

### Collector setup (docs/observability.md)

Example Grafana Alloy config snippet:

```yaml
otelcol.receiver.filelog "agent_spans" {
  include = ["/home/bryce/agentic-sdlc/pm/otel-spans.jsonl"]
  operators = [{ type = "json_parser" }]
  output { traces = [otelcol.exporter.otlp.tempo.input] }
}
```
