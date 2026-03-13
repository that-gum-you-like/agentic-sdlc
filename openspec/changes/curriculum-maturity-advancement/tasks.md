## Phase 1: Foundation Enhancements (Level 4 Completion)

### 1. Data Contracts & Schema Validation

- [x] 1.1 Create `agents/schemas/` directory and all 6 JSON Schema files: `task-claim.schema.json`, `task-complete.schema.json`, `review-request.schema.json`, `review-result.schema.json`, `deploy-request.schema.json`, `human-task.schema.json`
- [x] 1.2 Add `ajv` to package.json dependencies and create `agents/schema-validator.mjs` utility module (validate function that loads schema + returns structured errors)
- [x] 1.3 Integrate schema validation into `queue-drainer.mjs` — validate on `claim` (task-claim schema) and `complete` (task-complete schema). Reject invalid payloads with descriptive errors.
- [x] 1.4 Integrate schema validation into `matrix-client/matrix-cli.mjs` — validate structured messages (review-request, review-result, deploy-request) before sending
- [x] 1.5 Write unit tests for schema-validator.mjs — valid payloads pass, missing required fields fail with correct error messages, extra fields allowed
- [x] 1.6 Write integration test: queue-drainer rejects malformed task claim, accepts valid one

### 2. Permission Tiers

- [x] 2.1 Add `permissions` field support to budget.json loading in `agents/load-config.mjs` — default to `full-edit` when not specified
- [x] 2.2 Update `queue-drainer.mjs` to check agent permission tier against task's `requiredPermission` before assignment. Hierarchy: read-only < edit-gated < full-edit < deploy
- [x] 2.3 Update `worker.mjs` to inject permission constraints into agent prompt based on tier (read-only gets "MUST NOT write", edit-gated gets "MUST NOT commit without review", etc.)
- [x] 2.4 Update `queue-drainer.mjs status` to display permission tier per agent alongside budget
- [x] 2.5 Write behavior test additions to `test-behavior.mjs`: verify that agents with read-only tier have constraint language in their generated prompts
- [x] 2.6 Update `agents/templates/AGENT.md.template` to include a `Permission Tier` section placeholder

### 3. Framework Comparison & Documentation

- [x] 3.1 Create `docs/comparison.md` with concept mapping table (8+ rows × 5 frameworks: LangGraph, Autogen, CrewAI, Swarm, Claude Agent SDK)
- [x] 3.2 Add "When to use which" guidance section with honest trade-offs
- [x] 3.3 Add "## Evolution Timeline" section to `agents/templates/AGENT.md.template` documenting the 6-week maturation cycle
- [x] 3.4 Add `framework/evolution-timeline.md` with detailed week-by-week agent maturation expectations
- [x] 3.5 Update README.md to reference comparison.md and evolution-timeline.md

---

## Phase 2: Feedback Loops (Level 5 Advancement)

### 4. Semantic Memory Infrastructure

- [x] 4.1 Create `agents/embed.py` — Python script using sentence-transformers (`all-MiniLM-L6-v2`) to generate embeddings from stdin JSON, output embeddings to stdout JSON. Must work fully offline with no cloud calls.
- [x] 4.2 Create `agents/semantic-index.mjs` — Node.js module that: (a) shells out to embed.py for embedding generation, (b) stores/loads `vectors.json` per agent, (c) performs cosine similarity search, (d) returns top-K results with scores and source layers
- [x] 4.3 Add `search` command to `agents/memory-manager.mjs` — `memory-manager.mjs search <agent> "<query>"` returns top-5 entries by semantic similarity. Falls back to full recall if embeddings unavailable.
- [x] 4.4 Update `memory-manager.mjs record` — after writing entry to memory layer, generate and store embedding in vectors.json (if sentence-transformers available). Graceful fallback if not installed.
- [x] 4.5 Update `worker.mjs` — use semantic search (when available) to inject only relevant memory entries into agent prompt, queried by task title + description. Fall back to full recall otherwise.
- [x] 4.6 Write unit tests for semantic-index.mjs — cosine similarity math, top-K selection, graceful fallback when embed.py not available
- [x] 4.7 Write integration test: record 10 memory entries, search for related query, verify relevant entries rank higher than irrelevant ones

### 5. Similarity-Based REM Sleep

- [x] 5.1 Update `rem-sleep.mjs` deduplication — add cosine similarity check (threshold >= 0.92) alongside exact match. When embeddings available, merge near-duplicates (keep newer, compost older).
- [x] 5.2 Add `--similarity` flag to rem-sleep.mjs that enables similarity-based dedup (defaults to exact-only if embeddings unavailable)
- [x] 5.3 Write test: two semantically equivalent but textually different entries are merged; two genuinely different entries are kept

### 6. Semantic Pattern Hunt

