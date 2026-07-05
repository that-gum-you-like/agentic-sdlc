# Design: openrouter-provider

**Date**: 2026-07-05
**Status**: design

---

## Context

Three runtimes drain the shared queue (Hermes, Claude Code, autonomous-launcher). Only **Hermes** runs on OpenRouter and is the intended affordable drainer; Claude Code runs on Bryce's subscription (interactive only); the framework's programmatic adapter is used by `model-manager`/`maturity-assess`. This change makes OpenRouter the affordable default for the framework adapter **and** gives Hermes a proper free→cheap fallback ladder, so "drain the backlog with affordable models" holds regardless of which framework tool makes a call.

## Goals

- OpenRouter is a first-class framework LLM provider, interface-complete and tested.
- Framework config (project.json, budget.json, model-intel.json) reflects an affordable, coding-first, **no-OpenAI, no-Claude-API** reality.
- Hermes auto-routes free → cheap on rate-limit/exhaustion.

## Non-Goals

- Reimplementing a tool-calling agent loop in the framework (Hermes/Claude Code do execution).
- Removing the shipped `openai`/`anthropic` adapters or their `model-intel.json` entries (they remain for other users/projects); this change simply stops *this* install from routing to them.
- An automated unsupervised drain cron — a separate decision (docker-persistence + autonomy), tracked in BACKLOG.

## Design

### Adapter (`agents/adapters/llm/openrouter.mjs`)

Mirrors the `groq.mjs` shape (OpenAI-compatible `chat/completions`). Additions:
- `Authorization: Bearer OPENROUTER_API_KEY`; OpenRouter attribution headers (`HTTP-Referer`, `X-Title`).
- `options.models` passthrough → OpenRouter's native upstream fallback within one request (verified: throttled free model → served the next listed model).
- Curated `MODELS` catalog: free coders first, then cheap paid coders, **no OpenAI**. `getModelInfo` returns cost/context; unknown ids degrade to zeros (still usable — you can pass any OpenRouter id).
- `checkAvailability` = `!!OPENROUTER_API_KEY` (model-manager health uses this).

Registered as `'openrouter'` in `load-adapter.mjs` `LLM_ADAPTERS`.

### Config (source of truth)

- `project.json`: `llm.defaultProvider: "openrouter"`.
- `budget.json`: per-agent `provider: "openrouter"`, primary + `fallbackChain` from the affordable ladder; `emergencyFallbackModel: "qwen/qwen3-coder:free"`. Ladders are role-shaped: developer → coder-heavy (qwen3-coder:free → qwen3-coder-30b → deepseek-v4-flash → deepseek-chat-v3.1 → qwen3-coder); reviewer/docs → cheaper general (llama-3.3-70b:free / qwen3-next-80b:free → qwen3-30b → deepseek-v4-flash).
- `model-intel.json`: entries for each OpenRouter model (provider, cost per 1M, context, latency, coding/review/arch strengths) so `model-manager`'s quality-aware routing ranks them.

### Hermes (operational)

`~/.hermes/config.yaml`:
- `model.default: qwen/qwen3-coder:free` (was `nvidia/nemotron-3-super-120b-a12b:free`).
- `fallback_providers:` list of `{provider: openrouter, model, base_url, api_mode}` — the 5 rungs below the primary. Hermes' `fallback_config` reads `fallback_providers` as the ordered chain; verified via `hermes fallback list`. Backup saved to `config.yaml.bak.pre-openrouter-ladder`. Takes effect for CLI/headless runs immediately; the messaging gateway picks it up on restart (operator action).

### Testing

`tests/adapter-and-model-manager.test.mjs` gains: adapter count 8→9 incl. `openrouter`; openrouter interface compliance + catalog assertions (includes free primary + deepseek-v4-flash, **excludes any OpenAI id**, free cost 0, large context); `checkAvailability` toggles with `OPENROUTER_API_KEY`. Live routing (free→paid on 429) verified operationally, not in the unit suite (no network in tests).
