# SDLC Operational Activation — Close All Maturity Gaps

## Why

The Agentic SDLC infrastructure is fully built (Level 7 tooling) but operationally idle (Level 2-3). All scripts, crons, memory systems, and quality gates exist — but the system isn't functioning as designed. The gap analysis (2026-03-11) identified 6 SDLC gaps and 8 app gaps. This change closes the SDLC gaps and the immediately actionable app gaps.

## Gap Inventory

### SDLC Gaps (Development System)

| # | Gap | Infrastructure | Operational? |
|---|-----|---------------|-------------|
| S1 | **Pattern hunt doesn't auto-generate defeat tests** | `pattern-hunt.mjs` runs weekly, identifies patterns | Reports only — no new defeat tests generated |
| S2 | **Behavior tests don't gate deploys** | 34 behavior checks pass | Not in `deploy.sh` — deploys proceed regardless |
| S3 | **Defeat tests don't gate deploys** | 11 defeat tests pass | Not in `deploy.sh` — deploys proceed regardless |
| S4 | **No autonomous task dispatch** | Queue drainer exists, crons exist | Queue is empty — no cron seeds tasks from OpenSpec |
| S5 | **REM Sleep runs but nothing to consolidate** | Cron registered, script works | Consequence of S4 — agents aren't producing memories |
| S6 | **No cross-agent learning** | Handoff templates exist | Consequence of S4 — agents aren't running |

### App Gaps (LinguaFlow Product)

| # | Gap | Status |
|---|-----|--------|
| A1 | **`maturity-hardening` not shipped** | Tasks done, uncommitted on branch |
| A2 | **`bug-fixes-march` not started** | Separate OpenSpec change exists, 0% |
| A3 | **External services in demo mode** | Bryce dependency — needs API keys |
| A4-A8 | **5 feature changes not started** | Separate OpenSpec changes exist, execution plan defined |

### What This Change Closes

- **S1**: Enhance `pattern-hunt.mjs` to auto-append new defeat tests when recurring patterns are found
- **S2**: Add behavior test gate to `deploy.sh` (Step 1b, after unit tests)
- **S3**: Add defeat test gate to `deploy.sh` (Step 1c, after behavior tests)
- **S4**: Create `seed-queue-from-openspec.mjs` script + register OpenClaw cron to auto-seed tasks from active OpenSpec task files
- **S5**: Validated as working (REM sleep runs correctly — empty output is expected when agents haven't produced recent memories)
- **S6**: Deferred — requires sustained agent activity from S4 fix first
- **A1**: Commit and deploy `maturity-hardening` changes

### What This Change Does NOT Close (and why)

- **A2** (`bug-fixes-march`): Already has its own OpenSpec change — execute separately after this ships
- **A3** (external services): Blocked on Bryce providing API keys — will WhatsApp to ask
- **A4-A8** (feature work): Already have OpenSpec changes + execution plan — execute after A1 and A2

## What Changes

### 1. Pattern Hunt Auto-Generation (S1)

Enhance `agents/pattern-hunt.mjs` to:
- When a recurring pattern is found (≥3 occurrences), check if a defeat test already covers it
- If no defeat test exists, generate one and append it to `__tests__/defeat/anti-patterns.test.ts`
- Write a summary to `agents/pattern-hunt-output.json` so the cron's work is auditable
- Log new defeat tests to Matrix `#reviews` channel

### 2. Deploy Quality Gates (S2 + S3)

Add to `deploy.sh` between Step 1 (unit tests) and Step 2 (build):
- **Step 1b**: Run `node agents/test-behavior.mjs` — abort deploy if any check fails
- **Step 1c**: Run `npm run test:defeat` — abort deploy if any anti-pattern test fails

### 3. Autonomous Task Seeding (S4)

Create `agents/seed-queue-from-openspec.mjs` that:
- Reads active OpenSpec `tasks.md` files
- Parses task lists (checked = done, unchecked = pending)
- For each pending task not already in `tasks/queue/`, creates a task JSON with priority, agent assignment (from domain patterns), and token estimate
- Registers an OpenClaw cron (`task-seed-daily`) to run at 22:00 (before overnight work window)

### 4. Ship Maturity Hardening (A1)

- Commit the uncommitted `maturity-hardening` changes
- Deploy via `deploy.sh --skip-git` (we'll push separately)
- Verify on production

## Capabilities

### New Capabilities
- `pattern-hunt-auto-defeat`: Automated defeat test generation from recurring pattern detection
- `task-seed-from-openspec`: Automated task queue population from OpenSpec task files
- `deploy-quality-gates`: Behavior + defeat test gates in deploy pipeline

### Modified Capabilities
- `deploy-pipeline`: Enhanced with quality gates (Steps 1b, 1c)
- `pattern-hunt`: Enhanced with auto-generation (was report-only)

## Impact

### Code
- `agents/pattern-hunt.mjs` — add auto-generation logic
- `LinguaFlow/scripts/deploy.sh` — add Steps 1b, 1c
- `agents/seed-queue-from-openspec.mjs` — new script
- OpenClaw cron registration for task-seed-daily

### Dependencies
- None new

### Risk
- Low — all changes are additive or tighten existing gates
- Pattern hunt auto-generation only appends to existing test file
- Deploy gates can be bypassed with `--skip-tests` in emergencies

## Value Analysis

- **Who benefits**: The entire development system — agents get work, quality gates prevent regressions, patterns get defeated automatically
- **What happens if we don't build this**: SDLC stays at Level 2-3 operationally despite Level 7 tooling. Agents sit idle. Patterns recur. Deploys ship without quality validation.
- **Success metrics**:
  - Pattern hunt generates at least 1 new defeat test (console.log pattern has 5 occurrences, no existing defeat test covers new-file detection properly)
  - Deploy pipeline aborts on behavior test failure (verified by intentional failure)
  - Deploy pipeline aborts on defeat test failure (verified by intentional failure)
  - Task queue populated with ≥1 task from OpenSpec after seed script runs
  - `maturity-hardening` deployed and verified on production
