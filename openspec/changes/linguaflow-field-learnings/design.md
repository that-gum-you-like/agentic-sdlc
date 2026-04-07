## Context

The agentic-sdlc framework currently has minimal code coupling to Paperclip — only `paperclip-sync.mjs` makes API calls; all other scripts operate on local JSON files. However, CLAUDE.md and templates reference Paperclip extensively, creating a documentation-level hard dependency that makes the framework feel Paperclip-specific. The actual orchestration (`queue-drainer.mjs`, `worker.mjs`) already runs on local task JSON files — this is effectively a `file-based` adapter that exists but isn't named or formalized.

LinguaFlow's 6-month field deployment surfaced 13 operational patterns (6 positive, 7 failure-preventive) that evolved organically in the project but aren't captured in the generic framework. These need to flow back as templates, documentation, and small script enhancements.

The biggest operational gap is budget exhaustion causing silent agent stalls. No mechanism exists to detect this, swap models, or learn which model+agent combinations work best over time.

## Goals / Non-Goals

**Goals:**
- Make the framework usable without Paperclip — `file-based` orchestration works out of the box, Paperclip is an optional adapter
- Introduce an LLM provider abstraction so agents can run on any model from any provider
- Add a model-manager agent that monitors budgets, swaps models on exhaustion, and tracks performance
- Codify all 13 LinguaFlow field learnings into templates and documentation
- Zero breakage for existing Paperclip-based projects

**Non-Goals:**
- Building a full orchestration platform (the SDLC is methodology, not infrastructure)
- Runtime model routing during a single task (model selection happens between tasks)
- Automated agent creation/termination (lifecycle decisions remain human/CTO)
- Replacing Paperclip's heartbeat/issue-tracking capabilities (those stay in Paperclip when used)
- Multi-provider load balancing within a single API call

## Decisions

### D1: Adapter Layer is Thin, Not a Framework

The adapter interfaces are simple function contracts (5-7 methods each), not class hierarchies. Each adapter is a single `.mjs` file exporting named functions. Scripts import `load-adapter.mjs` which reads `project.json` and returns the right module.

**Why:** The existing scripts already work on local files. We're naming and formalizing what exists, not rebuilding. Heavy adapter frameworks (like ORM-style abstractions) add complexity without value here.

**Alternatives considered:**
- Class-based adapter with inheritance → rejected: over-engineering for 5 methods
- Plugin discovery via `node_modules` → rejected: framework is file-based, not npm-based

### D2: Orchestration Adapter Interface

```
createTask(task) → taskId
updateTaskStatus(taskId, status, meta) → void
queryTasks(filter) → task[]
claimTask(taskId, agentName) → bool
getAgentInbox(agentName) → task[]
syncConfig(sdlcConfig) → drift[]
```

Three implementations:
- **`file-based`** (default) — reads/writes `tasks/queue/*.json` directly. This is what `queue-drainer.mjs` already does. Zero external dependencies.
- **`paperclip`** — wraps `paperclip-sync.mjs` API calls. Reads `.paperclip.env`. Used when Paperclip is configured.
- **`claude-code-native`** — uses Claude Code's Agent tool to spawn subagents. Tasks become agent prompts. Useful for single-developer setups without Paperclip.

**Why `file-based` is default:** It's what every script already uses internally. Paperclip is the optional upgrade, not the baseline.

### D3: LLM Provider Adapter Interface

```
complete(prompt, options) → response
estimateTokens(text) → count
checkAvailability(model) → { available, remainingTokens }
getModelInfo(model) → { provider, costPer1kTokens, contextWindow }
listModels() → model[]
```

Three initial implementations:
- **`anthropic`** — Claude models via Anthropic API
- **`groq`** — Groq-hosted models (Whisper, Llama, Mixtral)
- **`ollama`** — Local models via Ollama API

**Why this interface:** `estimateTokens` and `checkAvailability` are what the model-manager needs to make swap decisions. `getModelInfo` enables cost-aware routing.

### D4: Model Manager as a Cron Agent, Not Inline Middleware

The model-manager runs on a cron schedule (every 15 minutes suggested) or on-demand. It reads cost-tracker data, checks utilization, and writes model reassignments to `budget.json`. It does NOT intercept individual API calls.

**Why cron, not middleware:** 
- Middleware adds latency to every call
- Model swaps should be deliberate decisions with logging, not silent redirects
- Cron allows the manager to analyze trends (last N tasks) not just point-in-time
- Simpler to implement and debug

