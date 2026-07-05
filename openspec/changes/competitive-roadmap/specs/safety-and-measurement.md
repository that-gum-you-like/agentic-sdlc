# Spec: safety-and-measurement

**Date**: 2026-07-05
**Status**: specs
**Capability**: NEW · Track 2

Runtime guardrails (mission-critical for headless autonomous + privacy-first) and objective measurement (so quality is a number, not an assertion). Capability-gap notes reference the numbered matrix H6 builds.

---

### REQ-P5: Guardrails & Least-Privilege Layer  · *Parity*

**Statement:** The framework shall enforce agent/tool guardrails at runtime, mapped to the OWASP Agentic Top 10.

**Acceptance Criteria:**
- [ ] Pre-tool-call scanning for prompt-injection / goal-hijack / exfiltration (self-hostable: **Llama Guard**-class model and/or a dual-LLM capability check; **no OpenAI, no cloud**)
- [ ] MCP/tool-call **allowlist** per agent, deny-by-default; extends the existing permission tiers (`read-only`…`deploy`) into *runtime* enforcement (not just assignment-time)
- [ ] Memory-poisoning guard on the RAG/memory read path (ASI06); rogue-agent containment via the sandbox adapter (ASI10)
- [ ] Findings logged like `red-team-tester` output (`pm/`), with `--notify` on high severity; blocks the tool call on deny (an exit-code-2-style gate, like `four-layer-validate` Layer 5)
- [ ] Coverage map to OWASP Agentic Top 10 (ASI01/02/06/10) in docs; tests; closes the **agent/MCP-aware-guardrails** gap (matrix row in H6)

**Dependencies:** P1 (sandbox for ASI10 containment). **Complexity:** M/L. **Value:** Critical.

---

### REQ-P2: Eval & Benchmark Harness  · *Parity→Advantage*

**Statement:** The framework shall objectively evaluate its own agents against external benchmarks and an internal regression set.

**Acceptance Criteria:**
- [ ] `agents/eval/` runner supporting a **current** benchmark adapter — **SWE-bench Pro / SWE-bench-Lite / Terminal-Bench** (SWE-bench Verified is deprecated/saturated — do not target it as the bar) — plus a small curated **internal regression task set** for our own agents
- [ ] Runs each task through the sandbox adapter (P1); records pass/fail, cost (P4), and trace (P3) into `pm/eval/`
- [ ] Produces a scored report + trend over time; deterministic + re-runnable; no OpenAI/cloud dependency for scoring
- [ ] Output shaped for consumption by the self-improvement flywheel (P9)
- [ ] Tests on a tiny fixture task; docs; closes the **objective-eval/benchmarking** gap (matrix row in H6). Coordinate with the in-flight `replay-regression-ci-gate` change (offline replay suite) — share the runner, don't duplicate

**Dependencies:** P1 (sandbox), P3 (trace), P4 (cost); coordinates with `replay-regression-ci-gate`. **Complexity:** L. **Value:** High.