- [x] 6.1 Update `pattern-hunt.mjs` — when embeddings available, cluster review issues by cosine similarity (threshold >= 0.85) instead of keyword-only categorization
- [x] 6.2 Add cluster labeling — most representative term becomes cluster label
- [x] 6.3 Write test: "missing null check", "no undefined guard", and "unhandled nullable" are clustered together

### 7. Agent Maturation Tracking

- [x] 7.1 Add `maturation` object to `agents/templates/core.json.template` — `{ "level": 0, "weekStarted": "", "milestonesHit": [], "metrics": {} }`
- [x] 7.2 Update `cycles/weekly-review.mjs` — compute per-agent maturation metrics (corrections received, self-corrections, review severity distribution) and write to core.json maturation.metrics keyed by ISO week
- [x] 7.3 Add maturation level advancement logic to `memory-manager.mjs` — when corrections are recorded, check milestone criteria and auto-advance level (0→1 on first correction, 1→2 on first self-correction, etc.)
- [x] 7.4 Add maturation regression check to `test-behavior.mjs` — fail if correction rate increases after 2+ weeks of decline
- [x] 7.5 Update `daily-review.mjs` PM Dashboard output — add "Agent Maturation" section showing level, weeks at level, trend per agent
- [x] 7.6 Write test: maturation level advances correctly through milestones; regression is detected when corrections spike after decline

### 8. Performance Feedback

- [x] 8.1 Update `cost-tracker.mjs` — compute per-agent efficiency metrics: average tokens/task (rolling 5-task window), error rate (failed/total attempts), comparison to type average
- [x] 8.2 Update `worker.mjs` — inject efficiency metrics summary into agent prompt ("Your recent efficiency: XK tokens/task avg, Y% first-attempt success")
- [x] 8.3 Write test: efficiency metrics computed correctly from cost-log data

---

## Phase 3: Scaling & Cadence (Horizontal Expansion)

### 9. Instance Scaling

- [x] 9.1 Add `maxInstances` field support to budget.json loading in `load-config.mjs` — default 1
- [x] 9.2 Update `queue-drainer.mjs` — when assigning tasks, check unblocked task count per domain. If count > 1 and agent has maxInstances > 1, assign up to maxInstances tasks with unique instance IDs (e.g., `roy-1`, `roy-2`)
- [x] 9.3 Add file pattern conflict detection to queue-drainer — before parallel assignment, check that task file patterns (from domains.json + task metadata) don't overlap with already-claimed tasks. Serialize if overlap detected.
- [x] 9.4 Update `worker.mjs` — inject instance awareness into prompt: instance ID, total instances, other instances' tasks, file paths to avoid
- [x] 9.5 Update budget tracking — all instances share the agent type's daily token limit. Track usage per-instance but cap per-type.
- [x] 9.6 Add scale suggestion to `queue-drainer.mjs status` — when queue depth > 3 for a domain and maxInstances not reached, display suggestion
- [x] 9.7 Write test: 2 independent tasks assigned to 2 instances; 2 overlapping tasks serialized to 1 instance; budget shared correctly across instances

### 10. Execution Cadence

- [x] 10.1 Add `cadence` section support to project.json loading — `commitWindowMinutes` (default 15) and `agentOffsets` (object mapping agent names to minute offsets)
- [x] 10.2 Update `worker.mjs` — when cadence configured, inject commit timing guidance into agent prompt ("Preferred commit times: :NN, :NN, :NN, :NN")
- [x] 10.3 Update `queue-drainer.mjs status` — display next commit window per agent
- [x] 10.4 Write test: worker generates correct commit times for various offsets and window sizes

### 11. Cycle Automation

- [x] 11.1 Create `agents/templates/cron-schedule.json.template` with 4 cycle schedules (daily review, weekly pattern hunt + REM sleep, monthly audit, daily cost report)
- [x] 11.2 Update `setup.mjs` — when notification provider is OpenClaw, offer to register cron jobs. When not OpenClaw, output manual crontab recommendations.
- [x] 11.3 Create `pm/cycle-history.json` log — all automated cycle runs recorded with type, timestamp, success/failure, summary stats
- [x] 11.4 Update `daily-review.mjs` and `weekly-review.mjs` — append to cycle-history.json on completion
- [x] 11.5 Write test: cycle-history entries have correct schema; daily and weekly review append correctly

---

## Phase 4: Human-Agent Collaboration & Protection (Novel Capabilities)

### 12. Human Task Queue

