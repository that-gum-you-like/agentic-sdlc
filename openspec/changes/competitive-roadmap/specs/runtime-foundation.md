# Spec: runtime-foundation (parity floor)

**Date**: 2026-07-05
**Status**: specs
**Capability**: NEW · Track 1

Sandboxed execution, structured tracing, and exact cost — the credibility floor every serious autonomous product now has. Each is a pluggable, self-hostable, no-OpenAI adapter. REQs keyed `REQ-P<n>`; capability-gap notes reference the numbered matrix H6 builds in `docs/comparison.md` (by name until that matrix exists).

---

### REQ-P1: Sandbox-Execution Adapter  · *Parity*

**Statement:** The framework shall run agent code execution in a pluggable sandbox rather than only in the host working tree.

**Acceptance Criteria:**
- [ ] `agents/adapters/sandbox/` with interface `{ create, exec, writeFiles, readFiles, snapshot, fork, destroy }` and a name→module loader mirroring `load-adapter.mjs`
- [ ] Implementations: `local-worktree` (git-worktree isolation, default, zero-dep) and at least one true isolate — self-hostable **microsandbox/libkrun** microVM preferred (privacy-first); `e2b`/`daytona` optional
- [ ] Selected via `project.json.sandbox.adapter`; `checkAvailability()` degrades gracefully to `local-worktree`
- [ ] The autonomous drain and `worker`/`autonomous-launcher` run through the adapter; a sandbox failure never corrupts the host repo
- [ ] Tests + `__isMainModule` guard; docs in `script-reference.md`; closes the **sandboxed-execution** gap (matrix row added in H6)

**Dependencies:** none (foundational; unblocks P6). **Complexity:** M. **Value:** Critical.

---

### REQ-P3: OpenTelemetry Tracing Adapter  · *Parity*

**Statement:** The framework shall emit OpenTelemetry GenAI spans for agent steps, tool calls, and handoffs, exportable to a self-hosted backend.

**Acceptance Criteria:**
- [ ] `agents/adapters/telemetry/` emits `gen_ai.*` semconv spans (model, prompt/completion tokens, cost, latency, tool name, agent, task id)
- [ ] Exporters: `file` (JSONL to `pm/otel-spans.jsonl`, default, zero-dep) and `otlp` → self-hosted **Langfuse** (MIT); no cloud/OpenAI dependency
- [ ] Instrumentation wraps the LLM adapter `complete()` path + capability logger without breaking the `__isMainModule` posture
- [ ] **Merge with, don't duplicate,** the in-flight `cost-tracker-otel` change (which already specs `gen_ai.usage.cost.usd` emission) — this REQ supersedes/extends it
- [ ] Tests; docs; closes the **observability/tracing** gap (matrix row in H6)

**Dependencies:** folds in `cost-tracker-otel`. **Complexity:** M. **Value:** High.

---

### REQ-P4: Exact Cost & Token Accounting  · *Parity*

**Statement:** The framework shall compute cost in dollars and roll it up per task/agent/model, feeding the budget circuit-breaker. (Realized-token *capture* is H3; P4 is the `$` math and rollups on top of it — the two do not overlap.)

**Acceptance Criteria:**
- [ ] `cost-tracker.mjs` computes `$` from the realized tokens H3 captures × `model-intel.json` per-1M pricing (today it records tokens with no `$`)
- [ ] Per-task / per-agent / per-model `$` rollups; fed back into `budget.json` circuit-breaker decisions
- [ ] Reuses `cost-tracker-otel`'s `gen_ai.usage.cost.usd` where present rather than re-deriving
- [ ] Removes the self-admitted "budget tracking is approximate" limitation from docs
- [ ] Tests assert `$` math against known usage fixtures; closes the **exact-cost-accounting** gap (matrix row in H6)

**Dependencies:** H3 (realized-token capture), P3/`cost-tracker-otel` (span cost). **Complexity:** S/M. **Value:** High.
