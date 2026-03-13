## 1. Schema & Configuration

- [ ] 1.1 Create `agents/schemas/capability-checklist.schema.json` — taskId, agent, timestamp, capabilities object (each key → `{ used: bool, skipReason?: string }`)
- [ ] 1.2 Create `agents/templates/capabilities.json.template` — default expected capabilities per agent archetype (backend: memoryRecall+memoryRecord+defeatTests+learningRecord+costTracking required; reviewer: memoryRecall+checklistReview required; release: deployPipeline+openclawNotify required)
- [ ] 1.3 Add `capabilityMonitoring` section to `agents/load-config.mjs` — `enabled` (default true), `driftThreshold` (default 3), `windowSize` (default 10)
- [ ] 1.4 Add `capabilityDrift` to notification trigger types in `agents/notify.mjs`

## 1B. System-Level Capability Instrumentation (PRIMARY source of truth)

- [ ] 1B.1 Create `agents/capability-logger.mjs` — exports `logCapabilityUsage(capability, agent, taskId, script, command)` that appends one JSONL line to `pm/capability-log.jsonl`. Append-only, atomic write, includes timestamp. Agents cannot skip or fake this — the script itself writes the log.
- [ ] 1B.2 Instrument `agents/memory-manager.mjs` — call `logCapabilityUsage("memoryRecall", ...)` on `recall`/`search`, `logCapabilityUsage("memoryRecord", ...)` on `record`
- [ ] 1B.3 Instrument `agents/semantic-index.mjs` — log `"semanticSearch"` on `search`, `"semanticEmbed"` on `embed`
- [ ] 1B.4 Instrument `agents/cost-tracker.mjs` — log `"costTracking"` on `record`
- [ ] 1B.5 Instrument `agents/four-layer-validate.mjs` — log `"defeatTests"` when running validation layers
- [ ] 1B.6 Instrument `agents/queue-drainer.mjs` — log `"schemaValidation"` when schema validation runs on claim/complete
- [ ] 1B.7 Instrument `agents/notify.mjs` — log `"openclawNotify"` on `send`/`approve`
- [ ] 1B.8 Instrument `agents/pattern-hunt.mjs` — log `"patternHunt"` on run
- [ ] 1B.9 Instrument `agents/rem-sleep.mjs` — log `"remSleep"` on consolidation
- [ ] 1B.10 Instrument `agents/review-hook.mjs` — log `"checklistReview"` on review execution
- [ ] 1B.11 Write test: capability-logger appends valid JSONL; multiple concurrent writes don't corrupt; log survives agent crash (append-only)

## 2. Checklist Generation (Agent-Side)

- [ ] 2.1 Update `agents/worker.mjs` — append "Capability Checklist" section to every generated prompt. Load `capabilities.json` for agent-specific required/conditional/notExpected lists. Instruct agent to output `<!-- CAPABILITY_CHECKLIST -->` JSON block as final structured output.
- [ ] 2.2 Define the canonical capability list (all ~15 capabilities with string keys): `memoryRecall`, `memoryRecord`, `semanticSearch`, `defeatTests`, `schemaValidation`, `browserE2E`, `openclawBrowser`, `openclawNotify`, `costTracking`, `learningRecord`, `cadenceTiming`, `checklistReview`, `humanTaskCreate`, `patternHunt`, `permissionCompliance`
- [ ] 2.3 Update `agents/templates/AGENT.md.template` — add to micro cycle: "Step 8: Output capability checklist (which capabilities you used this task)"

## 3. Checklist Capture (Queue-Drainer Side)

- [ ] 3.1 Update `agents/queue-drainer.mjs complete` — parse agent output for `<!-- CAPABILITY_CHECKLIST -->` tagged JSON block, validate against schema, store as `capabilityChecklist` field in task JSON before archiving
- [ ] 3.2 If no checklist found in output, log warning: "No capability checklist found for <task-id>" and store `capabilityChecklist: null` (don't block completion)
- [ ] 3.3 Write test: valid checklist parsed and stored; missing checklist logs warning but completes; malformed JSON logged and stored as null

## 4. Capability Monitor Script

- [ ] 4.1 Create `agents/capability-monitor.mjs` with commands: `check` (scan recent completed tasks), `report` (full usage report), `status` (quick health check)
- [ ] 4.2 Implement drift detection: PRIMARY source is `pm/capability-log.jsonl` (system-instrumented). For each agent, load last `windowSize` tasks. For each `required` capability, check if the system log has zero entries for `driftThreshold`+ consecutive tasks. Fire `capabilityDrift` notification. Cross-reference agent self-report for skipReasons.
- [ ] 4.2b Implement discrepancy detection: compare system log (what actually ran) vs. agent self-report (what agent claims). Flag when agent says "used: true" but system log has no matching entry ("Agent claimed memoryRecall but no system log entry found for T-015").
- [ ] 4.3 Implement scope creep detection: flag when `notExpected` capability is marked as used.
- [ ] 4.4 Implement usage aggregation: per-agent, per-capability usage rate over the window. Output as table.
- [ ] 4.5 Write test: drift detected after 3 consecutive skips; no drift with skipReason; no drift below threshold; scope creep flagged for notExpected usage; usage rates computed correctly

## 5. Integration with Cycles

- [ ] 5.1 Update `agents/cycles/daily-review.mjs` — call capability-monitor `check` and include "Agent Capability Health" section in PM Dashboard
- [ ] 5.2 Update `agents/cycles/weekly-review.mjs` — call capability-monitor `report` and include capability usage trends in weekly output
- [ ] 5.3 Update `agents/notify.mjs` — support `capabilityDrift` trigger in notification config

## 6. Documentation & Setup

- [ ] 6.1 Update CLAUDE.md — add capability monitoring section with commands, config, and explanation
- [ ] 6.2 Update `setup.mjs` — scaffold `capabilities.json` from template during project setup, add `capabilityMonitoring` to project.json
- [ ] 6.3 Add `capability-monitor.mjs` to Script Reference table in CLAUDE.md
- [ ] 6.4 Update `openspec/BACKLOG.md` — reference this change for tracking

## 7. Validation

- [ ] 7.1 Write full test suite: `agents/__tests__/capability-checklist.test.mjs` covering schema validation, config loading, drift detection algorithm, scope creep detection, checklist parsing from mock agent output
- [ ] 7.2 Run all existing tests (`node --test agents/__tests__/curriculum-maturity-advancement.test.mjs`) to confirm no regressions