**Swap flow:**
1. Model-manager reads `cost-tracker.mjs` utilization data
2. Identifies agents at 80%+ of daily budget
3. For agents at 90%+, checks `fallbackChain` in `budget.json`
4. Writes new `activeModel` to `budget.json` (distinct from `model` which is the preferred model)
5. `worker.mjs` reads `activeModel` when spawning agents
6. Logs swap event to `pm/model-performance.jsonl`
7. Sends notification via notify.mjs

**Reset:** At daily budget reset (midnight or configured), `activeModel` reverts to `model` (preferred).

### D5: Performance Ledger is Append-Only JSONL

```jsonl
{"ts":"2026-04-07T12:00:00Z","agent":"roy","model":"claude-sonnet-4-6","provider":"anthropic","taskId":"T-042","taskType":"feature","tokensUsed":18500,"success":true,"testsPassed":true,"duration":45,"firstAttempt":true}
```

**Why JSONL:** Simple, appendable, greppable, no schema migrations. `model-manager.mjs report` aggregates on read. JSONL files can be rotated monthly without tooling.

**Why not SQLite:** Adds a dependency. JSONL is sufficient for the data volumes (hundreds of tasks/month, not millions).

### D6: Field Learnings as Templates + Documentation, Not Scripts

Most LinguaFlow learnings (failure taxonomy, shared protocol, escalation chain, no-questions mode, doc-as-code, merge safety) are codified as:
- Updated `.template` files that `setup.mjs` scaffolds into new projects
- New sections in framework documentation
- Small additions to existing scripts (e.g., openspec hygiene check in `daily-review.mjs`)

**Why not new scripts:** These are process patterns, not automation. A template that every project starts with is more valuable than a script that checks compliance after the fact.

**Exception:** Shrinking allowlist defeat tests get a small addition to `four-layer-validate.mjs` — an `--allowlist <file>` flag that loads a JSON allowlist and fails on new violations not in the list.

### D7: budget.json Evolution

Current:
```json
{ "roy": { "model": "sonnet", "dailyTokens": 100000 } }
```

New:
```json
{
  "roy": {
    "model": "claude-sonnet-4-6",
    "provider": "anthropic",
    "dailyTokens": 100000,
    "fallbackChain": ["claude-sonnet-4-6", "claude-haiku-4-5"],
    "activeModel": null,
    "modelPreferences": {
      "simple fix": "claude-haiku-4-5",
      "architecture": "claude-opus-4-6"
    }
  }
}
```

- `model` → preferred model (full model ID, not shorthand)
- `provider` → default provider for this agent
- `fallbackChain` → ordered list model-manager walks on budget exhaustion
- `activeModel` → set by model-manager when swapped; `null` means use `model`
- `modelPreferences` → optional per-task-type overrides (model-manager uses these for recommendations)

**Migration:** `setup.mjs` handles both old format (shorthand model names) and new format. Existing `budget.json` files work without changes — missing fields use defaults.

## Risks / Trade-offs

- **[Risk] Model swap mid-sprint disrupts quality** → Mitigation: Fallback chains are explicit and human-configured. Model-manager logs every swap. Daily reset returns to preferred model. Performance ledger catches quality drops.
- **[Risk] Adapter abstraction leaks** → Mitigation: Interface is minimal (5-7 methods). Adapters are thin wrappers, not full abstractions. If an adapter can't support a method, it throws `NotImplemented` — scripts handle gracefully.
- **[Risk] Performance ledger grows unbounded** → Mitigation: Monthly rotation. `model-manager.mjs archive` moves old entries to `pm/model-performance-archive/`.
- **[Risk] Existing projects break on budget.json schema change** → Mitigation: All new fields are optional with sensible defaults. `load-config.mjs` normalizes old format on read.

## Migration Plan

1. Ship adapter interfaces + `file-based` adapter first (this is what already works)
2. Move `paperclip-sync.mjs` logic into `adapters/orchestration/paperclip.mjs` — keep `paperclip-sync.mjs` as a CLI wrapper that calls the adapter
3. Update `setup.mjs` to ask "Which orchestration platform?" (default: file-based)
4. Ship model-manager agent + performance ledger
5. Update templates with field learnings
6. Update CLAUDE.md to be platform-neutral (Paperclip mentioned as one adapter option, not the default)

**Rollback:** Every change is additive. Existing projects ignore new fields. No migrations required.

## Open Questions

- **Q1:** Should the model-manager have authority to swap UP (haiku → sonnet) when budget allows and performance data shows the agent needs it? Or only swap DOWN on exhaustion?
- **Q2:** Should fallback chains cross providers (anthropic → groq → ollama) or stay within a single provider? Cross-provider adds complexity but maximizes availability.
- **Q3:** What's the right cron interval for model-manager? 15 minutes is proposed but may be too frequent for small teams.
