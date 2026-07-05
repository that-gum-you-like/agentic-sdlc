# OpenSpec Backlog

Potential ideas and future proposals for the agentic SDLC framework. Items here are candidates for `openspec-new-change` — they have not yet been proposed, designed, or specced. When an idea is promoted to a full openspec change, remove it from this list and link to the change directory.

---

## Promoted to Changes

The following ideas from the 2026-03-13 curriculum review have been implemented:

| # | Idea | Change |
|---|------|--------|
| 1 | Semantic Memory Retrieval | `curriculum-maturity-advancement` (tasks 4.1-4.7, 5.1-5.3, 6.1-6.3) |
| 2 | Formalized Permission Tiers | `curriculum-maturity-advancement` (tasks 2.1-2.6) |
| 3 | Structured Data Contracts | `curriculum-maturity-advancement` (tasks 1.1-1.6) |
| 4 | Framework Comparison Matrix | `curriculum-maturity-advancement` (tasks 3.1-3.5) |
| 5 | Human Wellness Guardrails | `curriculum-maturity-advancement` (tasks 13.1-13.7) |
| 6 | Human Task Assignment | `curriculum-maturity-advancement` (tasks 12.1-12.8) |
| 7 | Instance Scaling | `curriculum-maturity-advancement` (tasks 9.1-9.7) |
| 8 | Execution Cadence | `curriculum-maturity-advancement` (tasks 10.1-10.4) |
| 9 | NLP Code Analysis | `curriculum-maturity-advancement` (tasks 14.1-14.5) — partially implemented |
| 10 | Agent Evolution Timeline | `curriculum-maturity-advancement` (tasks 7.1-7.6) |
| — | Capability Monitoring | `agent-capability-checklist` (31 tasks) — 29/31 complete, system instrumentation + monitor + docs done (2026-03-13) |
| 17 | Cursor Automations Worker Integration | `cursor-automations-worker-integration` (shipped 2026-05-21) — 2 `.cursor/rules/*.mdc` files + `docs/cursor-automations-playbook.md` for the 7-Automation UI setup |
| 12 | Automated Rollback on Deploy Failure | `automated-deploy-rollback` (shipped 2026-05-21) — `agents/deploy-rollback.mjs` + 2 new notify.mjs triggers + deploy-pipeline.md.template stages 8-9 + `docs/rollback-pattern.md` |
| 18 | Cursor Rules Modernization | `cursor-rules-modernization` (shipped 2026-05-27) — pruned `.cursorrules`, split `sdlc-task-execution.mdc` into `sdlc-task-claim.mdc` + `sdlc-task-implement.mdc`, slimmed `agentic-sdlc.mdc` to 47 lines (under Morph 50-line always-apply cap), new `sdlc-testing.mdc`. All 7 rules within caps. |
| 19 | CLAUDE.md Token Diet | `claude-md-token-diet` (superseded 2026-05-27 by `onboarding-and-context-diet`) — CLAUDE.md split + AGENTS.md slim merged into the broader onboarding change |
| 19b | Onboarding + Context Diet (merged) | `onboarding-and-context-diet` (proposed 2026-05-27) — supersedes `onboarding-maturity` + `claude-md-token-diet`. Three workstreams: A) split CLAUDE.md ≤500 lines + AGENTS.md ≤150, B) README quickstart + glossary + reading order + unified maturity numbering, C) setup.mjs --help + test-behavior summary-first |
| 20 | OTel GenAI Cost-Tracker Emission | `cost-tracker-otel` (proposed 2026-05-27) — emit OpenTelemetry GenAI-compliant spans from every LLM adapter to `pm/otel-spans.jsonl` |
| 21 | Replay-Regression CI Gate | `replay-regression-ci-gate` (proposed 2026-05-27) — corpus-driven offline replay suite as required CI check on `main` |
| 22 | Anthropic Native Compaction | `anthropic-native-compaction` (proposed 2026-05-27) — integrate `compact-2026-01-12` for within-session memory compaction; REM-sleep stays as between-session role |
| 23 | Cursor 3.2 Alignment Docs | `cursor-3.2-alignment` (shipped 2026-05-27) — wrote `docs/april-vs-cursor-multitask.md`, extended `docs/cursor-background-agents.md` with deployment-modes table (Cursor cloud vs self-hosted vs framework queue-drainer), added pointers in `sdlc-housekeeping.mdc`, cross-linked from `parallelization-analyst.md` |
| 24 | Spec-Kit Cross-Feature Analysis | `spec-kit-cross-feature-analysis` (shipped 2026-05-27) — `agents/cross-feature-analyze.mjs` + 7/7 passing tests + `skills/openspec-cross-feature` + `docs/cross-feature-analysis.md` + `npm run cross-feature`. Initial run flagged 54 high-severity backlog pairs. |
| 25 | Hermes ↔ Repo ↔ Claude Integration | `hermes-integration` (proposed 2026-07-04) — ports 6 Hermes skills to `agents/templates/execution-agents/*.md`, adds 5 cron scripts (`red-team-tester`, `rag-indexer`, `health-check`, `telegram-notify`, `document-sync`) + `tests/hermes-integration.test.mjs`, and writes `docs/claude-quickstart.md` + `docs/hermes-backlog-bridge.md`. Corrects the old fork/PAT hand-off guide. |

