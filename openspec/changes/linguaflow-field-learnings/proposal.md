## Why

The agentic-sdlc framework has been battle-tested through LinguaFlow — a real multi-agent project with 20 agents, 6,900+ tests, and 6 months of autonomous operation. During that time, significant operational patterns emerged that the generic framework doesn't yet capture: a 17-day cascade stall revealed single-heartbeat fragility, approved code review exceptions normalized into anti-patterns, manual deploys bypassed safety gates, and stale openspec queues caused orchestration confusion. Simultaneously, positive patterns evolved organically — severity-graded failure documentation, shrinking-allowlist defeat tests, DRY agent prompts via shared protocols, autonomous oversight crons, and formalized escalation chains.

Beyond the field learnings, two structural gaps have become clear:

1. **The framework is too coupled to specific platforms.** References to Paperclip are hardcoded throughout CLAUDE.md, scripts, and templates. The agentic-sdlc should be plug-and-play — swap in any orchestration platform (Paperclip, LangGraph, CrewAI, raw Claude Code, OpenAI Agents SDK, custom) and any LLM provider (Anthropic, Groq, local models, future providers) without rewriting the methodology. The SDLC defines the *process*; adapters connect it to *platforms*.

2. **No agent manages token budgets and model selection dynamically.** When agents exhaust their token budgets, they silently stall. There's no mechanism to detect this in real-time, switch an agent to a cheaper/available model, or track which model+agent+task-type combinations produce the best outcomes. A dedicated **Token & Model Manager** agent should continuously monitor utilization, perform live model swaps based on availability and budget, and build a performance ledger that correlates model/agent/config combinations with success/failure rates — enabling data-driven model selection over time.

These field-proven patterns and architectural improvements should flow back into the framework so every new project starts with them instead of rediscovering them through pain.

## Value Analysis

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| User Value | 10/10 | Every new SDLC project avoids 6 months of rediscovery; model-agnostic design unlocks non-Anthropic and mixed-model teams |
| Complexity | 6/10 | Field learnings are mostly documentation + templates; adapter layer and model manager require new architecture |
| Risk | 3/10 | Adapter layer is a refactor of existing coupling; field learnings are additive only |
| Urgency | 8/10 | LinguaFlow is the only field deployment; learnings are fresh; platform lock-in hardens with every new project |

## What Changes

### A. Platform-Agnostic Adapter Layer

