# SDLC Gap Closure — Implementation Tasks

> Tasks ordered by dependency. Each phase delivers verifiable outcomes.

---

## Phase 1 — OpenSpec Artifacts
- [x] 1.1 Create `openspec/changes/sdlc-gap-closure/` directory structure
- [x] 1.2 Write proposal.md with problem, solution, value analysis
- [x] 1.3 Write design.md with key decisions
- [x] 1.4 Write 7 spec files (portability, autonomy, matrix, docs, safety, telemetry, accuracy)
- [x] 1.5 Write tasks.md (this file)
- [x] 1.6 Write status.json

## Phase 2 — Portability Refactor
- [x] 2.1 Create `agents/project.json` with all project-specific config
- [x] 2.2 Create `agents/load-config.mjs` shared ESM module
- [x] 2.3 Refactor `queue-drainer.mjs` to use loadConfig()
- [x] 2.4 Refactor `worker.mjs` to use loadConfig()
- [x] 2.5 Refactor `matrix-cli.mjs` to use loadConfig()
- [x] 2.6 Refactor `rem-sleep.mjs`, `memory-manager.mjs`, `version-snapshot.mjs`, `test-behavior.mjs`, `migrate-memory.mjs` (agent lists)
- [x] 2.7 Refactor `four-layer-validate.mjs`, `ast-analyzer.mjs` (LinguaFlow paths)
- [x] 2.8 Refactor `seed-queue.mjs`, `cost-tracker.mjs`, `pattern-hunt.mjs`
- [x] 2.9 Refactor `cycles/daily-review.mjs`, `cycles/weekly-review.mjs`
- [x] 2.10 Create `agents/PORTABILITY.md` template guide
- [x] 2.11 Verify: `grep -r "resolve('/home/bryce/languageapp')" agents/*.mjs` returns nothing
- [x] 2.12 Verify: `node agents/queue-drainer.mjs status` works
- [x] 2.13 Verify: `node agents/test-behavior.mjs` passes

## Phase 3 — Autonomous Run (End-to-End)
- [x] 3.1 Create `tasks/queue/SDLC-001.json` (Roy: add audioLessonService integration tests)
- [x] 3.2 Run `node agents/queue-drainer.mjs run` — assigns SDLC-001 to Roy
- [x] 3.3 Run `node agents/worker.mjs --agent roy --task SDLC-001` — generate prompt
- [x] 3.4 Spawn Roy as sonnet subagent with generated prompt
- [x] 3.5 Run `node agents/queue-drainer.mjs archive` — archive SDLC-001
- [x] 3.6 Run `node agents/cost-tracker.mjs record roy SDLC-001 <tokens>` — log cost

## Phase 4 — Matrix Communication
- [x] 4.1 Start Matrix server, verify with curl
- [x] 4.2 Roy sends to #backend: "SDLC-001 complete."
- [x] 4.3 Read from #backend: confirm Roy's message visible
- [x] 4.4 Cross-agent: Roy sends to #general, Jen reads

## Phase 5 — Safety Net Validation
- [x] 5.1 Test conservation mode toggle
- [x] 5.2 Test budget circuit breaker
- [x] 5.3 Test stale claim detection
- [x] 5.4 Run REM sleep --dry-run
- [x] 5.5 Create `agents/SAFETY.md`

## Phase 6 — Douglas Documentation
- [x] 6.1 Create SDLC-002 task (architecture.md)
- [x] 6.2 Create SDLC-003 task (api/services.md)
- [x] 6.3 Create SDLC-004 task (agents/agent-system.md)
- [x] 6.4 Spawn Douglas subagent for each doc (haiku model)
- [x] 6.5 Verify each doc >100 lines with accurate counts

## Phase 7 — Test Expansion
- [x] 7.1 Create authStore.integration.test.ts (>=8 tests)
- [x] 7.2 Create videoServiceFeed.integration.test.ts (>=8 tests)
- [x] 7.3 Create audio-lesson.spec.ts (>=4 E2E tests)
- [x] 7.4 Create achievement.spec.ts (>=4 E2E tests)
- [x] 7.5 Run defeat tests, verify no new violations

## Phase 8 — Accuracy Pass
- [x] 8.1 Update pm/DASHBOARD.md with current counts
- [x] 8.2 Update CLAUDE.md with current counts
- [x] 8.3 Verify: `node agents/test-behavior.mjs` passes
- [x] 8.4 Commit accuracy corrections

## Phase 9 — Close and Re-Assess
- [x] 9.1 Mark all tasks complete in this file
- [x] 9.2 Update status.json to complete
- [x] 9.3 Run full verification battery (11 checks)
- [x] 9.4 Produce final assessment document
