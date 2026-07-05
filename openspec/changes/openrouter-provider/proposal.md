# Proposal: openrouter-provider

**Date**: 2026-07-05
**Author**: CTO-Opus (claude-opus-4-8[1m]) with Bryce
**Status**: proposed

---

## Problem

Autonomous backlog work should run on **affordable, coding-capable LLMs via OpenRouter**, with automatic routing to the next model when one is rate-limited or exhausted — not on Claude (Bryce has no Anthropic **API** key; his Claude access is the monthly Pro/Max **subscription**, usable only interactively through Claude Code, not by the framework's programmatic adapter).

Two concrete gaps:
1. **No OpenRouter LLM adapter** in the framework (`agents/adapters/llm/`), so `llm.defaultProvider` can't be OpenRouter and framework `complete()` calls default to `anthropic` — which fails with no API key.
2. **`budget.json` violates the no-OpenAI rule and the reality:** two fallback chains contain `gpt-4o-mini` (OpenAI — banned), and every agent's primary is a Claude model requiring an API key that doesn't exist.

Meanwhile the real backlog **drainer** is **Hermes** (`~/.hermes/`), which already uses OpenRouter — but it was pointed at a single free general model with **no fallback chain**, so a rate-limited free model would just fail instead of routing onward.

## Discovery

- **Hermes** (`hermes fallback`, `hermes model`) supports a primary model + an ordered `fallback_providers` chain tried on rate-limit/5xx/connection errors — exactly the desired "route automatically as one runs out of tokens." `OPENROUTER_API_KEY` is set in `~/.hermes/.env`.
- **Framework adapters** are OpenAI-compatible-friendly (`groq.mjs` is a clean template); OpenRouter's API is OpenAI-compatible at `https://openrouter.ai/api/v1`, and its native `models: [...]` request param does upstream fallback within a single call.
- **Live OpenRouter catalog** (Hermes's `cache/openrouter_model_metadata.json`) gives current ids + pricing. Verified affordable, coding-capable, **non-OpenAI** models: `qwen/qwen3-coder:free` (1M ctx), `cohere/north-mini-code:free`, `qwen/qwen3-coder-30b-a3b-instruct` ($0.07/M), `deepseek/deepseek-v4-flash` ($0.09/M, 1M ctx), `deepseek/deepseek-chat-v3.1`, `qwen/qwen3-coder` (480B flagship). No free DeepSeek currently exists.
- **Constraints:** zero npm deps; no OpenAI; privacy-first; every script/adapter tested.

## Proposed Solution

1. **Framework OpenRouter adapter** — `agents/adapters/llm/openrouter.mjs` (OpenAI-compatible, `OPENROUTER_API_KEY`, attribution headers, native `models` fallback passthrough) implementing the 5-method LLM interface, with a curated **affordable, no-OpenAI** catalog. Register `openrouter` in `load-adapter.mjs`.
2. **Config as source of truth** — `project.json` `llm.defaultProvider: "openrouter"`; `budget.json` rewritten so every agent uses the affordable coding ladder (free → cheap), **removing all OpenAI and Claude-API dependencies**; `emergencyFallbackModel` → a free OpenRouter coder; `model-intel.json` gains entries (cost/strengths) for the OpenRouter models so quality-aware routing works.
3. **Hermes side (operational, documented)** — `~/.hermes/config.yaml` primary → `qwen/qwen3-coder:free` plus a 5-rung `fallback_providers` ladder, so Hermes auto-routes free → cheap when throttled. This is the runtime that actually drains the backlog.

## Value Analysis

- **Delivers affordable autonomous operation:** the drainer (Hermes) and the framework's own LLM calls both run on free-first, cheap-fallback coding models on Bryce's existing OpenRouter balance.
- **Fixes a no-OpenAI compliance violation** (`gpt-4o-mini` in two fallback chains) and removes a dead Claude-API dependency the framework couldn't satisfy.
- **Automatic resilience:** rate-limited/exhausted free models route onward — verified live (free `qwen3-coder:free` 429 → OpenRouter served `deepseek-v4-flash`).
- **Privacy-first:** curated catalog excludes OpenAI; no new deps; same OpenRouter account already in use.
- **Cost:** S–M. One adapter + one registration + three config files + tests + docs. Risk low; the Claude subscription remains available for interactive Claude Code use.
