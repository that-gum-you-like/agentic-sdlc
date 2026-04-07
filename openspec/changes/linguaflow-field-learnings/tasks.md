## 1. Adapter Infrastructure

- [x] 1.1 Create `agents/adapters/` directory structure: `orchestration/`, `llm/`, `load-adapter.mjs`
- [x] 1.2 Implement `load-adapter.mjs` — reads `project.json` for `orchestration.adapter` and `llm.defaultProvider`, dynamically imports the matching adapter module, returns `file-based`/`anthropic` as defaults when fields are absent
- [x] 1.3 Define orchestration adapter interface contract in `agents/adapters/orchestration/interface.md` — document `createTask`, `updateTaskStatus`, `queryTasks`, `claimTask`, `getAgentInbox`, `syncConfig` with parameter types and return shapes
- [x] 1.4 Implement `agents/adapters/orchestration/file-based.mjs` — wrap existing `tasks/queue/*.json` read/write logic from `queue-drainer.mjs` into the adapter interface
- [x] 1.5 Implement `agents/adapters/orchestration/paperclip.mjs` — extract Paperclip API logic from `paperclip-sync.mjs` into the adapter interface; `paperclip-sync.mjs` becomes a CLI wrapper calling this adapter
- [x] 1.6 Implement `agents/adapters/orchestration/claude-code-native.mjs` — adapter that spawns Claude Code Agent tool subagents with task context as prompts
- [x] 1.7 Define LLM provider adapter interface contract in `agents/adapters/llm/interface.md` — document `complete`, `estimateTokens`, `checkAvailability`, `getModelInfo`, `listModels`
- [x] 1.8 Implement `agents/adapters/llm/anthropic.mjs` — Claude API via `ANTHROPIC_API_KEY`
- [x] 1.9 Implement `agents/adapters/llm/groq.mjs` — Groq API via `GROQ_API_KEY`
- [x] 1.10 Implement `agents/adapters/llm/ollama.mjs` — local Ollama HTTP API at `http://localhost:11434`
- [x] 1.11 Update `queue-drainer.mjs` to use orchestration adapter via `load-adapter.mjs` instead of direct file operations (preserve backward compatibility — existing behavior unchanged when adapter is `file-based`)
- [x] 1.12 Update `worker.mjs` to use LLM adapter via `load-adapter.mjs` and read `activeModel` from `budget.json`

## 2. Budget.json Evolution

- [x] 2.1 Update `agents/templates/budget.json.template` to include new fields: `provider`, `fallbackChain`, `activeModel`, `modelPreferences` with documentation comments
- [x] 2.2 Update `load-config.mjs` to normalize old-format `budget.json` on read — map shorthand model names (`sonnet`, `opus`, `haiku`) to full IDs, apply defaults for missing fields (`provider: "anthropic"`, `fallbackChain: [model]`, `activeModel: null`, `modelPreferences: {}`)
- [x] 2.3 Update `setup.mjs` to prompt for orchestration adapter choice (file-based/paperclip/claude-code-native) and LLM providers (anthropic/groq/ollama), store selections in `project.json`

## 3. Model Manager Agent

- [x] 3.1 Create `agents/templates/model-manager/AGENT.md` — system prompt defining identity, domain (token monitoring + model assignment + performance tracking), operating rules, cron-based execution
- [x] 3.2 Create `agents/templates/model-manager/core.json.template` — initial core memory with values, non-negotiable rules, empty failures array
- [x] 3.3 Add `model-manager` to `agents/templates/capabilities.json.template` with required capabilities: `costTracking`, `budgetMonitoring`, `modelSwap`, `performanceLedger`
- [x] 3.4 Implement `agents/model-manager.mjs` subcommand `check` — read cost-tracker utilization data, identify agents at 80%/90%/100% thresholds, perform model swaps by writing `activeModel` to `budget.json`, log events to performance ledger, send notifications via `notify.mjs`
- [x] 3.5 Implement `agents/model-manager.mjs` subcommand `report` — aggregate `pm/model-performance.jsonl` by agent × model, output: task count, success rate, avg tokens/task, first-attempt rate
- [x] 3.6 Implement `agents/model-manager.mjs` subcommand `recommend` — analyze performance ledger, identify agents succeeding on cheaper models (90%+ over 10+ tasks → suggest downgrade) and agents failing on current model (<70% over 5+ tasks → suggest upgrade), output with confidence levels
- [x] 3.7 Implement `agents/model-manager.mjs` subcommand `reset` — clear all `activeModel` values in `budget.json` (daily budget reset)
- [x] 3.8 Implement performance ledger write hook in `queue-drainer.mjs` — on task completion, append entry to `pm/model-performance.jsonl` with: ts, agent, model, provider, taskId, taskType, tokensUsed, success, testsPassed, duration, firstAttempt
- [x] 3.9 Update `worker.mjs` to check `activeModel` and `modelPreferences[taskType]` before spawning agent — `activeModel` overrides `modelPreferences` which overrides `model`

## 4. Field Learnings: Templates & Documentation

