# Design: competitive-roadmap

**Date**: 2026-07-05
**Status**: design

---

## Context

This is a **program-level** change: it establishes the sequencing, the acceptance bar, and the adapter shapes for a family of modules, each of which becomes its own child OpenSpec change. It does not implement the modules — it makes them buildable (and drain-able) in the right order. The governing principle: **adopt runtime table-stakes as pluggable adapters that keep our zero-dep, no-OpenAI, self-hostable posture; then fuse them with the methodology moat.**

## Goals

- A single ranked, decomposed roadmap that reaches parity then advantage, with each module independently shippable.
- Every adopted capability has a self-hostable, no-OpenAI implementation path.
- The internal-hardening track lands first where it makes the autonomous drain trustworthy (gates that *enforce*, CI that *runs everything*).
- Clear "definition of done" per module so tasks can be seeded to the queue for the affordable-model drain.

## Non-Goals

- Implementing modules in this change (each is a child change).
- Adopting any SaaS-only dependency, any OpenAI dependency, or any npm runtime dependency.
- Chasing saturated benchmarks (SWE-bench Verified is deprecated) — target SWE-bench Pro / Terminal-Bench / an internal regression set.

## Design — tracks, sequencing, adapter shapes

### Sequencing (leverage order)

```
Phase 0  Hardening      H1 gates-bite → H2 CI-runs-all → H4 latent-bug sweep → H5 no-OpenAI default catalog
Phase 1  Runtime floor  P1 Sandbox adapter → P3 OTel tracing adapter → P4 Exact cost accounting
Phase 2  Safety+Measure P5 Guardrails/least-privilege  ‖  P2 Eval/benchmark harness
Phase 3  Advantage      P6 Replay parallel attempts → P9 Self-improvement flywheel → P7 MCP server + A2A cards
Phase 4  Workflow depth P8 PR-native + autonomous PR review → P10 Codebase RAG/auto-wiki → P11 Spec registry + constitution
```

Rationale: the drain can only be trusted once the gates *enforce* (Phase 0), so hardening precedes autonomous module work. Safety (P1/P5) and truth (P3/P4/P2) form the credibility floor before the advantage plays that build on them (P6 needs P1; P9 needs P2).

### Adapter shapes (keep the moat portable)

- **Sandbox adapter** (`agents/adapters/sandbox/*.mjs`) — interface `{ create, exec, writeFiles, snapshot, fork, destroy }`; implementations: `local-worktree` (today's behavior, default), `microsandbox`/`libkrun` (self-host microVM, privacy-first default target), `e2b`, `daytona`. Selected via `project.json.sandbox.adapter`. Unblocks P6 (fork → N attempts).
- **Telemetry adapter** (`agents/adapters/telemetry/*.mjs`) — emit OTel GenAI spans (`gen_ai.*` semconv) per agent step/tool-call/handoff; exporters: `file` (JSONL, default), `otlp` → self-hosted Langfuse. Span data is the substrate for exact cost (P4).
- **Eval harness** (`agents/eval/*.mjs`) — task-set runner (SWE-bench Pro/Lite adapter + a curated internal regression set), scored, results in `pm/eval/`; feeds pattern-hunt (P9).
- **Guardrail layer** — extend the existing permission tiers into *runtime* enforcement: pre-tool-call injection scan (Llama Guard / dual-LLM capability check, all self-hostable), MCP-tool-call allowlist, mapped to OWASP Agentic Top 10 (ASI01/02/06/10). Consistent with the existing `four-layer-validate` Layer-5 guard ethos.
- **Interop** — an MCP server exposing agentic-sdlc's queue/agents as tools, plus A2A agent cards at `/.well-known/agent-card.json`, so external orchestrators can discover/drive our agents (kills the "requires Claude Code" limitation).

### Internal hardening track (make our own claims true)

- **H1 — Gates that bite:** `review-hook.mjs` must be able to `fail` (block a commit), not only warn; `pattern-hunt.mjs` generic path must emit a real scanner or none (never an always-passing test); `alignment-monitor` score must derive from real signals, not magic numbers.
- **H2 — CI runs everything:** wire the ~22 `agents/__tests__` + `tests/` files + `four-layer-validate` + `test-behavior` into `.github/workflows` and `npm test`.
- **H3 — Exact accounting groundwork:** replace `chars/4` estimateTokens with provider-reported usage (adapters already return `tokensUsed`); compute `$` in cost-tracker.
- **H4 — Latent-bug sweep:** `autonomous-launcher.sh` EXIT_CODE captures `tee` not the agent; `daily-review.mjs` dead `fs`/`path` blocks; `logCapabilityUsage(object)` misuse in `garden-roadmap`/`alignment-monitor`; add `__isMainModule` guards to `ast-analyzer`/`version-snapshot`/`migrate-memory`/`rem-sleep`/`garden-roadmap`/`alignment-monitor`.
- **H5 — No-OpenAI default catalog:** rebuild `model-intel.default.json` around the OpenRouter/qwen/deepseek affordable ladder; drop the Anthropic/OpenAI-centric shipped default that contradicts the budget. Consider gating the `openai`/`azure-openai` adapters behind an explicit opt-in.
- **H6 — Doc/drift reconciliation:** unify the 6-level (`docs/levels/`) vs 7-level (`framework/maturity-model.md`) ladders; update `validation-patterns.md` to 5 layers; add a single competitive matrix to `docs/comparison.md`.
- **H7 — De-couple hardcoded project bindings:** `seed-queue-from-openspec.mjs` (LinguaFlow agent names) and `paperclip-sync.mjs` (stale model IDs) should read config, not literals.
- **H8 — Test coverage:** cover `capability-monitor.mjs` (shipped untested) and the new modules.

### Task seeding for the drain

Each module's `tasks.md` items are shaped small (S/M, one logical change, tests required) and, once its child change exists, seeded into `tasks/queue/` (via `seed-queue-from-openspec.mjs` after H7). The `autonomous-drain` timer then works them into review PRs. Hardening (Phase 0) is done by trusted operators/Claude Code first — precisely so the drain's gates are trustworthy before it self-serves.

### Definition of done (per module)

A module is done when: it ships as a pluggable adapter/script with a self-hostable no-OpenAI default; it has tests wired into CI; it is `__isMainModule`-guarded; docs (`script-reference`, relevant appendix, `comparison.md` matrix row) are updated; and, where relevant, it emits telemetry/eval data so P9's flywheel can see it.
