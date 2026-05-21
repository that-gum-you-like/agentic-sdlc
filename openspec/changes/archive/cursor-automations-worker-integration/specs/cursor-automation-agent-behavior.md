# Spec: cursor-automation-agent-behavior

**Date**: 2026-05-21
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: specs
**Capability**: NEW

---

## Overview

This capability defines the expected behavior of a Cursor Background Agent spawned by a Cursor Automation in a project that has the framework installed. It covers two rule files (`sdlc-task-execution.mdc`, `sdlc-housekeeping.mdc`) and one user-facing playbook (`docs/cursor-automations-playbook.md`). The rule files constrain the agent to the SDLC workflow; the playbook tells the user how to create the Automations in Cursor's UI.

---

## Requirements

### REQ-001: sdlc-task-execution.mdc Rule File

**Statement:** The system shall provide `.cursor/rules/sdlc-task-execution.mdc` which directs a Cursor Background Agent through the full micro cycle when invoked with a task-execution goal.

**Acceptance Criteria:**
- [ ] File exists at `.cursor/rules/sdlc-task-execution.mdc`
- [ ] Frontmatter declares: `description: "How to claim and execute a task from tasks/queue/"`, `globs: ["tasks/queue/**", "agents/**"]`, `alwaysApply: false`
- [ ] Body covers the 7-step micro cycle: pre-flight → claim → read memory → implement → test → commit on branch → push
- [ ] Branch naming convention `agent/cursor/<task-id>` is explicit
- [ ] Test-gate is non-negotiable: tests must pass before commit
- [ ] Failure path documented: 3 attempts → release task → flag blocked
- [ ] No model pinning (Cursor auto mode handles selection)
- [ ] File is <300 lines (keeps Background Agent context budget reasonable)

**Dependencies:** none

**Complexity:** M

**Value:** Critical

**Notes:** This file is what makes the autonomous loop possible. Without it, Background Agents have no idea how to interact with the queue.

---

### REQ-002: sdlc-housekeeping.mdc Rule File

**Statement:** The system shall provide `.cursor/rules/sdlc-housekeeping.mdc` which directs a Cursor Background Agent to run a named housekeeping cycle and commit any output artifacts.

**Acceptance Criteria:**
- [ ] File exists at `.cursor/rules/sdlc-housekeeping.mdc`
- [ ] Frontmatter declares: `description: "Run a named housekeeping cycle (daily-review, weekly-review, rem-sleep, pattern-hunt, cost-tracker, alignment-monitor, capability-monitor) and commit output"`, `globs: ["pm/auto/**", "agents/cycles/**"]`, `alwaysApply: false`
- [ ] Body has a table of cycle name → exact CLI command
- [ ] Output artifact convention: commit to `pm/auto/<cycle>-<YYYY-MM-DD>.md` only if cycle produces text output
- [ ] Empty-output cycles skip the commit, log a no-op message
- [ ] File is <250 lines

**Dependencies:** none

**Complexity:** S

**Value:** High

**Notes:** Housekeeping cycles are lower-stakes than task execution — they read state and write reports, no source code changes.

---

### REQ-003: docs/cursor-automations-playbook.md

**Statement:** The system shall provide `docs/cursor-automations-playbook.md` documenting how to create the 7 recommended Automations in Cursor's UI.

**Acceptance Criteria:**
- [ ] File exists at `docs/cursor-automations-playbook.md`
- [ ] Lists 7 recommended Automations, each with: name, trigger (cron expression off-the-hour), initial prompt, tools to enable, branch policy
- [ ] The 7 cycles are: queue-drain (hourly business hours), daily-review (22:07), weekly-review (Sun 23:43), rem-sleep (Sun 23:53), pattern-hunt (Sun 23:33), cost-tracker (daily 06:23), alignment-monitor (daily 12:33)
- [ ] Each Automation entry includes the exact "initial prompt" string the user pastes into Cursor's UI
- [ ] Has a "First time you see a PR from cursor-agent" subsection covering review expectations
- [ ] Date-stamped (2026-05-21) and notes Cursor version assumptions
- [ ] File is <500 lines

**Dependencies:** REQ-001, REQ-002

**Complexity:** M

**Value:** Critical

**Notes:** Playbook is the only piece the user touches. If unclear, Automations don't get created and the integration delivers zero value.

---

### REQ-004: README + AGENTS.md Cross-Links

**Statement:** The system shall update `README.md` and `AGENTS.md` to link to the new playbook from the Cursor Pro+ sections.

**Acceptance Criteria:**
- [ ] `README.md` "Cursor Pro+" row in the Step 3 table links to `docs/cursor-automations-playbook.md` (in addition to existing `docs/cursor-background-agents.md` link)
- [ ] `AGENTS.md` Cursor Pro+ section mentions the playbook
- [ ] Both links are relative paths (no absolute URLs)

**Dependencies:** REQ-003

**Complexity:** S

**Value:** Medium

**Notes:** Discoverability — the playbook only helps if users find it.

---

### REQ-005: setup.mjs Distribution Verification

