## Context

The agentic SDLC framework has ~15 capabilities agents are expected to use: memory recall, memory record, semantic search, schema validation, defeat tests, browser E2E, OpenClaw notifications, OpenClaw browser testing, pattern-hunt, checklist review, permission constraints, cadence timing, cost tracking, human task creation, and learning recording. Currently there is zero visibility into which capabilities agents actually use per task. The only signal is post-hoc — when something breaks because a capability was silently skipped.

The curriculum-maturity-advancement change added many new capabilities (semantic memory, permissions, cadence, wellness). Without a tracking mechanism, we have no way to know if agents are actually using them.

**Stakeholders:** Bryce (project owner), all agents (they produce checklists), Richmond (reviews checklists as part of quality role).

## Goals / Non-Goals

**Goals:**
- Every completed task produces a machine-readable capability checklist
- Expected capabilities per agent are configurable (not all agents use all capabilities)
- Drift detection fires within 24 hours (3+ consecutive skips of an expected capability)
- Weekly aggregation shows trends per agent per capability
- Zero additional human overhead — monitoring is fully automated

**Non-Goals:**
- Enforcing capability usage (blocking tasks that skip capabilities) — this is monitoring, not gating. Agents may have valid reasons to skip.
- Real-time monitoring (checking during task execution) — we check after completion
- Modifying how capabilities themselves work — we only track usage, not change behavior
- Building a UI dashboard — the PM Dashboard markdown file is sufficient

## Decisions

### D1: Dual-layer tracking — system-instrumented logs (primary) + agent self-report (secondary)

**Decision:** Capability usage is tracked at TWO levels. The **primary** source of truth is system-level instrumentation: each script logs its own invocation automatically to a shared capability log file. The **secondary** source is agent self-report (structured JSON in output) which captures intent and skipReasons that the system can't infer.

**System-instrumented logging (PRIMARY — cannot be skipped or lied about):**
Every capability script (`memory-manager.mjs`, `semantic-index.mjs`, `cost-tracker.mjs`, `queue-drainer.mjs`, `notify.mjs`, `rem-sleep.mjs`, `pattern-hunt.mjs`, `four-layer-validate.mjs`, etc.) logs its invocation to `pm/capability-log.jsonl` (append-only, one JSON line per invocation):

```jsonl
{"timestamp":"2026-03-13T14:30:01Z","capability":"memoryRecall","agent":"roy","taskId":"T-015","script":"memory-manager.mjs","command":"recall"}
{"timestamp":"2026-03-13T14:30:05Z","capability":"semanticSearch","agent":"roy","taskId":"T-015","script":"semantic-index.mjs","command":"search"}
{"timestamp":"2026-03-13T14:31:22Z","capability":"defeatTests","agent":"roy","taskId":"T-015","script":"four-layer-validate.mjs","command":"run"}
{"timestamp":"2026-03-13T14:32:00Z","capability":"memoryRecord","agent":"roy","taskId":"T-015","script":"memory-manager.mjs","command":"record"}
```

This is automatic — the script writes the log line as a side effect of running. The agent cannot skip it, lie about it, or forget it. If `memory-manager.mjs recall roy` ran, the log has proof. If it didn't run, the log has no entry.

**Agent self-report (SECONDARY — captures intent and context):**
Agents ALSO output a `<!-- CAPABILITY_CHECKLIST -->` JSON block with `skipReason` for unused capabilities. This adds context the system can't infer ("skipped browserE2E because backend-only change"). The monitor cross-references both sources: if the agent claims it used memory but the system log has no `memoryRecall` entry for that task, that's a discrepancy flag.

```json
{
  "taskId": "T-015",
  "agent": "roy",
  "timestamp": "2026-03-13T14:30:00Z",
  "capabilities": {
    "memoryRecall": { "used": true },
    "memoryRecord": { "used": true },
    "semanticSearch": { "used": false, "skipReason": "embeddings not installed" },
    "defeatTests": { "used": true },
    "schemaValidation": { "used": true },
    "browserE2E": { "used": false, "skipReason": "backend-only change, no frontend files" },
    "openclawBrowser": { "used": false, "skipReason": "not a deploy task" },
    "openclawNotify": { "used": false, "skipReason": "not final task" },
    "costTracking": { "used": true },
    "learningRecord": { "used": true },
    "cadenceTiming": { "used": true },
    "checklistReview": { "used": false, "skipReason": "no post-commit review configured" }
  }
}
```

