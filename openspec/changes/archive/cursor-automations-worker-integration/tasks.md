# Tasks: cursor-automations-worker-integration

**Date**: 2026-05-21
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: tasks

---

## Overview

Implement the two `.cursor/rules/*.mdc` files, the user-facing playbook, and update README + AGENTS.md cross-links. Smoke-test that `setup.mjs --yes` propagates the new rule files to new projects.

All work is in this Claude session (no autonomous bot work needed — content + small smoke test). Estimated effort: ~90 minutes.

---

## Prerequisites

- [x] proposal.md approved
- [x] design.md written
- [x] specs/cursor-automation-agent-behavior.md written
- [x] `.cursor/rules/` already exists in framework repo (3 files present)
- [x] setup.mjs already copies `.cursor/` recursively (commit `4c3cff5`)

---

## Work Stream Summary

| Stream | Agent | Tasks | Parallel |
|---|---|---|---|
| Rule files | Claude (interactive) | T-101, T-102 | Yes — independent files |
| Playbook | Claude (interactive) | T-103 | After T-101, T-102 |
| Cross-links | Claude (interactive) | T-104 | After T-103 |
| Smoke test | Claude (interactive) | T-105 | After T-101, T-102 |
| Backlog cleanup | Claude (interactive) | T-106 | Last |

---

## Implementation Tasks

### Phase 1: Rule Files

- [ ] **T-101**: Write `.cursor/rules/sdlc-task-execution.mdc`
  - File: `.cursor/rules/sdlc-task-execution.mdc`
  - Spec: REQ-001
  - Frontmatter: `description: "How to claim and execute a task from tasks/queue/"`, `globs: ["tasks/queue/**", "agents/**"]`, `alwaysApply: false`
  - Body: 7-step micro cycle, branch naming, test gate, failure path
  - Target: <300 lines

- [ ] **T-102**: Write `.cursor/rules/sdlc-housekeeping.mdc`
  - File: `.cursor/rules/sdlc-housekeeping.mdc`
  - Spec: REQ-002
  - Frontmatter: `description: "Run a named housekeeping cycle"`, `globs: ["pm/auto/**", "agents/cycles/**"]`, `alwaysApply: false`
  - Body: cycle name → CLI mapping table, output artifact convention
  - Target: <250 lines

### Phase 2: User Playbook

- [ ] **T-103**: Write `docs/cursor-automations-playbook.md`
  - File: `docs/cursor-automations-playbook.md`
  - Spec: REQ-003
  - Content: 7 Automations with name, cron, prompt, tools, branch policy; "First time you see a PR" subsection
  - Target: <500 lines
  - Parallel: blocked-by T-101, T-102 (references their content)

### Phase 3: Cross-Links

- [ ] **T-104**: Update README.md and AGENTS.md to link to the playbook
  - Files: `README.md`, `AGENTS.md`
  - Spec: REQ-004
  - README: Step 3 table "Cursor Pro+" row gets a second link to the playbook
  - AGENTS.md: Cursor Pro+ section mentions the playbook
  - Parallel: blocked-by T-103

### Phase 4: Smoke Test

- [ ] **T-105**: Verify setup.mjs propagates new rule files to a fresh project
  - Command: `rm -rf /tmp/cursor-auto-test && mkdir -p /tmp/cursor-auto-test && echo '{"name":"x"}' > /tmp/cursor-auto-test/package.json && touch /tmp/cursor-auto-test/README.md && node ~/agentic-sdlc/setup.mjs --yes --dir /tmp/cursor-auto-test`
  - Verify: `ls /tmp/cursor-auto-test/.cursor/rules/sdlc-task-execution.mdc /tmp/cursor-auto-test/.cursor/rules/sdlc-housekeeping.mdc` returns both files
  - Spec: REQ-005
  - Parallel: blocked-by T-101, T-102

### Phase 5: Backlog Cleanup + Archive

- [ ] **T-106**: Move #17 from "Remaining Ideas" to "Promoted to Changes" in BACKLOG.md
  - File: `openspec/BACKLOG.md`
  - Add a row to the "Promoted to Changes" table referencing `openspec/changes/cursor-automations-worker-integration/`
  - Remove the "### 17." block from "Remaining Ideas"

- [ ] **T-107**: Update status.json to `complete`, archive the change
  - File: `openspec/changes/cursor-automations-worker-integration/status.json`
  - Move: `mv openspec/changes/cursor-automations-worker-integration openspec/changes/archive/cursor-automations-worker-integration`
  - Defer the manual `mv` until after T-106 is committed and the smoke test passes

---

## Completion Criteria

- [ ] All T-101..T-106 tasks checked off
- [ ] Smoke test (T-105) passes — both new `.mdc` files in target project
- [ ] Backlog #17 marked promoted in `openspec/BACKLOG.md`
- [ ] Commit + push to origin/main
- [ ] (Deferred until Bryce verifies on his Cursor account): Create the 7 Automations in cursor.com/automations per the playbook; observe one fire successfully

---

## Notes

**Why this change is shippable without Level 6:** Cursor Automations operate on the existing `tasks/queue/*.json` queue format and the existing framework scripts. None of the Level 6 work (systemd timers, multi-project-orchestrator, projects.json) is required. The integration is fully usable today with the framework in its current state (Level 3 Orchestrated).

**Post-merge observation period:** Once Bryce creates the Automations in his Cursor UI, the first 7 days will produce real data on (a) whether auto mode picks adequate models for the work, (b) failure rates, (c) whether the rule files need tuning. Plan to revisit the rule files after one week of real usage.