**Statement:** The system shall ensure that running `setup.mjs --yes --dir <new-project>` copies the new `.mdc` files into the target project alongside the existing rule files.

**Acceptance Criteria:**
- [ ] Smoke test: `setup.mjs --yes --dir /tmp/cursor-auto-test` results in `/tmp/cursor-auto-test/.cursor/rules/sdlc-task-execution.mdc` and `/tmp/cursor-auto-test/.cursor/rules/sdlc-housekeeping.mdc` existing
- [ ] No `setup.mjs` code change required (the existing 8c block in commit `4c3cff5` copies the entire `.cursor/` directory recursively)
- [ ] Verified empirically post-implementation

**Dependencies:** REQ-001, REQ-002

**Complexity:** S

**Value:** Critical

**Notes:** If new `.mdc` files don't propagate to new projects, the integration only works on the framework repo itself — not on user projects.

---

## Acceptance Criteria (Scenarios)

### Scenario 1: Cursor Automation Fires Queue-Drain

**Verifies:** REQ-001, REQ-003

**WHEN** A Cursor Automation configured per the playbook fires its hourly queue-drain trigger, and `tasks/queue/` has at least one pending task

**THEN** A Cursor Background Agent spawns in a cloud sandbox, loads `.cursor/rules/sdlc-task-execution.mdc`, runs `queue-drainer.mjs status`, claims the highest-priority unblocked task

**AND** The agent executes the micro cycle (read memory → implement → write tests → run tests)

**AND** Tests pass → agent commits to branch `agent/cursor/<task-id>`, pushes, the user sees the new branch in their git workflow

---

### Scenario 2: Background Agent Runs Daily Review

**Verifies:** REQ-002, REQ-003

**WHEN** A Cursor Automation configured per the playbook fires daily at 22:07

**THEN** The Background Agent loads `.cursor/rules/sdlc-housekeeping.mdc`, runs `node ~/agentic-sdlc/agents/cycles/daily-review.mjs`

**AND** Captures the output, writes it to `pm/auto/daily-review-<YYYY-MM-DD>.md`, commits to a branch (or main, per playbook policy), pushes

**AND** No source code outside `pm/auto/` is modified

---

### Scenario 3: Setup Copies Rule Files to New Project

**Verifies:** REQ-005

**WHEN** A user runs `node ~/agentic-sdlc/setup.mjs --yes --dir /tmp/new-project`

**THEN** `/tmp/new-project/.cursor/rules/sdlc-task-execution.mdc` exists

**AND** `/tmp/new-project/.cursor/rules/sdlc-housekeeping.mdc` exists

**AND** All other `.cursor/rules/*.mdc` files also exist (no regression)

---

### Scenario 4: Error Case — Test Failure Blocks Commit

**Verifies:** REQ-001

**WHEN** A Background Agent implements a task, runs the test command, and a test fails

**THEN** The agent does NOT commit the change

**AND** It increments the task's attempt counter

**AND** If attempts >= 3, it releases the task and updates the task JSON `status: "blocked"` with reason

**AND** The branch `agent/cursor/<task-id>` is either deleted or left with the partial work (per playbook policy)

---

### Scenario 5: Edge Case — Concurrent Queue-Drains Don't Double-Execute

**Verifies:** REQ-001

**WHEN** Two queue-drain Automations fire within the same minute (e.g. a manual fire and the scheduled one overlap)

**THEN** Both spawn Background Agents

**AND** Both run `queue-drainer.mjs claim`

**AND** Exactly one succeeds (atomic file move with NX flag)

**AND** The losing agent logs the claim failure, retries with next-highest task or exits cleanly with no error

---

## Invariants

- Background Agents NEVER commit directly to main; always to `agent/cursor/<task-id>` (task work) or `agent/cursor/<cycle>-<date>` (housekeeping)
- Background Agents NEVER skip the test gate before committing source code changes
- Housekeeping cycles that produce no output do not create empty commits
- Rule files do not pin a specific LLM model (Cursor auto mode handles selection)
- The playbook never instructs the user to disable safety features (memories, MCP tool restrictions, etc.)

---

## Out of Scope

- Programmatic Automation creation (Cursor doesn't expose this API in Pro+)
- Cross-project Automations (Cursor Automations are repo-scoped)
- Replacing `autonomous-launcher.sh` (Level 6 concern)
- Per-task `workerTier` field (Level 6 concern)
- MCP server integration for framework scripts (future change)

---

## Test Mapping

| Scenario | Test File / Verification | Test Name |
|---|---|---|
| Scenario 1 | Manual (after Bryce creates the Automation) | "queue-drain Automation produces a commit within 60min" |
| Scenario 2 | Manual (after Bryce creates the Automation) | "daily-review Automation commits a pm/auto/ report" |
| Scenario 3 | `tests/cursor-rules-propagation.smoke.test.sh` | "setup --yes copies sdlc-*.mdc to target" |
| Scenario 4 | Manual / behavior observed in first week | "agent flags task blocked after 3 test failures" |
| Scenario 5 | `tests/queue-claim-atomicity.test.mjs` | "concurrent claims yield exactly one winner" |
