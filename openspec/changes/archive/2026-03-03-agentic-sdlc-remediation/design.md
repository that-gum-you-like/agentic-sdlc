## Context

LinguaFlow's Agentic SDLC has a functional foundation: 6 agents with character sheets, a file-based task queue with pattern-matching assignment, a 5-layer memory system with manual consolidation, pre/post-commit hooks, and a deploy pipeline. However, the system lacks automated maintenance (REM sleep, cost tracking), safety mechanisms for parallel execution (claims, budgets), quality regression prevention (defeat tests, behavior tests), and version management for agent prompts. All new systems must integrate with the existing `agents/` tooling directory and follow the same Node.js/ESM patterns used by `queue-drainer.mjs` and `memory-manager.mjs`.

## Goals / Non-Goals

**Goals:**
- Extend `queue-drainer.mjs` with priority sorting, claim/release, task archival, and budget enforcement
- Create standalone scripts for REM sleep automation, agent versioning, memory migration, cost tracking, and behavior testing
- Add `status.json` to all OpenSpec changes and Value Analysis to all proposals
- Create defeat tests and integration test tier in the LinguaFlow test suite
- Populate failure memories for all 6 agents
- Register automated cron jobs via OpenClaw

**Non-Goals:**
- No changes to the LinguaFlow app code (screens, services, components)
- No new agent creation (using existing 6 agents)
- No changes to Matrix setup or communication patterns
- No spaCy/AST-based custom analyzers (deferred — ESLint + defeat tests cover current needs)
- No AUTONOMOUS_WORKER_QUEUE.json consolidated file (individual files with priority achieve same goal)

## Decisions

### D1: Extend queue-drainer.mjs rather than creating a new orchestrator
**Rationale:** The queue drainer already handles task loading, agent assignment, and the CLI interface. Adding priority sorting, claims, archival, and budget checks as new commands/logic keeps one tool as the single entry point for task management. Creating a separate orchestrator would split responsibility and require agents to learn a new tool.
**Alternative considered:** New `task-orchestrator.mjs` — rejected because it duplicates task loading/saving logic and creates confusion about which tool to use.

### D2: Standalone scripts for each new capability (not a monolith)
**Rationale:** Following the existing pattern (`memory-manager.mjs`, `queue-drainer.mjs`, `worker.mjs`), each new capability gets its own script. This keeps files small (LLM-friendly), makes each system independently testable, and allows selective usage.
**New scripts:**
- `agents/rem-sleep.mjs` — Runs consolidation for all agents, adds age-based promotion
- `agents/version-snapshot.mjs` — Copies all AGENT.md files to versioned snapshots
- `agents/migrate-memory.mjs` — Checks and migrates memories on version changes
- `agents/cost-tracker.mjs` — Logs and reports token usage
- `agents/test-behavior.mjs` — Runs behavior assertions against agent prompts

### D3: Task schema extensions are additive (backward-compatible)
**Rationale:** Existing task files (T-001 through T-042) should continue working without migration. New fields (`priority`, `estimatedTokens`, `claimedBy`, `claimedAt`) default to `null`/`"MEDIUM"` when absent. The queue drainer treats missing priority as `"MEDIUM"` and missing claim fields as unclaimed.

### D4: Defeat tests use Jest + file system scanning (not runtime hooks)
**Rationale:** Defeat tests scan the codebase for anti-patterns statically (file size, `any` types, `console.log`, missing `{data, error}` patterns). This runs in Jest alongside existing tests, requires no new tooling, and integrates with the pre-commit hook. Runtime detection would require instrumenting the app.
**Location:** `LinguaFlow/__tests__/defeat/` — each test file targets one anti-pattern class.

### D5: Behavior tests use prompt+scenario assertions (not LLM evaluation)
**Rationale:** Behavior tests verify that an agent's AGENT.md + memory contains the right instructions for known scenarios. They parse the prompt files and check for required patterns/rules — not by running an actual LLM call (which would be expensive and non-deterministic). Example: "Roy's AGENT.md must mention `{data, error}` pattern" ensures the prompt hasn't lost critical instructions.

### D6: Agent versioning uses date-based snapshots with inline version headers
**Rationale:** Adding `<!-- version: 1.0.0 | date: 2026-03-02 -->` to each AGENT.md is lightweight and git-diffable. The snapshot script copies all AGENT.md files to `agents/versions/YYYY-MM-DD/` for easy rollback. This avoids complex version numbering — date-based is simpler and sufficient.

### D7: Budget enforcement is advisory (warning + skip), not blocking
**Rationale:** Hard-blocking agents when they hit budget limits could leave tasks stuck mid-implementation. Instead, the queue drainer warns when an agent exceeds its daily limit and skips assigning *new* tasks. In-progress tasks continue to completion. Conservation mode halves all limits and can be toggled via `agents/budget.json`.

### D8: OpenClaw cron for automated REM sleep and cost reports
**Rationale:** Weekly REM sleep and daily cost reports should run without human intervention. OpenClaw's cron system is already integrated and running. Two new cron jobs:
- Weekly (Sunday 23:00): `node agents/rem-sleep.mjs`
- Daily (06:00): `node agents/cost-tracker.mjs report`

## Risks / Trade-offs

**[Risk] Defeat tests become stale as codebase evolves** → Mitigation: Richmond's checklist grows over time; new checklist items should trigger new defeat tests. Add a quarterly review to the monthly cycle.

**[Risk] Behavior tests are too brittle (break on minor prompt wording changes)** → Mitigation: Test for semantic requirements ("mentions {data, error}") not exact wording. Use regex patterns, not string equality.

**[Risk] Cost tracking depends on manual token logging** → Mitigation: Agents log their own token usage via `cost-tracker.mjs record`. If they forget, the daily report shows gaps. Future enhancement: hook into Claude API response headers for automatic tracking.

**[Risk] Memory migration flags false positives** → Mitigation: Migration runs in `--check` mode by default (report-only). Actual changes require `--apply` flag. Human reviews flagged entries before they're modified.

## Open Questions

- Should budget limits be per-agent or per-role? (Current design: per-agent, since agents map 1:1 to roles)
- Should defeat tests run in pre-commit or as a separate CI step? (Current design: pre-commit via lint-staged, but may slow commits)
