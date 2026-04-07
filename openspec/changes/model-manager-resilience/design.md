## Goals / Non-Goals

**Goals:**
- Never fully stop due to a single provider failure
- Always have a free fallback in the chain
- Detect and recover from failures within 15 minutes (one check cycle)
- Alert human on critical failures

**Non-Goals:**
- Guarantee same quality on free fallbacks (degraded is acceptable)
- Auto-purchase paid tiers
- Support every free LLM provider (just the reliable ones)

## Decisions

### D1: Three-tier fallback strategy
Every agent's fallback chain follows: **Paid primary → Paid secondary → Free emergency**
- Example for Anthropic user: `claude-sonnet → gpt-4o-mini → llama-3.3-70b-versatile (groq free)`
- Example for OpenAI user: `gpt-4o → claude-sonnet → llama-3.3-70b-versatile (groq free)`
- The free tier is always last — quality degrades but work never stops

### D2: Health check is a minimal completion request
Ping = send a 1-token prompt ("hi") with max_tokens=1. If it returns within 5 seconds, provider is healthy. If it times out or errors, provider is down. Cost: ~2 tokens per check per provider = negligible.

### D3: Gemini adapter uses Google AI Studio (free, no CC)
Uses `generativelanguage.googleapis.com` endpoint with API key auth. Free tier: gemini-2.5-flash at 250 req/day, 250K TPM. Sufficient for emergency fallback.

### D4: Cerebras adapter uses OpenAI-compatible API
Cerebras exposes an OpenAI-compatible endpoint at `api.cerebras.ai`. Near-identical to the Groq adapter. Free tier: 1M tokens/day. Fast inference.

### D5: Stale task reset happens in model-manager check(), not queue-drainer
model-manager already runs every 15 min on systemd. Adding stale detection here means one script handles all recovery. Queue-drainer stays focused on assignment.

### D6: Provider health state is tracked in model-intel.json
Add `providerHealth` object: `{ "anthropic": { "status": "up", "lastChecked": "..." }, ... }`. Persisted between checks so the system remembers outages across restarts.

## Risks / Trade-offs

- **[Risk] Free tier rate limits under heavy load**: 100K tokens/day on Groq free is enough for ~5-10 tasks. If the whole team is on free fallback, work slows significantly. Mitigation: alert human immediately so they can fix the paid account.
- **[Risk] Health check false positives**: Transient network blip → unnecessary swap. Mitigation: require 2 consecutive failures before declaring provider down.
- **[Risk] Google/Cerebras free tiers change**: They could add CC requirements or reduce limits. Mitigation: model-intel.json is easily updated, research command checks weekly.
