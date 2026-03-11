## 1. Foundation Fixes (OpenSpec Completeness)

- [x] 1.1 Create `status.json` for each active change in `openspec/changes/*/` with status, phase, created, lastUpdated fields (backfill from existing artifacts)
- [x] 1.2 Create `status.json` for each archived change in `openspec/archive/*/`
- [x] 1.3 Add `## Value Analysis` section to each existing `proposal.md` in `openspec/changes/*/`
- [x] 1.4 Update CLAUDE.md OpenSpec workflow documentation to require Value Analysis in future proposals

## 2. Task Queue Schema Extensions

- [x] 2.1 Add `priority` (default "MEDIUM") and `estimatedTokens` (default null) fields to all 42 task files in `tasks/queue/`
- [x] 2.2 Add `claimedBy` (default null) and `claimedAt` (default null) fields to all 42 task files
- [x] 2.3 Update `queue-drainer.mjs` to sort tasks by priority (CRITICAL > HIGH > MEDIUM > LOW) before assignment
- [x] 2.4 Add `claim <task-id> <agent>` and `release <task-id>` commands to queue-drainer.mjs
- [x] 2.5 Update `run --parallel` to skip tasks with non-null `claimedBy`
- [x] 2.6 Add stale claim detection to `status` command (flag tasks claimed > 30 min ago still in_progress)
- [x] 2.7 Create `tasks/completed/` directory
- [x] 2.8 Add `archive` command to queue-drainer.mjs that moves completed tasks from `queue/` to `completed/`
- [x] 2.9 Update `status` command to show priority and claim info, and count archived tasks
- [x] 2.10 Run `archive` command to clean up current completed tasks

## 3. Integration Tests

- [x] 3.1 Create `LinguaFlow/__tests__/integration/` directory
- [x] 3.2 Add `"test:integration": "jest --testPathPattern='__tests__/integration'"` to `LinguaFlow/package.json`
- [x] 3.3 Write at least one integration test (e.g., service-to-store interaction)
- [x] 3.4 Verify `npm run test:integration` passes

## 4. Defeat Tests

- [x] 4.1 Create `LinguaFlow/__tests__/defeat/` directory
- [x] 4.2 Add `"test:defeat": "jest --testPathPattern='__tests__/defeat'"` to `LinguaFlow/package.json`
- [x] 4.3 Write defeat test: no `: any` type annotations in `src/` (excluding documented exceptions)
- [x] 4.4 Write defeat test: no `console.log` in `src/` production code
- [x] 4.5 Write defeat test: service files under 150 lines
- [x] 4.6 Write defeat test: screen files under 200 lines
- [x] 4.7 Write defeat test: service async functions return `{ data, error }` pattern
- [x] 4.8 Verify `npm run test:defeat` passes (fix any existing violations first)

## 5. Agent Failure Memories

- [x] 5.1 Review git log and Richmond review history for past agent corrections
- [x] 5.2 Add failure memories to `agents/roy/memory/core.json` (at least 1-2 with id, date, description, lesson, severity)
- [x] 5.3 Add failure memories to `agents/moss/memory/core.json`
- [x] 5.4 Add failure memories to `agents/jen/memory/core.json`
- [x] 5.5 Add failure memories to `agents/richmond/memory/core.json`
- [x] 5.6 Add failure memories to `agents/denholm/memory/core.json`
- [x] 5.7 Add failure memories to `agents/douglas/memory/core.json`

## 6. REM Sleep Automation

- [x] 6.1 Create `agents/rem-sleep.mjs` that runs consolidation for all 6 agents
- [x] 6.2 Add age-based promotion logic: recent entries > 7 days old → medium-term or compost
- [x] 6.3 Add age-based promotion logic: medium-term entries > 30 days old → long-term or compost
- [x] 6.4 Add `--dry-run` flag that reports what would change without modifying files
- [x] 6.5 Register weekly OpenClaw cron job (Sunday 23:00) for `node agents/rem-sleep.mjs`
- [x] 6.6 Test dry run: `node agents/rem-sleep.mjs --dry-run`

## 7. Agent Versioning

- [x] 7.1 Add version header `<!-- version: 1.0.0 | date: 2026-03-02 -->` to all 6 AGENT.md files
- [x] 7.2 Create `agents/versions/` directory
- [x] 7.3 Create `agents/version-snapshot.mjs` with `snapshot`, `list`, and `restore <date>` commands
- [x] 7.4 Take initial snapshot: `node agents/version-snapshot.mjs snapshot`
- [x] 7.5 Create `agents/migrate-memory.mjs` with `--check` (report-only) and `--apply` modes
- [x] 7.6 Test check mode: `node agents/migrate-memory.mjs --check`

## 8. Agent Budgets and Cost Tracking

- [x] 8.1 Create `agents/budget.json` with per-agent daily token limits and model preferences
- [x] 8.2 Add budget check logic to queue-drainer.mjs (warn + skip if agent over budget)
- [x] 8.3 Add `conservationMode` flag to budget.json that halves all limits when true
- [x] 8.4 Create `agents/cost-tracker.mjs` with `record` and `report` commands
- [x] 8.5 Create `agents/cost-log.json` (empty array to start)
- [x] 8.6 Register daily OpenClaw cron job (06:00) for `node agents/cost-tracker.mjs report`
- [x] 8.7 Test report: `node agents/cost-tracker.mjs report`

## 9. Behavior Tests

- [x] 9.1 Create `agents/tests/` directory
- [x] 9.2 Create `agents/test-behavior.mjs` with checks for all 6 agents
- [x] 9.3 Add check: Roy's AGENT.md mentions `{ data, error }` pattern
- [x] 9.4 Add check: all agents have at least 1 failure memory in core.json
- [x] 9.5 Add check: Richmond's checklist covers all defeat test categories
- [x] 9.6 Add check: all AGENT.md files include memory read instructions
- [x] 9.7 Add `--dry-run` flag support
- [x] 9.8 Test: `node agents/test-behavior.mjs --dry-run`

## 10. PM Dashboard Refresh

- [x] 10.1 Update `pm/DASHBOARD.md` test counts to 2,204 tests / 186 suites
- [x] 10.2 Add "Last Refreshed" timestamp field
- [x] 10.3 Add sections for new systems: defeat tests, agent versioning, REM sleep, budgets, behavior tests, cost tracking
- [x] 10.4 Update agent status table with current state
- [x] 10.5 Add cost tracking summary section (placeholder until data accumulates)
