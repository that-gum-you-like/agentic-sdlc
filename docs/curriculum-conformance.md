# Curriculum Conformance — Multiverse School "Agentic SDLC"

**Date**: 2026-07-30 (reconciled) · **Status**: ✅ **All Level-6 gaps closed** (PRs #20–#28), re-verified on disk 2026-07-30. Maturity `maturity-assess.mjs` = 4.5/5.0 (Leading). Living document — update as new gaps surface, and note that `tests/curriculum-conformance.test.mjs` now fails the suite if this document's claims and the filesystem disagree.

> **Level-6 (Self-Improving) reached (2026-07-06):** the nine remaining gaps are merged — behavior baselines+drift (#21), external-input injection screening (#22), error-dedup (#23), semantic near-miss analyzer / Layer 2.5 (#24), silent-fallback scan (#25), Playwright user-test runner (#28), improvement-loop TEACH wiring (#26), monthly-cycle completeness (#27), assume-compromise posture (#27). All integrated into existing components (four-layer, test-behavior, pattern-hunt, red-team-tester, cycles) and running on the **Hermes + OpenRouter** affordable stack — no Claude API, no OpenAI; deterministic gates stay deterministic.

The authoritative definition of "complete/mature" for this framework is the
Multiverse School Agentic SDLC curriculum (the material this framework was
built from; mirrored in `framework/lesson-plan.md`). This document maps every
curriculum capability to its implementing file(s) and an honest status:

- **Solid** — implemented and tested; matches the curriculum's intent
- **Partial** — exists but a specific piece is missing (the piece is named)
- **Missing** — not implemented (extend an existing owner; never build a parallel system)

Maturity ladder: Levels 0–6 (`framework/maturity-model.md` is canonical).
> Naming note — RESOLVED 2026-07-06 (change `curriculum-l4-naming`): per Bryce's
> directive the repo now names L4 "Autonomous", exactly matching the curriculum
> ladder (Manual → Assisted → Automated → Orchestrated → Autonomous → Evolving →
> Self-Improving). Content unchanged: the quality gates ARE what make L4
> autonomy safe.

---

## Phase 1 — Foundation (Hour 1)

| Capability | Status | Owner |
|-----------|--------|-------|
| Brain dump → OpenSpec proposal flow | Solid | `openspec/templates/braindump.md.template`, `proposal.md.template` |
| Value Analysis required in every proposal | Solid | `proposal.md.template` (§ Value Analysis), enforced by `/openspec-*` skills |
| Phased tasks.md + status.json | Solid | `openspec/templates/tasks.md.template`, `status.json.template` |
| Archive of completed changes | Solid | `openspec/changes/archive/` (dozens of dated changes) |
| Cross-feature conflict check | Solid | `agents/cross-feature-analyze.mjs` → `pm/cross-feature-report.md` |

## Phase 2 — Automation (Hour 2)

| Capability | Status | Owner |
|-----------|--------|-------|
| Headless autonomous mode | Solid | `agents/autonomous-launcher.sh` (exit code fixed in H-004); `agents/hermes-drain.sh` (Hermes + OpenRouter ladder, dedicated clone) |
| File-based task coordination | Solid | `tasks/queue/` + `tasks/completed/`, `agents/queue-drainer.mjs`, `agents/adapters/orchestration/file-based.mjs` |
| Testing tiers: unit/integration/E2E/front-end E2E | Solid | `framework/validation-patterns.md` (5 layers), CLAUDE.md micro cycle step 6 (browser E2E required for frontend changes) |
| **Pre-commit hooks (test/lint/typecheck)** | **Solid (new)** | `agents/review-hook.mjs install` now wires an ENFORCING pre-commit gate (blocks secrets/silent-failures on staged diffs) + advisory post-commit (PR #17). Projects add their test/lint commands to the same hook as desired |
| Execution cadence / scheduling | Solid | `agents/scheduler-install.mjs` + `agents/templates/cron-schedule.json.template` (15 schedules: daily/weekly/monthly + drain + auto-review) |
| MCP servers | Partial | Consumed via OpenClaw MCP tools + Azure Foundry MCP connector (`docs/azure-foundry-integration.md`); no in-repo MCP server (deliberately out of scope — competitive-roadmap P7 was cancelled per Bryce's directive) |

## Phase 3 — Orchestration (Hour 3)

| Capability | Status | Owner |
|-----------|--------|-------|
| Small-files/small-commits style guide | Solid | CLAUDE.md rule 5; enforced in `code-reviewer.md` template + four-layer Layer 2 |
| Specialist agents (name/character/prompt/tools/scope) | Solid | 22 execution + 5 planning templates in `agents/templates/`; `AGENT.md.template`; 3 live agents |
| Queue drainer | Solid | `agents/queue-drainer.mjs` (priority CRITICAL→LOW, claims, stale detection, token estimates) |
| Agent comms: Matrix + files | Solid | `agents/matrix-client/matrix-cli.mjs` (schema-validated), `agents/mailbox-sync.mjs` |
| Turn-based cycles | Solid | 30-min stale-claim windows; cadence config in `project.json` |

## Phase 4 — Release Management & Scale (Hour 4)

| Capability | Status | Owner |
|-----------|--------|-------|
| Priority queue + claim system + token estimates | Solid | `agents/queue-drainer.mjs` |
| Release-manager agent | Solid | `agents/templates/execution-agents/release-manager.md` (merge sequencing, conflict flagging, changelog) |
| Parallelize-vs-serialize discipline | Solid | `framework/parallelization-guide.md`; CLAUDE.md rule 6 |
| PM Dashboard | Solid | `agents/cycles/daily-review.mjs` → `pm/DASHBOARD.md` |
| Review agent | Solid | `code-reviewer.md` template + `agents/review-hook.mjs` + `agents/pr-auto-review.mjs` |
| Documentation agent | Solid | `documentarian.md` template + live `sdlc-documentarian` |

## Phase 5 — Anti-Pattern Detection / Quality (Hour 5)

| Capability | Status | Owner |
|-----------|--------|-------|
| Named anti-pattern vocabulary | Solid | CLAUDE.md rule 7; reviewer templates |
| Senior-dev checklist that GROWS | Solid | `agents/templates/checklist.md.template` + `appendToChecklist()` in pattern-hunt.mjs appends one-line checklist items idempotently when recurring patterns are confirmed under `## Auto-added by pattern-hunt`. Tested via `agents/__tests__/checklist-growth.test.mjs` (append, idempotency, no-op, dry-run) |
| **Senior review that can BLOCK (not just warn)** | **Solid (new)** | `agents/review-hook.mjs`: enforcing pre-commit `check-staged` exits 1 on blocking violations — a real git commit is blocked (proven in `agents/__tests__/gates-enforce.test.mjs`); required CI check runs the whole suite (H-001); `agents/pr-auto-review.mjs` gates merges (clean-worktree tests + scope scan + OpenRouter LLM review) |
| Static analysis: AST | Solid | `agents/ast-analyzer.mjs` (TS compiler API: unused exports, cycles, dead code; import-guarded since H-004) |
| Static analysis: lint/typecheck | Partial | Runs via project-configured `testCmd`/CI; no framework-owned lint runner (projects bring their own) |
| **spaCy semantic near-miss analyzer** (`fullName` vs `full_name`) | Solid | `agents/nlp-analyzer.mjs` (+ `agents/nlp-analyze.py` optional spaCy path, `agents/requirements-nlp.txt` venv) wired as four-layer **Layer 2.5** (`four-layer-validate.mjs`); zero-dep JS identifier-token fallback when spaCy is absent (PR #24) |
| Fallback-pattern regex (`.get(x, 0)` silent fallback) | Solid | four-layer **Layer 3** emits `[silent-fallback]` for computed-value-defaulted-to-0 (`|| 0` / `?? 0`) and empty-default catches, alongside the pre-existing empty-catch/error-swallow detectors (PR #25) |
| **Prompt-injection filtering of EXTERNAL input** | Solid | `red-team-tester.screenExternalInput(text, {source})` exported and wired into the ingestion points (`mailbox-sync.mjs`); screening outcomes logged via `logCapabilityUsage('injectionScreen', …)` (PR #22) |
| **Error deduplication (hash signature)** | Solid | `notify.mjs errorSignature()` + suppression window, ledger at `pm/error-signatures.json`; duplicate triggers are suppressed with a seen-count (PR #23) |
| Security reviewer agent | Partial | `security-engineer.md` + `dependency-auditor.md` templates; `pr-auto-review` hard-rejects secret paths; review-hook pre-commit blocks staged secrets. No executable bandit/npm-audit/gitleaks runner (framework itself has zero deps = zero npm attack surface) |
| "Assume compromise" posture | Solid | `docs/safety-mechanisms.md` §15 — no deploy keys on the box, scoped tokens/short leashes, `.env`/`secrets/` hard-reject in the PR pipeline and pre-commit gate, least-privilege tiers (§10) and approval gates (§6) (PR #27) |

## Phase 6 — Agent Memory & Evolution (Hour 6)

| Capability | Status | Owner |
|-----------|--------|-------|
| 5-layer memory (core/long-term/medium-term/recent/compost) | Solid | `agents/memory-manager.mjs`, per-agent `memory/*.json` |
| Failure → core-memory self-correction | Solid | CLAUDE.md rule 8; `core.json.template` failure memories; memory protocol |
| REM sleep consolidation | Solid | `agents/rem-sleep.mjs` (weekly timer; similarity dedup; import-guarded since H-004) |
| Character sheets | Solid | `AGENT.md.template` + versioned AGENT.md convention |
| Four-layer validation (research→critique→code→statistics) | Solid | `agents/four-layer-validate.mjs` (+ Layer 5 browser verification; runs in npm test + CI) |
| Structured handoff templates | Solid | `agents/templates/handoff-template.md` |
| Agent versioning + memory migration + rollback | Solid | `agents/version-snapshot.mjs` (snapshot/list/restore), `agents/migrate-memory.mjs` (--check/--apply) |
| When to create new agents | Solid | `framework/agent-lifecycle.md` |

## Phase 7 — Continuous Improvement / Mastery (Hour 7)

| Capability | Status | Owner |
|-----------|--------|-------|
| Pattern hunt | Solid (fixed) | `agents/pattern-hunt.mjs`: mines reviews, semantic clustering; the always-passing generic scaffold is GONE — unknown categories surface `needs-detector` (PR #17) |
| Defeat tests | Solid | four-layer Layer 3 + `defeat-allowlist.json` (shrink-only); run in npm test + CI + now blockable pre-commit |
| E2E regression test per fixed bug | Partial | Real per-bug regressions exist (E2BIG, REQ-H4 sweep, maturation) but not the three curriculum case studies (citation/NaN/Math.random — those bugs lived in LinguaFlow, not this repo); `openspec/changes/replay-regression-ci-gate/` still in design. CLOSE: keep the per-bug-regression rule; the replay gate change is the vehicle |
| **Behavior baselines + drift detection (>20% alert)** | Solid | `agents/test-behavior.mjs --baseline` records per-agent metrics, `--drift` compares and exits 1 beyond the >20% relative threshold (PR #21) |
| Improvement loop Find→Defeat→Teach | Solid | Find (`pattern-hunt.mjs` mining + clustering) → Defeat (real detectors, post H-007) → **Teach** (`pattern-hunt.teachAgents()` writes recurring patterns into the responsible agent's memory, logged as `memoryRecord`; reported under `teaching` in the run summary) (PR #26) |
| **Playwright autonomous user-testing w/ screenshots** | Solid | `agents/browser-user-test.mjs` — `generate <change-name>` builds a user-journey spec FROM an OpenSpec proposal (one test per user-story line, per-step screenshot discipline), `run` executes the project's own Playwright and archives screenshots; degrades with a clear message when Playwright isn't installed (PR #28) |
| Cost tracking + conservation + model tiers | Solid | `agents/cost-tracker.mjs` (now capturing provider-reported usage, H-006), `budget.json` OpenRouter ladder, `model-manager.mjs` (80% predictive swap + circuit breaker), conservation mode |
| Agent versioning cycle | Solid | see Phase 6 |

## The Long Game — Operational

| Capability | Status | Owner |
|-----------|--------|-------|
| Micro/Daily/Weekly cycles automated | Solid | micro (queue-drainer/worker), `cycles/daily-review.mjs`, `cycles/weekly-review.mjs` + pattern-hunt/rem-sleep timers |
| Monthly cycle (behavior audit, versioning, compost cleanup, cost review) | Solid | `agents/cycles/monthly-review.mjs` — behavior audit, agent versioning, compost cleanup past the retention window, and 30-day per-agent cost review from the ledger (PR #27) |
| 4-layer Process Stack (pre-commit → post-commit → senior review → human) | Solid (new) | pre-commit enforce (review-hook, PR #17) → post-commit review (review-hook) → senior review (pr-auto-review + CI required check) → human (PM dashboard, approvals, FLAGGED PRs) |
| Cost tracking + conservation + tiers | Solid | see Phase 7; exact-$ rollups intentionally deferred (was P4, cancelled) |
| Maturity docs reconciled to one L0–6 ladder | Solid (new) | H-003 (PR #13): `framework/maturity-model.md` canonical; CLAUDE.md + `docs/levels/` aligned; L4 naming question flagged above |

---

## Hardening + loop-safety shipped this pass (2026-07-06)

| Item | PR |
|------|----|
| H-003 doc/ladder reconciliation + numbered capability matrix | #13 |
| H-004 latent-bug sweep (launcher exit code, daily-review ReferenceErrors, guards, semantic-index stdin + lexical fallback) | #14 |
| H-005 de-coupled hardcoded bindings (domains.json routing; config-driven paperclip-sync) | #15 |
| H-006 realized provider-reported token capture in the cost ledger | #16 |
| H-007 gates that ENFORCE (blocking pre-commit; no always-pass generated tests; fail-closed schema validation; counted alignment score) | #17 |
| H-008 capability-monitor I/O coverage; all tests CI-wired | #18 |
| Autonomous-loop production-safety: review-side dedicated-clone isolation + self-identifying mutex | #19 |

## Level-6 gap list — CLOSED (verified on disk 2026-07-30)

All nine items shipped in PRs #20–#28. This section previously still listed
them as open work, under a heading instructing the reader to close them in
order, three weeks after the code landed — effectively an instruction to
rebuild nine capabilities that already exist. Each was re-verified against the
filesystem before this list was retired:

| # | Gap | Verified owner |
|---|-----|----------------|
| 1 | Behavior baselines + drift detection | `test-behavior.mjs --baseline` / `--drift`, >20% threshold |
| 2 | Prompt-injection screening of external input | `red-team-tester.screenExternalInput()`, wired in `mailbox-sync.mjs` |
| 3 | Error deduplication by signature hash | `notify.mjs errorSignature()` → `pm/error-signatures.json` |
| 4 | Semantic near-miss analyzer | `nlp-analyzer.mjs` + four-layer Layer 2.5 |
| 5 | Silent-default fallback scan | four-layer Layer 3 `[silent-fallback]` detectors |
| 6 | Playwright user-test runner | `agents/browser-user-test.mjs` |
| 7 | Teach wiring | `pattern-hunt.teachAgents()` → agent memory |
| 8 | Monthly cycle completeness | `agents/cycles/monthly-review.mjs` |
| 9 | "Assume compromise" posture | `docs/safety-mechanisms.md` §15 |

**The framework is at Level 6 (Self-Improving) on the authoritative ladder.**
There is no open curriculum gap. `tests/curriculum-conformance.test.mjs` now
guards this document against drifting out of sync with the filesystem again in
either direction — a row marked Missing whose owner exists, or a row marked
Solid whose owner does not, fails the suite.

Beyond the curriculum, the honest remaining weaknesses are dimensional rather
than capability-shaped, and `maturity-assess.mjs` names them: no containerized
release artifact, no configured linter, and a rubric that caps zero-dependency
repos at 4.0/5 on Dependency Health and 4.5/5 on Security Posture (flagged in
the report, deliberately not "corrected" — see `maturity-reconciliation`).

All LLM-invoking pieces run through `loadLlmAdapter(config, 'openrouter')` on the
affordable ladder / Hermes harness — no Claude API, no OpenAI, deterministic
gates stay deterministic.