**Why dual-layer:** Self-reporting alone is unreliable — agents can lie, forget, or drift. System logs alone miss context (why was something skipped). Together they provide both proof and explanation. The monitor trusts the system log for "did it happen?" and the self-report for "why/why not?"

**Implementation:** A shared `logCapabilityUsage(capability, agent, taskId, script, command)` function exported from a new `agents/capability-logger.mjs`. Each script imports it and calls it at its entry point. The function appends one JSONL line to `pm/capability-log.jsonl`. This is ~3 lines added per script — minimal instrumentation.

### D2: Expected capabilities defined per agent in capabilities.json

**Decision:** Each project has `agents/capabilities.json` mapping agent names to their expected capability usage:

```json
{
  "roy": {
    "required": ["memoryRecall", "memoryRecord", "defeatTests", "learningRecord", "costTracking"],
    "conditional": {
      "browserE2E": "when frontend files changed",
      "semanticSearch": "when sentence-transformers installed",
      "cadenceTiming": "when cadence configured"
    },
    "notExpected": ["openclawBrowser", "openclawNotify"]
  },
  "richmond": {
    "required": ["memoryRecall", "checklistReview"],
    "conditional": {},
    "notExpected": ["browserE2E", "openclawBrowser", "costTracking"]
  }
}
```

- `required`: MUST be used on every task. Skipping without `skipReason` triggers immediate alert.
- `conditional`: Expected under certain conditions. `skipReason` must match the condition description.
- `notExpected`: Agent should never use these. Using them is also an anomaly (scope creep).

**Why per-agent:** Different agents have different roles. Richmond (reviewer) should never write files. Roy (backend) shouldn't do browser tests unless frontend files changed.

### D3: Capability monitor is a script, not a separate agent

**Decision:** `agents/capability-monitor.mjs` is a script that runs as part of daily-review.mjs (not a separately spawned agent). It reads completed task checklists from `tasks/completed/`, compares against `capabilities.json`, and detects drift.

**Why not a separate agent:** Monitoring is a quick computation (scan JSON files, compare, report). Spawning a full Claude instance for this is wasteful. A script is faster, cheaper, deterministic.

**Drift detection algorithm:**
1. For each agent, load last N completed task checklists (default N=10)
2. For each required capability, check if it was used
3. If a required capability was skipped in 3+ consecutive tasks without valid skipReason → fire drift alert
4. If a `notExpected` capability was used → fire scope creep alert
5. Compute usage rate per capability over the window — include in weekly report

### D4: Checklists stored in task completion JSON

**Decision:** The capability checklist is stored as a `capabilityChecklist` field in the task's JSON file (same file in `tasks/completed/`). Queue-drainer parses the checklist from agent output on `complete` and attaches it to the task JSON before archiving.

**Why in task JSON:** Single source of truth. No separate storage to manage. Checklists travel with the task through completion → archive.

### D5: Drift threshold configurable in project.json

**Decision:** `project.json` gets a `capabilityMonitoring` section:
```json
{
  "capabilityMonitoring": {
    "enabled": true,
    "driftThreshold": 3,
    "windowSize": 10
  }
}
```

- `driftThreshold`: consecutive skips before alerting (default 3)
- `windowSize`: how many recent tasks to analyze (default 10)

## Risks / Trade-offs

**[Agent lies on checklist] → Mitigation:** System-instrumented logs are the primary source of truth — if memory-manager.mjs didn't run, the log doesn't have an entry, regardless of what the agent claims. The monitor cross-references system log vs. self-report and flags discrepancies ("agent claimed memoryRecall but no system log entry found").

**[Checklist adds prompt length] → Mitigation:** ~200 tokens for the checklist template. Negligible vs. typical task prompts (5K-30K tokens).

**[Too many false alarms] → Mitigation:** Configurable threshold. `conditional` capabilities have built-in exceptions. `skipReason` prevents alerts for legitimate skips.

**[Agent forgets to output checklist] → Mitigation:** Queue-drainer warns if no checklist found in task output. Missing checklist is itself a drift signal.

## Open Questions

1. Should the checklist be part of the commit message (visible in git history) or only in the task JSON?
2. Should we track capability usage duration (how long the agent spent on memory recall vs. implementation) or just boolean used/not-used?
3. Should Richmond validate checklist accuracy during post-commit review, or is drift detection sufficient?
