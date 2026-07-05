# Spec: runtime-foundation (parity floor)

**Date**: 2026-07-05
**Status**: specs
**Capability**: NEW · Track 1

Sandboxed execution, structured tracing, and exact cost — the credibility floor every serious autonomous product now has. Each is a pluggable, self-hostable, no-OpenAI adapter.

---

### REQ-P1: Sandbox-Execution Adapter  · Parity · Complexity M

**Statement:** The framework shall run agent code execution in a pluggable sandbox rather than only in the host working tree.

**Acceptance Criteria:**
- [ ] `agents/adapters/sandbox/` with interface `{ create, exec, writeFiles, readFiles, snapshot, fork, destroy }` and a name→module loader mirroring `load-adapter.mjs`
- [ ] Implementations: `local-worktree` (git-worktree isolation, default, zero-dep) and at least one true isolate — self-hostable **microsandbox/libkrun** microVM preferred (privacy-first); `e2b`/`daytona` optional
- [ ] Selected via `project.json.sandbox.adapter`; `checkAvailability()` degrades gracefully to `local-worktree`
- [ ] The autonomous drain and `worker`/`autonomous-launcher` run through the adapter; a sandbox failure never corrupts the host repo
- [ ] Tests + `__isMainModule` guard; docs in `script-reference.md` + a `comparison.md` matrix row (gap #8 closed)

---

### REQ-P3: OpenTelemetry Tracing Adapter  · Parity · Complexity M

**Statement:** The framework shall emit OpenTelemetry GenAI spans for agent steps, tool calls, and handoffs, exportable to a self-hosted backend.

**Acceptance Criteria:**
- [ ] `agents/adapters/telemetry/` emits `gen_ai.*` semconv spans (model, prompt/completion tokens, cost, latency, tool name, agent, task id)
- [ ] Exporters: `file` (JSONL to `pm/otel-spans.jsonl`, default, zero-dep) and `otlp` → self-hosted **Langfuse** (MIT); no cloud/OpenAI dependency
- [ ] Instrumentation wraps the LLM adapter `complete()` path + capability logger without breaking the `__isMainModule` posture
- [ ] Coordinated with the in-flight `cost-tracker-otel` change (supersede/merge, don't duplicate)
- [ ] Tests; docs; `comparison.md` row (gap #12 closed)

---

### REQ-P4: Exact Cost & Token Accounting  · Parity · Complexity S/M

**Statement:** The framework shall account for cost and tokens using provider-reported usage, not `chars/4` estimates.

**Acceptance Criteria:**
- [ ] `cost-tracker.mjs` consumes real `inputTokens`/`outputTokens` (already returned by adapters) and computes `$` from `model-intel.json` per-1M pricing
- [ ] Per-task / per-agent / per-model `$` rollups; fed back into `budget.json` circuit-breaker decisions
- [ ] `estimateTokens` remains only a pre-flight estimate; realized usage overrides it in the ledger
- [ ] Removes the self-admitted "budget tracking is approximate" limitation from docs
- [ ] Tests assert `$` math against known usage fixtures; docs updated (gaps #4, #13 closed)