- [x] 12.1 Create `agents/schemas/human-task.schema.json` (if not already created in 1.1) and `agents/templates/human-task.json.template`
- [x] 12.2 Add `tasks/human-queue/` support to `queue-drainer.mjs` — new commands: `human-status` (list pending human tasks), `human-complete <id>` (mark done, unblock dependent agent tasks)
- [x] 12.3 Update `queue-drainer.mjs status` — add "Human Tasks" section before agent tasks showing pending human tasks with urgency, age, and what they unblock
- [x] 12.4 Add human task creation capability to `worker.mjs` prompt — instruct agents to create human task files when hitting unresolvable blockers (missing credentials, design decisions, content needed)
- [x] 12.5 Update `notify.mjs` — on human task creation, immediately send notification with urgency, title, description, and unblocked tasks
- [x] 12.6 Add auto-unblock logic to `queue-drainer.mjs` — when human task completed, change all tasks in `unblocks` from "blocked" to "pending"
- [x] 12.7 Update `daily-review.mjs` PM Dashboard — add "YOUR Action Items" section at top with pending human tasks ordered by urgency
- [x] 12.8 Write test: human task created → notification sent → human completes → dependent agent tasks unblocked → tasks appear in queue

### 13. Wellness Guardrails

- [x] 13.1 Add `humanWellness` section support to project.json loading — `enabled` (bool), `dailyMaxHours` (number), `nightCutoff` (string), `breakIntervalHours` (number)
- [x] 13.2 Update `cost-tracker.mjs` — track wall-clock session duration per day (first agent spawn → last complete, with 30-min gap = new session). Store in cost-log alongside token data.
- [x] 13.3 Add wellness check to `notify.mjs` — new `wellness-check` command that reads session hours and fires alerts when thresholds exceeded: daily limit, night cutoff, break interval
- [x] 13.4 Wire wellness check into `queue-drainer.mjs` — after each task assignment, call wellness check. Send alert at most once per threshold per day.
- [x] 13.5 Ensure wellness is advisory only — queue never paused or blocked by wellness alerts
- [x] 13.6 Add weekly session hours to `cost-tracker.mjs report` output — "Human session hours this week: X"
- [x] 13.7 Write test: session hours computed correctly from timestamps; alerts fire once per threshold per day; queue not blocked

### 14. NLP Code Analysis

- [ ] 14.1 Create `agents/nlp-analyze.py` — spaCy-based script that takes changed file paths as input, extracts property accesses and method calls, compares against type definitions, flags near-misses (edit distance <= 3 AND semantic similarity >= 0.80). Output JSON report. Zero network calls.
- [ ] 14.2 Create `agents/nlp-analyzer.mjs` — Node.js wrapper that shells out to nlp-analyze.py, parses JSON output, returns structured findings. Graceful skip if spaCy not installed.
- [ ] 14.3 Integrate into `four-layer-validate.mjs` as optional Layer 2.5 — runs between Critique and Code when spaCy available. Reports "Layer 2.5 (NLP): skipped" when not.
- [ ] 14.4 Add Python requirements file `agents/requirements-nlp.txt` with spaCy + model download instructions (no OpenAI, no cloud dependencies)
- [ ] 14.5 Write test: near-miss detection works (fullName vs full_name flagged, exact match not flagged, dissimilar not flagged)

### 15. Bottleneck Detection

- [x] 15.1 Add bottleneck analysis to `daily-review.mjs` — compute: average human task wait time, tasks blocked > 24 hours, approval queue depth. If human tasks are the limiting factor (> 50% of blocked tasks are waiting on human), flag in dashboard.
- [x] 15.2 Add bottleneck notification — when human tasks have been pending > 24 hours, send notification: "Bottleneck alert: N human tasks pending > 24h. Agent work is blocked on human action."
- [x] 15.3 Write test: bottleneck detected when majority of blocked tasks await human; not detected when blocks are technical

---

## Phase 5: Integration & Validation

### 16. Cross-Cutting Integration

- [x] 16.1 Update CLAUDE.md with all new commands, config fields, and script references
- [x] 16.2 Update `framework/maturity-model.md` — add specific implementation criteria for Levels 5-6 now that they have concrete scripts
- [ ] 16.3 Update `framework/validation-patterns.md` — add Layer 2.5 (NLP) documentation
- [x] 16.4 Update `docs/safety-mechanisms.md` — add wellness guardrails and bottleneck detection
- [x] 16.5 Update `docs/troubleshooting.md` — add troubleshooting for new features (embedding model not found, spaCy not installed, human task stuck, instance conflict)
- [x] 16.6 Update `setup.mjs` — scaffold new config fields (humanWellness, cadence, maxInstances, permissions) in project.json and budget.json during setup
- [ ] 16.7 Run full behavior test suite (`test-behavior.mjs`) — all existing + new checks must pass

### 17. Backlog Cleanup

- [x] 17.1 Remove items 1-10 from `openspec/BACKLOG.md` (promoted to this change) — leave only items that were not addressed
- [x] 17.2 Update memory file `agentic-sdlc-maturity.md` if it exists, or ensure MEMORY.md index is current
