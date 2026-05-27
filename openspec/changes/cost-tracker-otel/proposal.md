# Proposal: cost-tracker-otel

**Date**: 2026-05-27
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: proposed

---

## Problem

`agents/cost-tracker.mjs` emits custom JSON logs. As of 2026, the OpenTelemetry GenAI semantic conventions are the de-facto standard for spans/tokens/costs in AI systems (per Uptrace, Latitude, Maxim AI 2026 observability comparisons). Without OTel emission:

- We can't plug the framework into any standard observability backend (Grafana, Honeycomb, Datadog) without writing per-vendor adapters
- Multi-agent traces fragment — a single user prompt fans out to 8-15 spans (API → streaming → embeddings → vector lookup → guardrails) that can't be reconstructed without trace context
- Cost-per-session is computed offline from logs rather than visible as live spans

This is a "would-be-table-stakes if we were running in production at scale" gap. Today the framework runs solo/small-team, so the pain is latent. It bites the moment a stakeholder asks "how much did Roy cost this week?" or "what's the p95 latency on Moss?"

---

## Discovery

- **Files involved**:
  - `agents/cost-tracker.mjs` — current custom-JSON emitter
  - `agents/adapters/*.mjs` — per-provider LLM adapters (anthropic, openai, groq, gemini, cerebras, ollama, azure-*)
  - `agents/notify.mjs` — alert path for budget exhaustion
- **Existing patterns**:
  - Adapters already wrap LLM calls in a uniform `call()` function — natural OTel span boundary
  - Cost-tracker already tracks per-agent token spend — extend with span context
- **Constraints**:
  - Framework rule: zero npm dependencies. OTel JS SDK has dependencies. Options:
    a) Emit OTLP protobuf manually via stdlib (`http.request` + handcoded proto encoding — viable but ugly)
    b) Allow OTel as an optional dep with a feature flag (`OTEL_ENABLED=true`)
    c) Emit OTel-compatible JSON logs to a file and let the user's OTel collector ingest with `filelog` receiver
  - **Recommended: option (c)** — preserves zero-dep guarantee, works out-of-the-box with any OTel collector

---

## Proposed Solution

1. Define OTel GenAI-compliant span schema in `agents/otel-schema.mjs` (zero-dep, pure JSON shape)
2. Wrap each LLM adapter `call()` in a span emitter — start/end timestamps, token counts, model name, cost USD
3. Append span JSON to `pm/otel-spans.jsonl` (one span per line, NDJSON)
4. Document collector setup in `docs/observability.md` — example `filelog` receiver config for Grafana Alloy / OpenTelemetry Collector
5. Keep existing cost-tracker custom output for backward compat; add OTel as additive layer
