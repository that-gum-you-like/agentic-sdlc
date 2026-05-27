# Design: anthropic-native-compaction

**Date**: 2026-05-27
**Status**: design

---

## Context

Anthropic's `compact-2026-01-12` is invoked via a request-level flag/header. When the conversation history exceeds the configured threshold, the API itself compacts the older turns before processing, returning a `compaction` block in the response describing what was compacted. Subsequent requests use the compacted form, preserving cache prefixes after the compaction boundary.

This is fundamentally different from REM-sleep:
- **REM-sleep** runs offline between sessions, rewriting persistent memory files
- **Native compaction** runs in-flight during a session, shrinking the in-context history

Both are valuable; they're complementary.

---

## Goals

- Anthropic adapter supports native compaction via a `compaction` parameter
- Memory-manager defers to native compaction within-session when available
- Zero impact on non-Anthropic adapters
- REM-sleep continues to handle persistent-memory consolidation

## Non-Goals

- Implementing compaction for other providers (no equivalent exists)
- Replacing REM-sleep
- Cross-process compaction state sharing

---

## Design

### Adapter API extension

```javascript
// agents/adapters/anthropic.mjs
export const features = { nativeCompaction: true };

export async function call({ messages, model, compaction, ...rest }) {
  const headers = {
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2026-01-12',
    ...(compaction && { 'anthropic-beta': 'compact-2026-01-12' })
  };
  const body = {
    model, messages, ...rest,
    ...(compaction && { compaction: { trigger: compaction.trigger, threshold: compaction.threshold } })
  };
  // ... existing call logic ...
}
```

### Memory-manager integration

```javascript
// agents/memory-manager.mjs
import { getActiveAdapter } from './adapters/index.mjs';

export function shouldCompactInFlight(agent) {
  const adapter = getActiveAdapter(agent);
  return adapter.features?.nativeCompaction === true;
}

export function buildCallParams(agent, baseParams) {
  if (shouldCompactInFlight(agent)) {
    return {
      ...baseParams,
      compaction: {
        trigger: 'token-count',
        threshold: 80_000  // start compacting at 80% of typical context
      }
    };
  }
  return baseParams;
}
```

Non-Anthropic adapters have no `features.nativeCompaction` — `shouldCompactInFlight()` returns false → memory-manager falls back to existing turn-counter-triggered summarization (status quo).

### Observability

Each compaction event emits an OTel span (post `cost-tracker-otel`) with:
- `gen_ai.compaction.tokens_before`
- `gen_ai.compaction.tokens_after`
- `gen_ai.compaction.turns_compacted`

### Verification

Run a long-horizon agent task (e.g. queue drainer draining 20+ tasks in one session) twice:
1. With native compaction off — measure end-of-session token count and constraint-compliance rate
2. With native compaction on — measure same

Expect lower end-of-session tokens and higher compliance with native compaction.
