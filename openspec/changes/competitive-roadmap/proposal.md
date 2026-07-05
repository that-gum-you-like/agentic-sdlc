# Proposal: competitive-roadmap

**Date**: 2026-07-05
**Author**: CTO-Opus (claude-opus-4-8[1m]) with Bryce
**Status**: proposed

---

## Problem

agentic-sdlc is a genuinely differentiated **methodology + governance** layer for running a multi-agent AI software-development team, but the market has standardized on a set of **runtime/infrastructure** capabilities it lacks. Two evidence-based audits (an internal capability inventory and an external competitive analysis, July 2026) converge on the same conclusion:

- **We lead** on: the OpenSpec proposal→design→specs→tasks→implement→archive lifecycle (with mandatory Value Analysis), 5-layer per-agent memory with REM-sleep consolidation, per-agent budget/circuit-breaker + cross-provider fallback governance, a Tier-5 browser-E2E multi-layer validation pipeline, and the pattern-hunt/defeat-test/maturity self-improvement *primitives*. Several of these are **unique** — no competitor pairs spec-driven development with a self-improving multi-agent team.
- **We trail** on capabilities that are now table-stakes elsewhere: **sandboxed execution**, **objective eval/benchmarking** (SWE-bench Pro / Terminal-Bench era), **OpenTelemetry tracing**, **exact cost accounting**, **MCP/A2A interop**, **PR-native workflows**, **codebase RAG/auto-wiki**, and **agent/MCP-aware guardrails** (OWASP Agentic Top 10).
- **We have internal debt** that undercuts our own moats: the self-improvement loop is *advisory, not enforcing* (the `review-hook` is a **post-commit** hook — architecturally it can't block a commit — and its checklist only ever warns; pattern-hunt's generic path emits always-passing tests; the alignment score is hand-tuned magic numbers); CI runs only **1 of ~23 unit-test files** (plus the `test-behavior` runner); token/cost accounting is `chars/4` estimates; and there are latent bugs + doc/no-OpenAI drift (incl. `model-intel.default.json` carrying OpenAI/Anthropic entries and `model-manager.research()` fetching `openai.com` pricing — both contradict the no-OpenAI posture).

The strategic read: **keep the methodology moat, adopt the runtime table-stakes as pluggable adapters (consistent with our adapter philosophy), then FUSE the two** — e.g., tie a benchmark harness to pattern-hunt so agent improvement becomes *measurable*, which no competitor can do.

## Discovery

- Internal audit: `/home/bryce/agentic-sdlc` — 40 scripts (≈31 solid, ≈6 partial, 0 pure stubs), 9 real LLM adapters, real local embeddings + AST validation. Verified gaps: `review-hook.mjs` is a post-commit hook that only warns (can't gate); `pattern-hunt.mjs:776` TODO always-passing scaffold; `model-manager.research()` is a *crude, unreliable* pricing scraper that doesn't durably update the catalog **and** fetches `openai.com` (policy leak); `cost-tracker` computes tokens not `$`; `daily-review.mjs` blocks use `fs.`/`path.` namespaces though only named members are imported (guaranteed `ReferenceError`); CI runs only `adapter-and-model-manager` + the `test-behavior` runner; `model-intel.default.json` carries 6 OpenAI + 4 Anthropic entries that violate the no-OpenAI default; several scripts miss the mandated `__isMainModule` guard. (Note: `capability-monitor.mjs` **is** tested — an earlier draft wrongly listed it as untested.)
- External landscape (cited): sandboxing (E2B/Firecracker, Daytona, Modal, microsandbox, Morph Infinibranch VM-fork); benchmarking (SWE-bench Verified **deprecated/saturated** → SWE-bench Pro, Terminal-Bench, SWE-Lancer); observability (OTel GenAI semconv → Langfuse MIT self-host, LangSmith, AgentOps, Braintrust); interop (MCP + A2A under the Linux Foundation Agentic AI Foundation); spec-driven peers (GitHub Spec Kit constitution, AWS Kiro EARS+steering, Tessl spec registry); guardrails (Llama Guard, CaMeL capability control, OWASP Agentic Top 10).
- Constraints (ours): **zero npm deps**, **privacy-first / no-OpenAI**, self-hostable-preferred, every module tested, `__isMainModule`-guarded, provider-neutral adapters. The execution engine that consumes this roadmap's tasks is the **`autonomous-drain`** change — an isolated local-backend **Hermes** instance (`~/.hermes-drain`) on the affordable OpenRouter ladder; "Hermes" (the runtime) and "autonomous-drain" (the framework wiring around it) refer to the same drainer.

## Proposed Solution

A phased **program** delivered as this OpenSpec change (roadmap + specs), which then spawns one child OpenSpec change per module and seeds the task queue for the autonomous drain. Four capability tracks + one hardening track:

1. **Runtime foundation (parity floor):** P1 Sandbox-Execution Adapter · P3 OpenTelemetry Tracing Adapter · P4 Exact Cost/Token Accounting.
2. **Safety & measurement:** P5 Guardrails & Least-Privilege Layer · P2 Eval & Benchmark Harness.
3. **Advantage plays:** P6 Deterministic-Replay Parallel Attempts · P9 Self-Improvement Flywheel · P7 MCP Server + A2A Agent Cards.
4. **Workflow depth:** P8 PR-Native Workflow + Autonomous PR Review · P10 Codebase RAG + Auto-Wiki · P11 Spec Registry + Enforced Constitution.
5. **Internal hardening (H1–H8):** make the quality gates *bite*, wire the full suite into CI, exact accounting groundwork, fix latent bugs, reconcile the no-OpenAI default catalog, resolve doc/level/layer-count drift, add missing `__isMainModule` guards, cover `capability-monitor`.

Each module keeps our house rules: a pluggable, self-hostable, no-OpenAI implementation. The full prioritized detail lives in `openspec/BACKLOG.md` (§ Competitive Roadmap 2026) and the specs here.

## Value Analysis

- **Reaches competitive parity** on the exact capabilities the market now assumes (sandbox, eval, tracing, exact cost, interop, PR-native, code RAG, guardrails) — removing the "requires Claude Code / approximate budget / not queryable" limitations we already concede.
- **Compounds our moats into durable advantage:** the Self-Improvement Flywheel (P9 = P2 ⇄ pattern-hunt ⇄ maturity) makes "agents get better over time" a measured graph, not a claim — a closed loop **we're not aware of any competitor shipping** (a directional claim, not verified); deterministic-replay parallel attempts (P6) productizes a technique almost nobody ships; exact cost + circuit-breaker (P4) makes "cost-governed autonomous engineering" a real enterprise wedge.
- **Privacy-first by construction:** every adopted table-stake has a self-hostable/OSS, no-OpenAI implementation (microsandbox/libkrun, Langfuse MIT, Llama Guard, local embeddings) — a fully self-hostable stack SaaS competitors (Devin/Factory/Cursor) structurally can't match.
- **Feeds the autonomous drain:** the hardening track first makes the gates *enforce*, so the affordable-model drain produces trustworthy PRs; then the module tasks give the drain a steady, well-specified backlog to work.
- **Cost:** XL program, but decomposed into independently-shippable S/M/L modules, each additive and adapter-shaped. Risk is scope — mitigated by strict sequencing (parity floor before advantage plays) and the "Never One More Thing" rule.
