# Spec: advantage-and-interop

**Date**: 2026-07-05
**Status**: specs
**Capability**: NEW · Track 3

The durable moats — a measurable self-improvement flywheel and deterministic-replay parallelism no competitor ships — plus the interop that ends our portability tax.

---

### REQ-P6: Deterministic-Replay Parallel Attempts  · Advantage · Complexity L/XL

**Statement:** For a task, the framework shall run N candidate solutions in parallel sandbox forks and select the one that passes the test-gate.

**Acceptance Criteria:**
- [ ] Uses the sandbox adapter's `fork` (P1) to spawn N isolated attempts from one base snapshot (Morph-Infinibranch-style)
- [ ] Each attempt runs the micro cycle to the mandatory test-gate; the winner is the first/best to pass `npm test` + `four-layer-validate`
- [ ] Losers are destroyed; the winner's diff becomes the PR; N and per-attempt budget are configurable and cost-tracked (P4)
- [ ] Deterministic + logged (P3) so a run is replayable
- [ ] Fuses our unique mandatory test-gate with VM-fork parallelism; tests on a toy task; docs (gap #9 closed, advantage)

---

### REQ-P9: Self-Improvement Flywheel  · Advantage · Complexity L

**Statement:** Benchmark/regression results shall automatically drive defeat-test generation and agent maturity transitions, with measured deltas.

**Acceptance Criteria:**
- [ ] Eval regressions (P2) feed `pattern-hunt.mjs` → **real** defeat tests (never the always-passing scaffold — depends on H1)
- [ ] Maturity transitions (`memory-manager`) are gated on *measured* eval deltas, not just correction counts; the alignment score derives from real signals (depends on H1)
- [ ] A dashboard shows agent-quality-over-time as a graph (the claim becomes a chart) from `pm/eval/` + telemetry
- [ ] Closed loop is documented as the framework's flagship differentiator; end-to-end test on a seeded regression
- [ ] The one thing **no competitor can do** — turns three existing-but-siloed primitives into one measurable engine (advantage)

---

### REQ-P7: MCP Server + A2A Agent Cards  · Parity→Advantage · Complexity M

**Statement:** The framework shall expose its agents/queue over MCP and publish A2A agent cards so external orchestrators can discover and drive them.

**Acceptance Criteria:**
- [ ] An MCP server exposes queue operations + agent invocation as MCP tools (stdlib/self-hostable; note the R-01 backlog caveat re: MCP spec flux — target the stabilized post-2026 spec)
- [ ] A2A **agent cards** served at `/.well-known/agent-card.json` describing each execution agent's skills/inputs (Linux-Foundation A2A v1.0, signed cards)
- [ ] Removes the "requires Claude Code; not portable" limitation; external agents can queue/drive work
- [ ] Tests (schema-validate the cards + a round-trip MCP call); docs (gaps #16/#17/#18 closed)
