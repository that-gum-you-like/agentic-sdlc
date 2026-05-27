# Proposal: anthropic-native-compaction

**Date**: 2026-05-27
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: proposed

---

## Problem

The framework's memory system uses hand-rolled REM-sleep summarization (`agents/rem-sleep.mjs`) to compact long-running agent memory into core/long/medium/recent tiers. Anthropic's `compact-2026-01-12` API (production-ready across Bedrock/Vertex/Foundry as of early 2026) provides provider-native compaction with:

- Better fidelity than ad-hoc summarization (model-aware salience)
- Lower cost (compaction billed at sonnet rates rather than full-prefix re-send)
- Automatic cache-aware boundary placement (preserves prompt-caching benefits)

Per Zylos 2026 research: "Constraint compliance decays from 73% (turn 5) to 33% (turn 16) without memory mitigation." Native compaction reportedly cuts that decay materially.

REM-sleep stays useful for *between-session* consolidation (its current role), but *within-session* compaction should hand off to the native API when the adapter is Anthropic.

---

## Discovery

- **Files involved**:
  - `agents/adapters/anthropic.mjs` — Anthropic adapter, currently no compaction option
  - `agents/rem-sleep.mjs` — between-session consolidation; stays as-is
  - `agents/memory-manager.mjs` — per-agent memory tier management
  - `agents/templates/*/memory/recent.json` — per-agent working memory; current compaction target
- **Existing patterns**:
  - Adapters expose a `call(params)` surface; adding `params.compaction` is non-breaking
  - `memory-manager.mjs` already has tier transitions; native compaction hooks here
- **Constraints**:
  - Only applies to Anthropic adapter (other providers don't have an equivalent)
  - Must gracefully no-op on non-Anthropic providers
  - Must not break REM-sleep — they cover different scopes

---

## Proposed Solution

1. Extend `agents/adapters/anthropic.mjs` `call()` to accept `compaction: { trigger: 'token-count' | 'turn-count', threshold: N }`
2. When the threshold is hit, attach the `compact-2026-01-12` request header / param per current Anthropic spec
3. Update `agents/memory-manager.mjs` to ask the active adapter "do you support native compaction?" before falling back to REM-sleep style summarization for the within-session case
4. Keep `agents/rem-sleep.mjs` unchanged — it covers the between-session role
5. Document the layered model in `docs/appendix/memory-system.md` (once `claude-md-token-diet` runs) or `docs/memory-protocol.md` (today)
