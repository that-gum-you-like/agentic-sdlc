## Context

The agentic SDLC framework (`~/agentic-sdlc`) is a universal methodology for AI-assisted software development. It currently has 22 scripts, 9 templates, 10 OpenSpec skills, and 7 documented maturity levels. A gap analysis of the actual implementation (not documentation) reveals:

- **Levels 1-3 (Foundation → Scale):** Fully operational. Queue-drainer, multi-agent routing, task queue, Matrix comms, budget enforcement all work.
- **Level 4 (Quality):** ~80%. Four-layer validation works but lacks NLP analysis. No permission tiers. No structured data contracts for handoffs.
- **Level 5 (Evolution):** ~30%. 5-layer memory exists but uses linear scan (no semantic search). REM sleep deduplicates by exact match only. No maturation tracking. No performance feedback to agents.
- **Level 6 (Self-Improving):** ~10%. Behavior tests exist but don't check for maturation regression. Pattern-hunt proposes defeat tests but doesn't measure whether agents actually improve. No automated cycle scheduling.

The curriculum identifies additional mature capabilities our framework completely lacks: human task queues (bidirectional collaboration), wellness guardrails (operator protection), instance scaling (horizontal agent throughput), and execution cadence management (merge conflict prevention).

**Constraints:**
- No OpenAI dependencies (privacy requirement — Bryce's non-negotiable)
- All NLP must run locally (spaCy, sentence-transformers)
- Framework must remain language-agnostic and project-independent
- Changes must not break existing projects (LinguaFlow) that use the framework
- Scripts are Node.js (mjs) — Python dependencies acceptable only for NLP tools invoked as subprocesses

## Goals / Non-Goals

**Goals:**
- Close the Level 4 gap to 100% (permission tiers, data contracts, NLP analysis)
- Close the Level 5 gap to 80%+ (semantic memory, maturation tracking, performance feedback)
- Close the Level 6 gap to 60%+ (automated cycles, regression detection, bottleneck alerting)
- Add novel capabilities that exceed curriculum (human task queue, wellness guardrails, instance scaling)
- Every new capability has tests (behavior tests for framework scripts, unit tests for logic)

**Non-Goals:**
- Rewriting existing scripts from scratch (enhance, don't replace)
- Building a custom vector database (use existing tools: FAISS, SQLite-vec, or flat-file with cosine similarity)
- Real-time agent coordination (our model is turn-based/async, not streaming)
- GPU-dependent NLP models (must run on CPU for accessibility)
- Automatic agent prompt rewriting (humans still author AGENT.md, system just measures effectiveness)

## Decisions

### D1: Implementation Phases — 4 phases, dependency-ordered

**Decision:** Organize into 4 phases that each deliver standalone value, ordered by dependency chain.

**Phase 1: Foundation Enhancements (Level 4 completion)**
Permission tiers, data contracts, framework comparison docs. These are prerequisites for scaling and cadence work. Low risk, high clarity.

**Phase 2: Feedback Loops (Level 5 advancement)**
Semantic memory, maturation tracking, performance feedback, similarity-based REM sleep. These require Phase 1's data contracts for structured metrics collection.

**Phase 3: Scaling & Cadence (Level 3-4 horizontal expansion)**
Instance scaling, execution cadence, cycle automation. These require Phase 2's maturation tracking to measure whether scaling helps or hurts quality.

**Phase 4: Human-Agent Collaboration & Protection (novel capabilities)**
Human task queue, wellness guardrails, bottleneck detection, NLP analysis. These are the most novel and can be developed last because they're additive, not foundational.

**Rationale:** Each phase is usable independently. Phase 1 can ship and improve existing projects immediately. Phase 4 is most experimental and benefits from lessons learned in Phases 1-3.

**Alternative considered:** Big-bang delivery. Rejected because it's antithetical to our own framework's philosophy (small commits, incremental value).

### D2: Semantic Memory — Flat-file embeddings with cosine similarity

**Decision:** Store embeddings as JSON arrays alongside memory entries. Use `sentence-transformers` (Python, CPU-only, local) to generate embeddings. Cosine similarity search in Node.js via a thin helper script.

**Architecture:**
```
agents/semantic-index.mjs          # Node.js: builds/queries index
agents/embed.py                     # Python: generates embeddings via sentence-transformers
agents/<agent>/memory/vectors.json  # Embedding cache per agent
```

**Why not FAISS:** Adds C++ dependency, overkill for <10K memory entries per agent. Flat-file cosine search is fast enough at our scale and keeps the framework simple.

**Why not Anthropic embeddings:** Network dependency for a local operation. Sentence-transformers runs fully offline.

**Why not SQLite-vec:** Good option but adds binary dependency. JSON stays portable. Can migrate to SQLite-vec later if scale demands it.

### D3: Human Task Queue — Mirrors agent task queue structure

**Decision:** `tasks/human-queue/*.json` with identical schema to agent tasks plus `requester` (which agent created it), `urgency` (blocker/normal/low), and `unblocks` (list of agent task IDs that depend on this).

When an agent hits a blocker it can't resolve, worker.mjs creates a human task instead of just flagging blocked. Queue-drainer's `status` command shows human tasks prominently. Notify.mjs pushes new human tasks immediately.

When human completes the task (via WhatsApp reply "done HTASK-001" or file edit), queue-drainer auto-unblocks dependent agent tasks.

**Why this over just approvals:** Approvals are yes/no gates. Human tasks are open-ended — "we need brand colors", "need to decide between Stripe and Paddle", "need to write the onboarding copy." Different problem.

### D4: Wellness Guardrails — Opt-in, configurable, non-blocking

**Decision:** Add `humanWellness` config to `project.json`:
```json
{
  "humanWellness": {
    "enabled": true,
    "dailyMaxHours": 10,
    "nightCutoff": "23:00",
    "breakIntervalHours": 3,
    "breakDurationMinutes": 15
  }
}
```

Cost-tracker tracks wall-clock session time (first agent spawn → last agent complete per day). When thresholds are exceeded, notify.mjs sends a wellness alert. The queue is NOT paused — alerts are advisory. Humans override if they choose.

**Why advisory, not blocking:** Blocking an operator's own tools is patronizing. The framework surfaces data ("you've been at this 12 hours"), the human decides. This mirrors the curriculum's guidance: "Set hard time boundaries (use timers, respect them)."

**Alternative considered:** Queue pause with override code. Rejected because it adds friction without adding safety — the human would just override immediately.

### D5: Instance Scaling — Queue-drainer manages, worker spawns

**Decision:** Add `maxInstances` to budget.json per agent. Queue-drainer checks unblocked task count per domain. If count > 1 and agent has capacity, it assigns up to `maxInstances` tasks simultaneously, each with a unique instance ID.

Worker.mjs injects into the agent prompt: "You are Roy (instance 2 of 3). Instances 1 and 3 are working on [task names]. Do not modify files in [their claimed file patterns]."

Budget is tracked per-type (not per-instance) — all Roy instances share Roy's daily token limit.

**Conflict detection:** Before assigning task to instance N, check that its file patterns (from domains.json) don't overlap with already-claimed tasks. If overlap detected, serialize instead of parallelize.

### D6: Execution Cadence — Commit windows, not real-time coordination

**Decision:** Add optional `cadence` config:
```json
{
  "cadence": {
    "commitWindowMinutes": 15,
    "agentOffsets": {
      "roy": 0,
      "jen": 5,
      "moss": 10
    }
  }
}
```

Agents are told their commit window in worker.mjs prompt injection. This is advisory — if an agent finishes at :07 and its window is :15, it should wait. But it's prompt-based, not hard-enforced, because we can't control when Claude Code commits.

**Why prompt-based:** We don't have a git hook that checks "is it your window?" (and that would be fragile). Telling the agent "commit at :15, :30, :45, :00" is sufficient. If it occasionally commits early, the release manager handles it.

### D7: NLP Analysis — Python subprocess, Node.js orchestration

**Decision:** `agents/nlp-analyzer.mjs` shells out to `agents/nlp-analyze.py` which uses spaCy. Node script passes changed files, Python returns JSON report of near-miss property accesses and API calls.

Integrated into four-layer-validate.mjs as an optional Layer 2.5 (between Critique and Code), only runs if spaCy is installed (`which python3 -c "import spacy"` check).

**Why optional:** Not all environments have Python/spaCy. Framework must work without it. NLP is an enhancement, not a requirement.

### D8: Data Contracts — JSON Schema files, validated at boundaries

**Decision:** Define schemas in `agents/schemas/`:
- `task-claim.schema.json`
- `task-complete.schema.json`
- `review-request.schema.json`
- `review-result.schema.json`
- `deploy-request.schema.json`
- `human-task.schema.json`

Queue-drainer validates task JSON against schema on claim/complete. Matrix-cli validates message payloads on send. Invalid payloads are rejected with descriptive error.

Use `ajv` (npm) for JSON Schema validation — lightweight, no heavy dependencies.

### D9: Permission Tiers — Config-driven, enforced at queue-drainer

**Decision:** Add `permissions` to budget.json per agent:
```json
{
  "roy": {
    "permissions": "full-edit",
    "dailyTokenLimit": 100000
  },
  "richmond": {
    "permissions": "read-only",
    "dailyTokenLimit": 50000
  }
}
```

Tiers: `read-only` → `edit-gated` → `full-edit` → `deploy`

Queue-drainer checks: can this agent type handle this task's required permission level? Worker.mjs injects permission constraints into agent prompt.

### D10: Cycle Automation — Cron templates, not hardcoded schedules

**Decision:** Add `agents/templates/cron-schedule.json.template` with recommended schedules for daily review, weekly pattern hunt, and monthly audit. Setup.mjs registers these as OpenClaw crons (if available) or documents manual schedule.

Not hardcoding schedules in the framework — different projects have different rhythms.

## Risks / Trade-offs

**[Python dependency for NLP] → Mitigation:** NLP is optional. Four-layer-validate gracefully degrades. Install instructions in README.

**[Embedding model size] → Mitigation:** Use `all-MiniLM-L6-v2` (80MB, CPU-fast). Not a heavy model. First run downloads once.

**[Instance scaling merge conflicts] → Mitigation:** Conflict detection checks file patterns before parallel assignment. Cadence system staggers commits. Release manager resolves remaining conflicts.

**[Wellness guardrails ignored] → Mitigation:** Advisory by design. If operator ignores alerts, that's their choice. System logs the data for retrospective.

**[Breaking existing projects] → Mitigation:** All new config fields are optional with sensible defaults. Existing project.json and budget.json files continue to work unchanged. New features only activate when configured.

**[Scope creep — 11 capabilities] → Mitigation:** 4-phase delivery. Each phase ships independently. Can stop after any phase and have a better framework than today.

## Open Questions

1. **Embedding model choice:** `all-MiniLM-L6-v2` is the default recommendation. Should we support swappable models via config?
2. **Human task completion via WhatsApp:** The "done HTASK-001" pattern requires mailbox-sync parsing. Is this reliable enough or do we need a more structured protocol?
3. **Cadence enforcement:** Prompt-based commit windows are advisory. Is there value in a pre-commit hook that warns "outside your commit window"?
4. **Instance scaling budget split:** Should N instances share the daily budget equally, or should each get the full budget? (Equal split is safer; full budget enables more work but risks cost spikes.)
