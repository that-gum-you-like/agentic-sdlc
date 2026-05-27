# Spec: in-flight-compaction

**Date**: 2026-05-27
**Status**: specs
**Capability**: NEW

---

## Overview

Defines integration of Anthropic's native `compact-2026-01-12` API into the framework's adapter and memory-manager layers, providing within-session compaction for long-horizon agent runs without disturbing the REM-sleep between-session role.

---

## Requirements

### REQ-001: Anthropic Adapter Supports Compaction Param

**Statement:** The Anthropic adapter shall accept a `compaction: { trigger, threshold }` parameter and, when present, attach the appropriate header/body fields to invoke native compaction.

**Acceptance Criteria:**
- [ ] `agents/adapters/anthropic.mjs` exports `features.nativeCompaction = true`
- [ ] When `compaction` param is present, the request includes the `anthropic-beta: compact-2026-01-12` header (or current equivalent — verify against live docs at impl time)
- [ ] When `compaction` is absent, request is unchanged from current behavior
- [ ] Backward compatible — existing callers unaffected

**Complexity:** S
**Value:** High

---

### REQ-002: Memory-Manager Routes Through Native Compaction When Available

**Statement:** The memory-manager shall query the active adapter for `features.nativeCompaction` and, when true, attach a `compaction` param to long-horizon calls.

**Acceptance Criteria:**
- [ ] `shouldCompactInFlight(agent)` returns true only when the agent's adapter advertises `features.nativeCompaction`
- [ ] `buildCallParams(agent, baseParams)` returns base params unchanged when feature unavailable
- [ ] When feature available, returns base params + `compaction: { trigger: 'token-count', threshold: 80000 }`
- [ ] `agents/queue-drainer.mjs` (and other long-horizon callers) route through `buildCallParams()`

**Complexity:** S
**Value:** High

---

### REQ-003: Compaction Events Emit OTel Spans

**Statement:** When a compaction event occurs, the adapter shall emit an OTel span with `gen_ai.compaction.*` attributes.

**Acceptance Criteria:**
- [ ] Span includes `gen_ai.compaction.tokens_before`, `gen_ai.compaction.tokens_after`, `gen_ai.compaction.turns_compacted`
- [ ] Span emitted only when the API response indicates a compaction occurred
- [ ] Depends on `cost-tracker-otel` having shipped (`makeGenAiSpan()` available)

**Complexity:** S
**Value:** Medium

---

### REQ-004: Layered Memory Model Documented

**Statement:** The system shall document the two-layer memory model (within-session native compaction + between-session REM-sleep consolidation) so contributors understand which layer to extend for new use cases.

**Acceptance Criteria:**
- [ ] `docs/memory-protocol.md` has a "Layered memory model" section
- [ ] Clear delineation: native compaction = in-flight, REM-sleep = offline
- [ ] Guidance on when to extend each
- [ ] Notes that non-Anthropic adapters fall back to the legacy turn-counter summarization path

**Complexity:** S
**Value:** Medium
