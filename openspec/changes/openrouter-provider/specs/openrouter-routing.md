# Spec: openrouter-routing

**Date**: 2026-07-05
**Status**: specs
**Capability**: NEW

---

## Overview

Makes OpenRouter the framework's affordable default LLM provider and configures a free→cheap coding fallback ladder for both the framework and the Hermes drainer, with no OpenAI and no Claude-API dependency.

---

### REQ-001: OpenRouter LLM Adapter

**Statement:** The framework shall provide an `openrouter` LLM adapter implementing the standard interface, registered in `load-adapter.mjs`.

**Acceptance Criteria:**
- [ ] `agents/adapters/llm/openrouter.mjs` exports `complete`, `estimateTokens`, `checkAvailability`, `getModelInfo`, `listModels`
- [ ] `complete` calls OpenRouter's OpenAI-compatible endpoint with `OPENROUTER_API_KEY`; supports `options.model`, `options.system`, `options.maxTokens`, and `options.models` (native upstream fallback)
- [ ] `checkAvailability` returns `available:false` when `OPENROUTER_API_KEY` is unset, `true` when set
- [ ] `'openrouter'` is registered in `LLM_ADAPTERS`; `listLlmAdapters()` includes it
- [ ] Zero npm dependencies (stdlib `fetch` only)

**Complexity:** M · **Value:** High

---

### REQ-002: Affordable, No-OpenAI Catalog + Config

**Statement:** The framework's model configuration shall use affordable, coding-capable OpenRouter models exclusively, with no OpenAI and no Claude-API dependency.

**Acceptance Criteria:**
- [ ] The adapter's curated catalog contains no OpenAI model ids (`openai/*`, `gpt-*`)
- [ ] `project.json` `llm.defaultProvider` is `openrouter`
- [ ] Every `budget.json` agent has `provider: "openrouter"`, and no `fallbackChain` contains an OpenAI or Claude model
- [ ] `emergencyFallbackModel` is a free OpenRouter model
- [ ] `model-intel.json` has entries (provider, per-1M cost, context, strengths) for each model used in the ladders, so `model-manager models` ranks them

**Complexity:** S · **Value:** High

---

### REQ-003: Automatic Free→Cheap Routing

**Statement:** When a free/primary model is rate-limited or exhausted, the system shall route to the next affordable model automatically.

**Acceptance Criteria:**
- [ ] Hermes `~/.hermes/config.yaml` sets `model.default` to a free coder and a `fallback_providers` ladder of affordable OpenRouter models; `hermes fallback list` shows the ordered chain
- [ ] The framework adapter honors OpenRouter's `models` array for single-request upstream fallback
- [ ] Verified operationally: a rate-limited free model results in a successful response served by the next model in the ladder (not a hard failure)

**Complexity:** M · **Value:** High
