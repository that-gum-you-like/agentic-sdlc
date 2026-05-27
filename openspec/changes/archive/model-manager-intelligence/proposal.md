# Proposal: model-manager-intelligence

**Date**: 2026-04-07
**Author**: Bryce (CTO) + Claude
**Status**: proposed

---

## Discovery

- **Files examined**: `agents/model-manager.mjs` (301 lines, 4 commands), `agents/queue-drainer.mjs` (budget enforcement gap at task assignment), `agents/adapters/llm/*.mjs` (4 adapters with `getModelInfo()`), `agents/budget.json`, `agents/load-config.mjs` (budget normalization), `agents/cost-tracker.mjs` (efficiency metrics), `agents/worker.mjs` (reads activeModel + modelPreferences)
- **Existing patterns**: Hardcoded `MODEL_COST_ORDER` array in recommend() only covers Anthropic + Groq. No OpenAI or Ollama models. No cross-provider comparison.
- **Existing tests**: Interface tests exist (adapter loading, config normalization). Zero functional tests for swap logic, threshold detection, or recommendation engine.
- **Key findings**: Queue-drainer does NOT check `budget-exhausted` before assigning tasks — the single most critical gap. Model-manager currently operates reactively (swap after exhaustion) rather than predictively (swap before exhaustion).

---

## Problem

The model-manager monitors token budgets and swaps models on exhaustion, but it's reactive, single-provider, and has a critical enforcement gap. Agents can be assigned tasks after budget exhaustion because queue-drainer doesn't check. The cost model is hardcoded to Anthropic/Groq models only. There's no intelligence about which models are good at what, no ability to research current pricing, and no predictive capability to avoid downtime.

For a framework that supports 4 LLM providers and claims to optimize agent performance, the model-manager needs to be the smartest component in the system — actively researching costs, predicting budget depletion, and routing tasks to the best model for the job.

---

## Proposed Solution

Transform model-manager from a reactive budget monitor into an intelligent, research-driven model optimization system with five new capabilities:

1. **Budget enforcement** — Queue-drainer blocks assignment to exhausted agents
2. **Model intelligence database** — Structured knowledge of all models across all providers (costs, strengths, limitations, context windows), updatable via web research
3. **Predictive budget management** — Estimate depletion time from burn rate, pre-emptively swap before hitting 100% to guarantee zero downtime
4. **Cross-provider cost-aware routing** — Dynamic cost model from adapters + intel database, enabling cross-provider swap recommendations
5. **Quality-aware model selection** — Match model strengths to task types (architecture → strong reasoning, simple fix → fast/cheap)

---

## Value Analysis

### Benefits

- **Zero downtime from budget exhaustion** — predictive swap eliminates the gap between exhaustion and swap
- **Cost optimization across providers** — "Roy could use gpt-4o-mini at 80% savings with same success rate"
- **Quality optimization** — Right model for the right task, not one-size-fits-all
- **Self-updating** — Research command keeps pricing current as providers change rates
- **Universal** — Works for any combination of providers the user has configured

### Costs

- **Effort**: Medium-large (5-6 implementation tasks)
- **Risk**: Low — all changes are additive, existing behavior preserved
- **Dependencies**: WebFetch capability for research command (optional — manual update still works)

### Alternatives Considered

| Alternative | Reason Rejected |
|---|---|
| Manual model assignment only | Doesn't scale, humans can't track burn rates across agents in real time |
| External cost tracking service | Adds a dependency, framework should be self-contained |
| Do nothing | Leaves critical enforcement gap and single-provider limitation |

### Decision

Yes — the model-manager is the economic brain of the agent system. Investing here pays dividends on every task every agent runs.

---

## Scope

### In Scope

- Queue-drainer budget enforcement
- Model intelligence database (JSON) with research command
- Predictive budget management (burn rate → pre-emptive swap)
- Cross-provider dynamic cost model
- Quality-aware task-to-model routing
- Functional tests for all logic

### Out of Scope

- Auto-purchasing API keys or managing provider accounts
- Real-time streaming cost tracking (still batch via cost-log.json)
- Automatic model fine-tuning or prompt optimization

---

## Next Step

If approved: proceed to design phase.