---

## Remaining Ideas

### 11. Agent-to-Agent Direct Communication Protocol

**Problem:** Agents currently communicate through task handoffs and Matrix messages, but there's no structured protocol for agents to request specific information from each other in real-time (e.g., Roy asking Moss "what embedding model did you use?").

**Idea:** Define a request-response protocol between agents via Matrix, with schema validation on both sides.

**Complexity:** Medium.

---

### 13. Agent Specialization Branching

**Problem:** As the framework matures, a single backend agent (Roy) may need to specialize into sub-roles (Roy-API, Roy-DB, Roy-Queue). The framework doesn't support role splitting.

**Idea:** Add agent specialization templates and a "split" command that forks an agent's memory and AGENT.md.

**Complexity:** Medium.

---

## Backlog Management

- **To promote an idea**: Run `openspec-new-change` with the idea as the basis for the proposal
- **To reject an idea**: Move it to the "Rejected" section below with a reason
- **To defer an idea**: Leave it here — backlog items have no deadline

### 14. Paperclip Upgrade and Security Patch

**Problem:** Local Paperclip clone at `~/paperclip` is v0.3.0 (last commit 2026-03-13, ~70 days old). Upstream is on `v2026.517.0`. Missing critical security advisory **GHSA-68qg-g8mg-6pr7** (auth-bypass on scoped routes), patched in `v2026.416.0`. Also missing multi-user auth, MCP server beta, and ~7 minor releases of features. Currently the local instance is offline (last log entry 2026-04-15).

**Idea:** Upgrade to latest stable, run `pnpm paperclipai doctor --repair`, validate breaking changes (sandbox plugin now external, secrets enforcement), reconfigure adapters (codex-local currently erroring on missing `codex` CLI).

**Complexity:** Medium-high (breaking changes in v2026.427.0 require validation).

**Priority:** HIGH — security advisory active. **Defer until after `level-6-autonomous-activation` ships on Day 7** unless Paperclip is exposed beyond localhost.

---

### 15. Paperclip Prompt-Caching Contribution

**Problem:** Paperclip's Claude adapter has **zero prompt caching** (verified by inspection of `~/paperclip/packages/adapters/claude-local/`). Every heartbeat re-reads instructions from disk and re-sends the full prompt uncached. For 10 agents with 2K-token instruction files on hourly heartbeats, ~20K uncached tokens/hour are burned on redundant re-sends. Anthropic cache reads cost 0.1× base price — fix would cut effective per-call cost by 85-92%.

