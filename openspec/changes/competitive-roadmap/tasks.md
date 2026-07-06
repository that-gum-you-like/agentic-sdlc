# Tasks: competitive-roadmap

**Date**: 2026-07-05
**Status**: planning

This is a **program**. Each capability below spawns its **own child OpenSpec change** (proposal→design→specs→tasks) and then seeds `tasks/queue/` for the autonomous drain. This file tracks the program-level sequencing; `[ ]` = not started. Hardening (Phase 0) is done by trusted operators/Claude Code first, so the drain's gates are trustworthy before it self-serves.

---

## Phase 0 — Internal hardening (do first; makes the drain trustworthy)
- [ ] **H1** Gates that enforce — review-hook can fail; pattern-hunt no always-pass; alignment real signals; schema-validator fail-closed  · Spec REQ-H1 · M
- [x] **H2** CI runs the whole suite (`__tests__` + `tests/` + four-layer + test-behavior)  · REQ-H2 · S
- [ ] **H4** Latent-bug sweep (launcher exit code, daily-review dead code, logCapabilityUsage signature, `__isMainModule` guards, semantic-index stdin+cosine)  · REQ-H4 · M
- [ ] **H5** No-OpenAI default catalog; gate openai/azure adapters  · REQ-H5 · S
- [x] **H6** Reconcile maturity 6-vs-7 + validation 4-vs-5 + add comparison matrix  · REQ-H6 · S
- [ ] **H7** De-couple hardcoded LinguaFlow/model bindings  · REQ-H7 · S
- [ ] **H8** CI-wired tests for every new module; extend `capability-monitor.mjs` only for uncovered paths (it is already tested)  · REQ-H8 · S
- [ ] **H3** Exact-accounting groundwork (feeds P4)  · REQ-H3 · S/M

## Phase 1 — Runtime foundation (parity floor)
- [ ] **P1** Sandbox-Execution Adapter (`local-worktree` default + self-host microVM)  · REQ-P1 · M
- [ ] **P3** OpenTelemetry Tracing Adapter (→ file / self-host Langfuse); merge with `cost-tracker-otel`  · REQ-P3 · M
- [ ] **P4** Exact Cost/Token Accounting  · REQ-P4 · S/M

## Phase 2 — Safety & measurement (parallel)
- [ ] **P5** Guardrails & Least-Privilege Layer (OWASP Agentic Top 10)  · REQ-P5 · M/L
- [ ] **P2** Eval & Benchmark Harness (SWE-bench Pro/Lite/Terminal-Bench + internal regression set)  · REQ-P2 · L

## Phase 3 — Advantage plays
- [ ] **P6** Deterministic-Replay Parallel Attempts (needs P1)  · REQ-P6 · L/XL
- [ ] **P9** Self-Improvement Flywheel (needs P2 + H1)  · REQ-P9 · L
- [ ] **P7** MCP Server + A2A Agent Cards  · REQ-P7 · M

## Phase 4 — Workflow depth
- [ ] **P8** PR-Native Workflow + Autonomous PR Review (needs H2)  · REQ-P8 · M
- [ ] **P10** Codebase RAG + Auto-Wiki  · REQ-P10 · L
- [ ] **P11** Spec Registry + Enforced Constitution  · REQ-P11 · M

---

## Program verification
- [ ] Each child change validates in the house style (proposal + Value Analysis + design + specs + tasks + status)
- [ ] Each shipped module: pluggable, self-hostable, **no OpenAI**, tested-in-CI, `__isMainModule`-guarded, `comparison.md` matrix row updated
- [ ] H6 builds a **numbered** capability matrix in `docs/comparison.md` (with ✅/🟡/❌ cells) FIRST; then each module flips its named row to ✅ as it lands
- [ ] Flywheel (P9) shows agent quality as a measured graph — the differentiator proof

## Notes
- Full prioritized detail + rationale + sources: `openspec/BACKLOG.md` § **Competitive Roadmap 2026**.
- Sequencing rule: parity floor (P1/P3/P4) + hardening before advantage plays (P6 needs P1; P9 needs P2+H1).
- Existing in-flight changes to **fold in, not duplicate**: `openrouter-provider` (→H5, already ships the affordable ladder + removes `gpt-4o-mini`), `cost-tracker-otel` (→P3/P4, already specs `gen_ai.usage.cost.usd`), `replay-regression-ci-gate` (→P2/P6, offline replay runner). `anthropic-native-compaction` is **independent** (within-session context compaction) — not part of this roadmap.
- "The drain" = the `autonomous-drain` change (an isolated local-backend **Hermes** instance on the affordable ladder). Same runtime, two names.
