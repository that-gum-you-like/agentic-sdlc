# Proposal: model-manager-resilience

**Date**: 2026-04-07
**Author**: Bryce (CTO) + Claude
**Status**: proposed

---

## Discovery

- **Files examined**: `agents/model-manager.mjs` (current check() only reads cost-log, no API health check), `agents/queue-drainer.mjs` (STALE_CLAIM_MS = 30 min exists but doesn't auto-reset), `agents/adapters/llm/` (4 adapters: anthropic, openai, groq, ollama — no Gemini, no Cerebras), `agents/budget.json` (all fallback chains are single-provider Anthropic)
- **Existing patterns**: Groq adapter uses OpenAI-compatible API format — Cerebras uses identical format. Gemini uses Google's generativeai endpoint.
- **Key findings**: If Anthropic goes down, every agent in the default config is dead. model-manager detects budget depletion but not provider outages. Stale task detection exists but doesn't auto-recover. No notification path for provider failures.

---

## Problem

When a paid LLM provider goes down or an account runs out of tokens, the entire agent system stops. The model-manager can swap between models but only within the same provider. There's no health check to detect provider outages, no cross-provider fallback, no auto-recovery for stuck tasks, and no notification to the human. The system should be self-healing: detect the failure, route around it to a free fallback, unstick any stranded tasks, and alert the human.

---

## Proposed Solution

Five changes that create a fully self-healing recovery path:

1. **Free emergency fallback adapters** — Add Gemini (free: 250 req/day, flash model) and Cerebras (free: 1M tokens/day, llama 8B) as zero-cost last-resort providers
2. **Active health check** — model-manager check() pings each configured provider. If unreachable, immediately swap affected agents to a healthy provider
3. **Auto-reset stale tasks** — Tasks stuck in_progress > 30 min get auto-reset to pending so they can be reassigned
4. **Crash notification** — WhatsApp alert when a provider goes down or all fallbacks are exhausted
5. **Cross-provider fallback chains by default** — setup.mjs generates chains that always end with a free-tier model

---

## Value Analysis

### Benefits

- **Self-healing**: Provider outage → auto-swap to healthy provider → work continues
- **Zero-cost safety net**: Groq/Cerebras/Gemini free tiers as last resort — degraded quality but never fully stopped
- **Human gets alerted**: WhatsApp notification on critical failures
- **Stuck tasks recover**: Auto-reset prevents permanent task stalls

### Costs

- **Effort**: Medium (2 new adapters, health check logic, stale task reset)
- **Risk**: Low — all additive, existing paths unchanged
- **Dependencies**: Free-tier API keys from Groq (already have), Google AI Studio (free signup), Cerebras (free signup)

### Decision

Yes — the difference between "system stops for hours until human notices" and "system degrades gracefully and alerts human" is the difference between a tool and an infrastructure.

---

## Scope

### In Scope

- Gemini adapter (flash model, free tier)
- Cerebras adapter (llama 8B, free tier)
- Health check in model-manager check()
- Stale task auto-reset
- Notification on provider failure
- Cross-provider default fallback chains

### Out of Scope

- Auto-provisioning API keys
- Paid tier management for new providers
- Custom fine-tuned model support