**Idea:** Implement three fixes in `~/paperclip`:
1. Add `cache_control: { type: "ephemeral", ttl: "1h" }` to system + tool blocks in the Claude adapter
2. Cache instructions file content by SHA256+mtime in `execute.ts`
3. In-memory agent record cache (60s TTL) in `heartbeat.ts`

Open a PR upstream to `paperclipai/paperclip`. High career-signal value — a merged upstream PR is a stronger demo than a personal framework.

**Complexity:** Medium (refactor stdin→SDK structured messages required for #1; #2 and #3 are tight scoped).

**Priority:** Medium-high. Run AFTER Level 6 ships (Day 7+). Coordinate with #14 upgrade.

---

### 25. Optional spaCy Layer 2.5 NLP Analyzer (carried forward from curriculum-maturity-advancement)

**Problem:** The four-layer-validate scanner doesn't catch property-name near-misses (e.g. `user.fullName` vs `user.full_name`) that pass type checks but fail at runtime. The `curriculum-maturity-advancement` change scoped tasks 14.1-14.5 for a spaCy-based optional Layer 2.5.

**Idea:** Ship `agents/nlp-analyze.py` (spaCy, local-only) + `agents/nlp-analyzer.mjs` Node wrapper + integration into `four-layer-validate.mjs` as optional Layer 2.5 (graceful skip if spaCy missing). Per zero-dep stance, must be opt-in.

**Complexity:** Medium.

**Priority:** Low — opt-in optional layer, no urgency without a triggering bug.

**Carried forward from:** `openspec/changes/archive/curriculum-maturity-advancement/` (archived 2026-05-27, 80/87 tasks complete).

---

### 26. agent-capability-checklist test coverage (carried forward)

**Problem:** `agents/capability-monitor.mjs` (16KB, shipped 2026-04-07) lacks dedicated unit tests. Tasks 7.1 and 7.2 of `agent-capability-checklist` were deferred at archive.

**Idea:** Write `agents/__tests__/capability-checklist.test.mjs` covering schema validation, config loading, drift-detection algorithm, scope-creep detection, and checklist parsing from mock agent output. Run the regression suite.

**Complexity:** Small.

**Priority:** Medium — capability monitoring is a meta-quality guardrail and protecting it with tests is worthwhile but not urgent.

**Carried forward from:** `openspec/changes/archive/agent-capability-checklist/` (archived 2026-05-27, 34/36 tasks complete).

---

### 27. voice-intake finishing touches (carried forward)

**Problem:** Voice intake is functional and in daily use, but 4 admin/docs polish tasks were left undone.

**Idea:** (a) Make `setup.mjs` scaffold `voice-config.json` during project setup as optional section; (b) Add voice input to `framework/maturity-model.md` as optional Level 6 capability; (c) Add a voice-intake row to BACKLOG.md "Promoted to Changes" table; (d) Run a manual end-to-end test (record → transcribe → type into terminal).

**Complexity:** Small (each task <30 min).

**Priority:** Low — quality-of-life polish, not blocking anything.

**Carried forward from:** `openspec/changes/archive/voice-intake/` (archived 2026-05-27, 27/31 tasks complete).

---

### 16. Memory System ACE Patterns Adoption

**Problem:** Our 5-layer memory consolidates via REM sleep using LLM judgment to decide what to promote/prune. Without quality counters per entry, we can't measure whether consolidation is improving or degrading memory quality. ACE (ace-agent/ace, MIT 1.1k stars, Nov 2025) demonstrates that incremental delta updates with helpful/harmful counters prevent "context collapse" — where wholesale rewrites lose accumulated knowledge.

**Idea:** Port three ACE patterns into our memory system (do NOT integrate the Python code; we are zero-dep Node):
1. **Helpful/harmful counters per memory entry** — each entry gets `{id, helpful: N, harmful: N, text}`. Each task outcome increments the relevant counters of memories the agent consulted. REM sleep prunes high-harmful, promotes high-helpful.
2. **Reflector / Curator role split** — REM sleep becomes two passes: Reflector (mark recent outcomes against memories consulted) and Curator (apply promote/demote/dedup deltas).
3. **Append-only delta updates** — REM sleep emits a delta log instead of rewriting `core.json` / `long-term.json` in place. Prior knowledge is always recoverable.

**Complexity:** Medium.

**Priority:** Low-Medium. Wait until Level 6 has run ~30 days so we have memory-quality data to validate against.

**Sources:** [ace-agent/ace](https://github.com/ace-agent/ace), [ACE paper](https://arxiv.org/abs/2510.04618)

---

## Rejected

### R-01. Framework-Owned MCP Server (rejected 2026-05-27)

**Idea considered:** Ship an MCP server exposing framework state (queue status, agent memory reads, pattern-hunt results) so Cursor / Claude Code clients could consume framework telemetry as typed tools rather than via CLI.

**Why rejected:**
- The MCP spec is mid-flux — stateless redesign lands 2026-07-28 (Extensions, Tasks, MCP Apps, OAuth-aligned auth, `.well-known` discovery). Building against the current spec means a rewrite in 2 months.
- The CLI surface already works fine for the solo / small-team use case. Cursor and Claude Code can shell out without ceremony.
- Adding MCP doesn't unlock any capability the framework lacks today; it only changes the integration shape.
- Net: complexity high, payoff low under current usage.

**Reconsider when:** A specific Cursor or Claude Code workflow needs framework state surfaced as a typed tool rather than via shell, AND the post-2026-07-28 spec has stabilized.

---

## Cloud scheduler instance (Cloudflare + Postgres) — DEFERRED

**Idea:** Run a subset of the autonomous cycles in the cloud (independent of Bryce's local machine being online), using the existing Cloudflare + Postgres provider.

**Why deferred (not rejected):**
- The cron scripts (`health-check`, `red-team-tester`, `rag-indexer`, `document-sync`, the review cycles) are **local-filesystem Node CLIs** — they read the repo working tree, `tasks/queue/`, agent `memory/`, and write reports into `pm/`. Cloudflare Workers have no filesystem and no repo, so they can't run these as-is.
- Real cloud execution needs a **different architecture**, e.g. one of: (a) a small always-on container/VM (Fly.io/hosted) with the repo checked out, driven by systemd/cron the same way this local install is; (b) a Cloudflare **Cron Trigger** Worker that calls a webhook on the local box (or a queue the local box drains) — keeps compute local, scheduling cloud; (c) port specific checks to a Worker + Postgres (state in PG, not the filesystem) — largest rewrite.
- The local systemd-timer install (`scheduler-install.mjs`) already satisfies "runs while my computer is online" with missed-run catch-up.

**Reconsider when:** Bryce wants cycles to run while the local machine is off, or wants a shared cloud dashboard/state — then pick an architecture above (likely (b): Cloudflare Cron Trigger → durable queue → local drainer, preserving privacy-first local compute).

---

## Automated Hermes drain cron — ✅ IMPLEMENTED (2026-07-05)

Shipped via OpenSpec change `autonomous-drain`. Sandbox-persistence solved with an **isolated local-backend Hermes profile** (`~/.hermes-drain`) that operates on the real host repo while the main assistant stays docker-sandboxed. `agents/hermes-drain.sh` (guards: main-only, clean-tree, cost-gate, PR-cap, single-flight lock) + `agents/drain-prompt.md` (one task/run, branch-only, tests-must-pass, **PR-review gate**, never touches main, no destructive commands) + `sdlc-sched-autonomous-drain` systemd timer (every 15 min). Autonomy bounded by the PR gate; a no-op until the queue has ready work.

---

# Competitive Roadmap 2026

Derived from two evidence-based audits (July 2026): an internal capability inventory and an external competitive analysis (autonomous SWE agents, multi-agent frameworks, coding harnesses, spec-driven tools, agent infra). Structured as OpenSpec change **`competitive-roadmap`** (proposal + design + 5 specs + phased tasks). **Positioning:** we lead on methodology/governance, trail on runtime/infrastructure. Strategy: keep the moat, adopt runtime table-stakes as pluggable **self-hostable, no-OpenAI** adapters, then **fuse** them (benchmark ⇄ pattern-hunt ⇄ maturity) into advantages nobody else has.

Legend: **Parity** = market table-stake we lack · **Advantage** = durable differentiator · complexity S/M/L/XL.

## Where we already lead (protect these)
- **OpenSpec change→archive lifecycle** with mandatory Value Analysis (deeper than Spec Kit / Kiro on change management).
- **5-layer memory + REM-sleep consolidation** (best-in-class vs CrewAI 3-tier / Vertex Memory Bank).
- **Per-agent budget + circuit-breaker + cross-provider free-tier fallback** (most tools only *observe* cost).
- **Tier-5 browser-E2E multi-layer validation** (research→critique→code→statistics→browser).
- **pattern-hunt + monotonic defeat tests + 7-level maturity** — self-improvement *primitives* no competitor has (but see H1: make them enforce).

## Phase 0 — Internal hardening (make our claims true; do first)
Fixes from the internal audit. These make the quality gates *bite* so the autonomous drain's PRs are trustworthy.
- **H1 — Gates that enforce** (M): `review-hook` can `fail` not just warn; `pattern-hunt` generic path stops emitting always-passing tests (`pattern-hunt.mjs:776` TODO); `alignment-monitor` score from real signals not magic numbers; `schema-validator` fails closed without Ajv.
- **H2 — CI runs the whole suite** (S): today CI runs only 2 of ~22 test files; wire `agents/__tests__/*` + `tests/*` + four-layer + test-behavior into `.github/workflows` + `npm test`.
- **H3 — Exact-accounting groundwork** (S/M): realized provider tokens replace `chars/4`; feeds P4.
- **H4 — Latent-bug sweep** (M): `autonomous-launcher.sh` EXIT_CODE captures `tee` not the agent; `daily-review.mjs` dead `fs`/`path` blocks (silent ReferenceError); `logCapabilityUsage(object)` misuse; add `__isMainModule` guards (ast-analyzer, version-snapshot, migrate-memory, rem-sleep, garden-roadmap, alignment-monitor); `semantic-index` stdin fix + real cosine fallback.
- **H5 — No-OpenAI default catalog** (S): rebuild `model-intel.default.json` around the OpenRouter/qwen/deepseek ladder; gate `openai`/`azure-openai` adapters behind opt-in (they contradict the no-OpenAI policy).
- **H6 — Doc/model drift** (S): unify 6-level (`docs/levels/`) vs 7-level (`framework/maturity-model.md`) ladders; `validation-patterns.md` → 5 layers; add one competitive matrix to `docs/comparison.md`.
- **H7 — De-couple hardcoded bindings** (S): `seed-queue-from-openspec.mjs` (LinguaFlow agent names) + `paperclip-sync.mjs` (stale model IDs) read config.
- **H8 — Cover the untested** (S): `capability-monitor.mjs` shipped without tests.

## Phase 1 — Runtime foundation (parity floor)
- **P1 — Sandbox-Execution Adapter** (Parity, M): pluggable `{create,exec,writeFiles,snapshot,fork,destroy}`; `local-worktree` default + self-host microVM (microsandbox/libkrun). *#1 gap — every serious autonomous product isolates runs; also unblocks P6.* Sources: E2B/Firecracker, Daytona, Modal, Claude Code sandbox (open-sourced 2025-10).
- **P3 — OpenTelemetry Tracing Adapter** (Parity, M): `gen_ai.*` semconv spans → file (default) / self-host **Langfuse (MIT)**. Merge with in-flight `cost-tracker-otel`. *Observability is table-stakes; we have file logs only.*
- **P4 — Exact Cost/Token Accounting** (Parity, S/M): provider-reported usage + `$` from `model-intel.json`; turns our self-admitted "approximate budget" into a strength (our circuit-breaker is a real differentiator only on exact numbers).

## Phase 2 — Safety & measurement
- **P5 — Guardrails & Least-Privilege Layer** (Parity, M/L): pre-tool-call injection scan (Llama Guard / dual-LLM / CaMeL capability control — all self-hostable), MCP-tool allowlist, mapped to the **OWASP Agentic Top 10** (ASI01 Goal Hijack … ASI06 Memory Poisoning … ASI10 Rogue Agents, launched 2025-12). *Mission-critical given headless autonomy + privacy-first.*
- **P2 — Eval & Benchmark Harness** (Parity→Advantage, L): runner for **SWE-bench Pro / Lite / Terminal-Bench** (SWE-bench Verified is **deprecated/saturated** — OpenAI stopped reporting it) + an internal regression set; runs through P1, records cost (P4) + trace (P3). *We have no objective quality measure; this becomes a moat when wired to P9.*

## Phase 3 — Advantage plays
- **P6 — Deterministic-Replay Parallel Attempts** (Advantage, L/XL): fork the sandbox (P1) to run N candidate fixes; the mandatory test-gate keeps the winner (Morph-Infinibranch-style, <250ms VM fork). *Fuses our unique test-gate with a technique almost nobody productizes.*
- **P9 — Self-Improvement Flywheel** (Advantage, L): eval regressions (P2) → real defeat tests (needs H1) → maturity transitions on **measured** deltas; agent-quality-over-time as a graph. **The single most defensible move — no competitor can prove their agents improve.**
- **P7 — MCP Server + A2A Agent Cards** (Parity→Advantage, M): expose our queue/agents over MCP; publish A2A agent cards at `/.well-known/agent-card.json` (Linux-Foundation A2A v1.0). *Ends the "requires Claude Code; not portable" limitation.* (Heed R-01: target the stabilized post-2026 MCP spec.)

## Phase 4 — Workflow depth
- **P8 — PR-Native Workflow + Autonomous PR Review** (Parity, M): issue→branch→draft-PR per task (generalize the `autonomous-drain` flow); reviewer agent posts inline PR comments (BugBot-style) gated on CI (needs H2). *Teams expect the PR as the unit of agent work.*
- **P10 — Codebase RAG + Auto-Wiki** (Parity, L): extend `rag-indexer` to index **code** (local embeddings, privacy-first) + a cited architecture wiki (Devin Search/Wiki analog). *Our RAG is over memory, not the codebase.*
- **P11 — Spec Registry + Enforced Constitution** (Advantage, M): a checked `constitution.md` of non-negotiables (Spec Kit / Kiro-steering analog) + a local dependency-spec registry (Tessl analog) to curb hallucinated APIs. *Extends our strongest surface past the peers.*

## Sequencing
`H1→H2→H4→H5` (trustworthy gates) → `P1→P3→P4` (safety+truth floor) → `P5 ‖ P2` → `P6→P9→P7` (advantage) → `P8→P10→P11`. Parity floor + hardening before advantage plays (P6 needs P1; P9 needs P2+H1). Each module = its own child OpenSpec change → seeds `tasks/queue/` → the autonomous drain works it into a review PR.

## Confidence
Well-corroborated: sandbox/eval/observability/interop/spec-tool mechanics + the SWE-bench-Verified deprecation + MCP/A2A Linux-Foundation consolidation + OWASP Agentic Top 10. Directional (vendor/third-party, postdates records): specific mid-2026 leaderboard numbers and newest model names. Full sourced analysis retained in the change's research provenance.