- [x] 4.1 Create `agents/templates/SHARED_PROTOCOL.md.template` — memory protocol (read before/write after), heartbeat procedure (8 steps), communication standards (commit format, channel posting, co-author line), quality gates (tests, review, spec match, docs), escalation protocol reference
- [x] 4.2 Update `agents/templates/AGENT.md.template` — replace inline memory/heartbeat/communication/quality sections with single-line reference to `agents/SHARED_PROTOCOL.md`; add no-questions mode to operating rules; add doc-as-code to non-negotiable rules; add pipeline-only deploy to release agent variant
- [x] 4.3 Update `agents/templates/core.json.template` — add failure schema with `id`, `date`, `severity` (critical/high/medium), `description`, `lesson`, `ruleAdded` fields; add documentation comments explaining severity → response mapping
- [x] 4.4 Update `agents/templates/checklist.md.template` — add items: exception normalization guard ("approved exceptions MUST be time-boxed"), merge safety ("run full test suite against merged state"), doc-as-code ("API changes require doc updates in same commit"), stale allowlist check
- [x] 4.5 Create `agents/templates/escalation-protocol.md.template` — 5-tier escalation (peer → domain lead → CTO → CEO → Board), timeout thresholds per tier (30min/2h/4h/8h/24h), infrastructure fast-track to Board, platform-agnostic (uses notification adapter)
- [x] 4.6 Create `agents/templates/defeat-allowlist.json.template` — schema with violation categories (any-type, console-log, file-size, missing-error-handling, hardcoded-values) each initialized to empty arrays, with header comments explaining the never-grow rule
- [x] 4.7 Update `setup.mjs` to scaffold `agents/SHARED_PROTOCOL.md` from template, scaffold `defeat-allowlist.json`, and validate 2+ agents have heartbeats/crons (warn if only 1)

## 5. Script Enhancements

- [x] 5.1 Add `--allowlist <file>` flag to `four-layer-validate.mjs` — load allowlist JSON, skip known violations, fail on new violations, support `--update` flag to auto-shrink allowlist when violations are fixed
- [x] 5.2 Update `daily-review.mjs` — add openspec hygiene check: scan `openspec/changes/*/status.json`, flag changes in proposal/design >14 days, flag shipped changes not archived >7 days; add model-manager health summary if `pm/model-performance.jsonl` exists
- [x] 5.3 Update `cost-tracker.mjs` — when model-manager is not configured, emit notification via `notify.mjs` when any agent reaches 90% budget (existing behavior: silent)
- [x] 5.4 Update `cron-schedule.json.template` — add 5 essential crons: backlog review (daily 9AM), openspec sync (every 6h), REM sleep (Sunday 23:00), cost report (daily 6AM), model-manager check (every 15min); all commands use `node ~/agentic-sdlc/agents/<script>.mjs`, no platform-specific invocations
- [x] 5.5 Add escalation tracking to task JSON schema — `blockedBy` field supports `{ "reason", "tier", "escalatedAt", "history" }`; update `queue-drainer.mjs status` to show escalation info for blocked tasks

## 6. Documentation Updates

- [x] 6.1 Update `CLAUDE.md` — make platform-neutral: Paperclip mentioned as one adapter option under a "Paperclip Adapter" subsection rather than throughout; add "Adapter Configuration" section; add model-manager to script reference table; add performance ledger to data files section
- [x] 6.2 Update `docs/safety-mechanisms.md` — add: redundant heartbeat requirement, budget exhaustion auto-response (model-manager or cost-tracker fallback), exception normalization guard, stale openspec hygiene
- [x] 6.3 Update `framework/maturity-model.md` — add field-proven checklist items: Level 4 gains shrinking allowlist defeats + failure severity taxonomy; Level 5 gains model-manager + performance ledger; Level 6 gains data-driven model recommendations
- [x] 6.4 Add `docs/adapter-guide.md` — how to write a custom orchestration or LLM adapter: interface contract, file naming convention, registration in load-adapter.mjs, testing approach
- [x] 6.5 Add `docs/troubleshooting.md` section — "17-day stall recovery playbook": symptoms (no commits, agents idle, stale locks), diagnosis steps (check heartbeats, check budgets, check locks), recovery (enable redundant heartbeats, expand budgets, release locks, decompose backlog)
- [x] 6.6 Update `docs/agent-system.md` — add model-manager role description, performance ledger concept, fallback chain explanation

## 7. Testing & Validation

- [x] 7.1 Add behavior test cases to `test-behavior.mjs` for model-manager agent prompt quality (domain boundaries, no code execution claims, performance tracking language)
- [x] 7.2 Write unit tests for `load-adapter.mjs` — default fallback, explicit adapter selection, missing adapter error
- [x] 7.3 Write unit tests for `model-manager.mjs check` — threshold detection at 80/90/100%, fallback chain walking, budget-exhausted state when no fallbacks remain
- [x] 7.4 Write unit tests for `model-manager.mjs recommend` — downgrade recommendation on high success rate, upgrade recommendation on low success rate, confidence levels based on sample size
- [x] 7.5 Write unit tests for `four-layer-validate.mjs --allowlist` — new violation fails, allowlisted violation passes, `--update` shrinks allowlist
- [x] 7.6 Write unit tests for budget.json normalization in `load-config.mjs` — old format maps correctly, new format passes through, missing fields get defaults
- [x] 7.7 Integration test: model-manager detects 90% utilization → writes activeModel → worker reads activeModel → spawns with correct model
