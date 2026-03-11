## Why

An audit of LinguaFlow's Agentic SDLC against the full lesson plan (Hours 1–7) reveals 21 gaps that prevent advancement beyond Phase 4 maturity. The system is solid through Phases 1–3 (Foundation, Automation, Scale) but lacks infrastructure for Quality hardening, agent Evolution, and Continuous Improvement. Without closing these gaps, agents cannot self-correct, anti-patterns recur without detection, costs go unmonitored, and the system cannot improve without manual intervention. This is infrastructure/tooling work only — no app feature changes.

## What Changes

- Add `status.json` to all OpenSpec change directories for machine-readable progress tracking
- Add Value Analysis sections to all existing proposals; update CLAUDE.md so future proposals require it
- Add `priority` (CRITICAL/HIGH/MEDIUM/LOW) and `estimatedTokens` fields to task queue schema
- Add claim/release system to queue drainer for safe parallel agent execution
- Create `tasks/completed/` archive and archive command for finished tasks
- Add `test:integration` test tier with initial integration tests
- Populate agent failure memories in all 6 agents' `core.json` files
- Create defeat tests that permanently prevent known anti-patterns from recurring
- Automate REM Sleep memory consolidation via weekly OpenClaw cron
- Add agent versioning with version headers, snapshot script, and rollback capability
- Add memory migration system for agent version upgrades
- Create per-agent token budgets with circuit breakers and conservation mode
- Add behavior tests that validate agent decision-making quality on prompt changes
- Create cost tracking and monitoring system with daily reports
- Refresh PM Dashboard with current data and all new systems

## Capabilities

### New Capabilities
- `openspec-status-tracking`: Machine-readable `status.json` files in every OpenSpec change directory with status, phase, and timestamp fields
- `task-priority-system`: Priority levels (CRITICAL→LOW), token estimates, and claim/release mechanism on the task queue, with completed task archival
- `defeat-tests`: Jest test suite in `__tests__/defeat/` that catches recurring agent anti-patterns (no `any` types, no `console.log`, file size limits, `{data,error}` pattern enforcement)
- `integration-tests`: Dedicated `test:integration` tier bridging unit and e2e tests
- `agent-versioning`: Version headers in AGENT.md files, snapshot script for rollback, memory migration on version changes
- `rem-sleep-automation`: Automated weekly memory consolidation across all agents (recent→medium-term→long-term→compost promotion)
- `agent-budgets`: Per-agent daily token limits, circuit breakers, conservation mode trigger, cost logging and reporting
- `behavior-tests`: Test framework validating agent decision-making quality against expected behaviors when prompts change

### Modified Capabilities
- None — no existing spec-level requirements are changing

## Impact

- **Agent tooling** (`agents/`): queue-drainer.mjs gains priority sorting, claim/release, archive, budget enforcement. New scripts: rem-sleep.mjs, version-snapshot.mjs, migrate-memory.mjs, cost-tracker.mjs, test-behavior.mjs, budget.json
- **Agent memory** (`agents/*/memory/core.json`): All 6 agents get failure memories populated
- **Agent prompts** (`agents/*/AGENT.md`): Version headers added
- **Task queue** (`tasks/queue/*.json`): Schema extended with priority, estimatedTokens, claimedBy, claimedAt fields
- **Task archive** (`tasks/completed/`): New directory for finished tasks
- **Testing** (`LinguaFlow/__tests__/`): New `integration/` and `defeat/` directories, new package.json scripts
- **OpenSpec** (`openspec/changes/*/`): status.json added to all changes, Value Analysis added to all proposals
- **Project docs** (`CLAUDE.md`, `pm/DASHBOARD.md`): Updated with new systems and current metrics
- **OpenClaw cron**: Two new scheduled jobs (weekly REM sleep, daily cost report)

## Value Analysis

**Who benefits:**
- Bryce (project owner): Visibility into agent costs, behavior quality, and system health without manual auditing
- Agents (Roy, Moss, Jen, Richmond, Denholm, Douglas): Self-correction from failure memories, cleaner memory via REM sleep, safer parallel execution via claims
- Future projects: All tooling patterns established here become the template for every new project

**What happens if we don't build this:**
- Anti-patterns recur silently with no automated detection
- Agent memories grow unbounded (no consolidation)
- No cost visibility — runaway token usage goes unnoticed
- Prompt changes can degrade agent quality with no regression detection
- Parallel agents can claim the same task simultaneously

**Success metrics:**
- All 14 verification checks pass (see plan)
- Defeat tests catch at least 5 known anti-patterns
- REM sleep cron runs weekly without manual intervention
- Cost reports generate daily
- Every OpenSpec change has a status.json readable by any agent
