## Context

The model-manager currently operates at maturity level ~2.5: functional monitoring and reactive swaps, but no enforcement, no intelligence, no prediction. This design elevates it to level 5+.

## Goals / Non-Goals

**Goals:**
- Zero downtime from budget exhaustion (predictive swap)
- Cross-provider cost optimization (compare models across Anthropic, OpenAI, Groq, Ollama)
- Quality-aware routing (match model strengths to task types)
- Self-updating model knowledge via web research
- Enforce budget-exhausted state in queue-drainer

**Non-Goals:**
- Managing API keys or provider accounts
- Real-time cost streaming (batch is fine)
- Replacing human judgment on model selection (suggest, don't force)

## Decisions

### D1: Model intelligence is a JSON file, not a database
`agents/model-intel.json` — a flat JSON file with structured model data. Updated by `model-manager.mjs research` command. Checked into git so all agents share the same knowledge. Easy to review diffs.

### D2: Predictive swap uses linear burn rate extrapolation
Calculate tokens/hour from recent cost-log entries, project when budget will hit 100%, swap when projected depletion is within 1 hour. Simple, explainable, no ML needed.

### D3: Quality ratings are per-task-type, 1-5 scale
Each model gets ratings for task types: `coding`, `review`, `documentation`, `architecture`, `research`. Ratings come from model-intel.json (seeded from known benchmarks, updated by research command and performance data).

### D4: Research command fetches pricing pages, not arbitrary web
Curated list of pricing URLs per provider. Parse known page structures. Fallback: manual update of model-intel.json.

### D5: Cross-provider routing is opt-in via budget.json
`fallbackChain` can now include models from any provider (e.g., `["claude-sonnet-4-6", "gpt-4o-mini"]`). The user explicitly configures which providers they want. Model-manager recommends but doesn't auto-add providers.

### D6: Budget enforcement is a simple check, not a new system
Queue-drainer reads `activeModel` field. If it equals `"budget-exhausted"`, skip that agent. One `if` statement.

## Risks / Trade-offs

- **[Risk] Web research is fragile** — Pricing page HTML changes break parsing. Mitigation: graceful degradation to cached model-intel.json. Research is always optional.
- **[Risk] Predictive swap triggers too early** — Swap at projected 1hr-to-exhaustion may be premature for bursty workloads. Mitigation: configurable threshold, conservative default.
- **[Risk] Cross-provider fallback introduces latency** — Different providers have different response times. Mitigation: model-intel.json includes latency estimates.