- **Orchestration adapter interface**: Define a standard interface that the SDLC uses for agent orchestration (create task, assign agent, update status, query inbox, heartbeat). Ship adapters for: `paperclip`, `claude-code-native` (raw Claude Code subagents), `file-based` (JSON task files only, no external platform). Projects pick their adapter in `project.json` — all SDLC scripts call the interface, never the platform directly.
- **LLM provider adapter interface**: Define a standard interface for model invocation (complete, estimate tokens, check availability, get pricing). Ship adapters for: `anthropic` (Claude), `groq`, `ollama` (local models). `budget.json` maps agents to provider+model pairs instead of hardcoded model names. New providers = new adapter file, zero script changes.
- **Abstract platform coupling**: Scripts that currently call Paperclip directly gain an adapter indirection layer. `paperclip-sync.mjs` stays as-is (it's the Paperclip adapter) but scripts like `queue-drainer.mjs` and `worker.mjs` call the orchestration interface, which routes to Paperclip when configured. In non-Paperclip environments, the same scripts work with the `file-based` or `claude-code-native` adapter — no Paperclip required, no Paperclip broken.
- **Adapter discovery and registration**: `setup.mjs` asks which orchestration platform and LLM providers to use. Stores choices in `project.json`. Scripts load adapters dynamically via `load-adapter.mjs`.

### B. Token & Model Manager Agent

- **New agent role: `model-manager`**: A dedicated agent (runs on cron or heartbeat) that:
  1. **Monitors token utilization** in real-time by reading `cost-tracker.mjs` data — flags agents approaching budget limits (80%, 90%, 100%)
  2. **Performs live model swaps** — when an agent hits its token ceiling on one provider, the model-manager reassigns it to a cheaper or available model via the LLM adapter interface (e.g., opus → sonnet → haiku, or anthropic → groq → ollama fallback chain)
  3. **Maintains a performance ledger** (`pm/model-performance.jsonl`) — logs every task completion with: agent, model, provider, task type, token count, success/failure, test pass rate, duration, first-attempt success. Over time this builds a dataset of which configurations work best.
  4. **Recommends optimal model assignments** — analyzes the performance ledger to suggest model changes (e.g., "Roy on sonnet has 95% first-attempt success on simple fixes — no need for opus" or "Moss on haiku fails 40% of AI tasks — recommend sonnet minimum")
  5. **Enforces fallback chains** — `budget.json` gains a `fallbackChain` per agent (e.g., `["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"]`) that the model-manager walks when primary model budget is exhausted
  6. **Emits alerts** via the notification system when: model swaps occur, budget exhaustion forces downgrade, performance degrades after swap, or no fallback models remain

- **Performance ledger schema**: Each entry captures agent, model, provider, taskId, taskType, tokensUsed, success (bool), testsPassed, duration, timestamp. Queryable by `model-manager.mjs report` for aggregated stats.

- **Budget.json evolution**: Agents gain `provider`, `fallbackChain`, and `modelPreferences` (per task-type overrides) fields alongside existing `model` and `dailyTokens`.

### C. From Positive Field Patterns

- **Failure severity taxonomy**: Formalize F-xxx failure IDs in core.json with severity levels (critical/high/medium) that map to response mechanisms — critical triggers immediate rule changes, high updates checklists, medium adds watch-patterns. Update `core.json.template` and document the taxonomy.
- **Shrinking allowlist defeat tests**: Add defeat test pattern where pre-existing violations get an allowlist that NEVER grows — new violations fail the build, fixed violations shrink the list. Visible debt tracking. Update `four-layer-validate.mjs` and add template.
- **SHARED_PROTOCOL.md pattern**: Add template and setup.mjs support for extracting common agent instructions (memory protocol, heartbeat procedure, communication standards, quality gates) into a single shared file. Reduces per-agent token cost by ~70 tokens.
- **Autonomous oversight crons**: Document and template the essential cron jobs proven in production — backlog review, openspec sync, REM sleep weekly, cost report daily, model-manager health check. Update `cron-schedule.json.template`.
- **Escalation chain formalization**: Add escalation protocol template: peer → domain lead → CTO → CEO → Board, with status transitions (`blocked` + tag) and timeout-based auto-escalation. Platform-agnostic (works via orchestration adapter).
- **No-questions mode**: Document the pattern where agents resolve ambiguity independently and record clarifications as core memory patterns rather than blocking on questions. Add to AGENT.md.template.

### D. From Failure Patterns (Preventive)

- **Redundant heartbeat requirement**: Document that projects MUST have 2+ agents with active heartbeats to avoid single-point-of-failure cascade (learned from 17-day stall). Add validation to `setup.mjs`.
- **Budget auto-scaling trigger**: When any agent hits 90%+ token utilization, the model-manager auto-downgrades to fallback model instead of silently starving. If no fallback available, emit alert via notification adapter.
- **Exception normalization guard**: Add to reviewer checklist template — approved exceptions MUST be time-boxed or logged as tech debt with expiry. One-time approvals must not become permanent patterns. Hard-block, never soft-suggest.
- **Pipeline-only deploy rule**: Add explicit anti-pattern documentation — NEVER bypass the deploy pipeline with manual commands. Post-export fixups and platform-specific corrections only run in the automated pipeline. Template the deploy gate.
- **Stale openspec hygiene**: Add openspec queue health check to `daily-review.mjs` — flag changes stuck in proposal/design >14 days, flag shipped changes not yet archived >7 days.
- **Doc-as-code rule**: Documentation updates for changed APIs/signatures are part of the SAME task, not follow-on work. Add to AGENT.md.template non-negotiable rules and reviewer checklist.
- **Merge safety rule**: Clean git merge != safe merge. Full test suite MUST run against merged state before deploy. Add to release agent checklist template.

## Capabilities

### New Capabilities
- `adapter-layer`: Platform-agnostic orchestration and LLM provider adapter interfaces with pluggable implementations (paperclip, claude-code-native, file-based; anthropic, groq, ollama)
- `model-manager-agent`: Dedicated agent for real-time token monitoring, live model swaps, performance ledger, and data-driven model recommendations
- `failure-severity-taxonomy`: Severity-graded failure documentation system (F-xxx IDs, critical/high/medium response mapping)
- `shrinking-allowlist-defeats`: Defeat test pattern with pre-existing violation allowlists that only shrink
- `shared-protocol-pattern`: DRY agent prompt extraction into SHARED_PROTOCOL.md with setup.mjs support
- `autonomous-oversight-crons`: Template and documentation for essential production cron jobs including model-manager
- `escalation-chain`: Formalized multi-tier escalation protocol with timeout-based auto-escalation (platform-agnostic)
- `field-failure-guards`: Preventive patterns from LinguaFlow failures (redundant heartbeats, budget auto-scaling, exception normalization, pipeline-only deploys, openspec hygiene, doc-as-code, merge safety)

### Modified Capabilities
<!-- No existing specs to modify — all new capabilities -->

## Impact

- **New directory**: `agents/adapters/` — adapter implementations organized by type
  - `adapters/orchestration/paperclip.mjs`, `adapters/orchestration/claude-code-native.mjs`, `adapters/orchestration/file-based.mjs`
  - `adapters/llm/anthropic.mjs`, `adapters/llm/groq.mjs`, `adapters/llm/ollama.mjs`
  - `adapters/load-adapter.mjs` — dynamic adapter loader
- **New agent**: `agents/templates/model-manager/` — AGENT.md, core.json, capabilities for the model-manager role
- **New script**: `agents/model-manager.mjs` — token monitoring, model swaps, performance ledger, recommendations
- **New data**: `pm/model-performance.jsonl` — performance ledger tracking model+agent+task outcomes
- **Refactored scripts**: `queue-drainer.mjs`, `worker.mjs`, and other scripts that touch orchestration now call adapter interface; `paperclip-sync.mjs` preserved as the Paperclip adapter implementation
- **Evolved config**: `budget.json` gains `provider`, `fallbackChain`, `modelPreferences` per agent; `project.json` gains `orchestration.adapter` and `llm.defaultProvider` fields
- **Templates**: `core.json.template`, `AGENT.md.template`, `checklist.md.template`, `cron-schedule.json.template`, `budget.json.template`, `project.json.template` all updated
- **Scripts**: `four-layer-validate.mjs` (allowlist mode), `cost-tracker.mjs` (feeds model-manager), `daily-review.mjs` (openspec hygiene + model health), `setup.mjs` (adapter selection, shared protocol scaffolding, heartbeat validation)
- **Documentation**: `framework/maturity-model.md` (field-proven checklist items), `docs/safety-mechanisms.md` (new guards), `docs/troubleshooting.md` (17-day stall recovery playbook), `docs/adapter-guide.md` (how to write custom adapters)
- **New template files**: `agents/templates/SHARED_PROTOCOL.md.template`, `agents/templates/escalation-protocol.md.template`, `agents/templates/defeat-allowlist.json.template`
- **Migration path**: Existing projects using Paperclip continue working — `paperclip` adapter is the default for projects that already have `.paperclip.env`. New projects choose their adapter at setup time.
