# Design: cursor-automations-worker-integration

**Date**: 2026-05-21
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: design

---

## Context

### Current State

- Cursor Pro+ ships Cloud Agents (Background Agents) and Automations as a UI feature (cursor.com/automations, NOT file-based)
- Cursor Background Agents in cloud sandboxes auto-load `.cursorrules` and `.cursor/rules/*.mdc` from the repo just like the foreground IDE
- `~/agentic-sdlc/.cursor/rules/` has 3 rule files (agentic-sdlc.mdc, azure-foundry.mdc, openspec-workflow.mdc)
- `setup.mjs` (post commit `4c3cff5`) copies `.cursor/rules/` to new projects on bootstrap
- Framework scripts (`queue-drainer.mjs`, `cycles/daily-review.mjs`, etc.) are CLI-invocable and zero-dep — runnable in any Node 18+ sandbox

### Problem Restatement

Add two rule files that constrain Cursor Background Agents to the SDLC, and a UI playbook for users to wire up Automations that fire those agents on schedule.

---

## Goals

- A Cursor Background Agent fired from any Automation can correctly: claim a task, run the micro cycle, commit on a feature branch, open a PR (or push to a designated branch)
- The user can create the 7 recommended Automations in Cursor's UI in <15 minutes following the playbook
- Distribution requires no new setup.mjs changes — existing `.cursor/` copy block carries the new files
- The rule files are tool-agnostic enough to be useful outside Automations too (manual Background Agent invocation should also work)
- The playbook is durable to minor Cursor UI changes (describes intent, not exact pixel locations)

## Non-Goals

- File-based Automation definitions (`.cursor/automations/*.yaml`) — Cursor doesn't support this
- Auto-create Automations programmatically — Cursor doesn't expose an API for this in Pro+
- Integration with Level-6 multi-project-orchestrator (deferred until Level 6 ships)
- Per-task `workerTier` selection (deferred until Level 6 ships)
- Replacing local development workflow — this is for autonomous loop, foreground Cursor work is unchanged

---

## Design

### Overview

Two `.cursor/rules/*.mdc` files plus one `docs/cursor-automations-playbook.md`:

1. `sdlc-task-execution.mdc` — applies when the agent's session goal mentions "task", "queue", or "claim". Provides the exact micro cycle steps with command-by-command instructions.
2. `sdlc-housekeeping.mdc` — applies when the session goal mentions any housekeeping cycle name (queue-drain, daily-review, weekly-review, rem-sleep, pattern-hunt, cost-tracker, alignment-monitor, capability-monitor). Provides the cycle-specific command to run.
3. `docs/cursor-automations-playbook.md` — user-facing setup guide for the 7 recommended Automations.

Both rule files use Cursor's `description:` + `globs:` + `alwaysApply: false` frontmatter so they auto-attach when relevant, not on every turn. The foreground Cursor IDE is unaffected by their presence (they're context-scoped).

### Components

#### sdlc-task-execution.mdc

**File**: `.cursor/rules/sdlc-task-execution.mdc`

Auto-attached when the agent's task includes keywords: `queue`, `task`, `claim`, `drain`, `execute`. Provides:
- Pre-flight: read `agents/project.json`, run `node ~/agentic-sdlc/agents/queue-drainer.mjs status`
- Claim sequence: pick highest-priority unblocked task, run `claim` CLI
- Micro cycle: read agent memory (core, long-term, medium-term) → implement → write tests → run tests → commit on branch
- Branch convention: `agent/cursor/<task-id>` (so it's visible in branch list as a Cursor agent's work)
- Test gate: tests must pass before commit; on failure, increment attempt counter and release task if attempts >= 3
- Memory write: append a recent.json entry summarizing the task outcome
- Push + flag: push the branch; the user (or a separate Automation) opens the PR

#### sdlc-housekeeping.mdc

**File**: `.cursor/rules/sdlc-housekeeping.mdc`

Auto-attached for housekeeping cycle keywords. Provides:
- For each cycle name → exact script invocation:
  - `queue-drain` → `node ~/agentic-sdlc/agents/queue-drainer.mjs run` (and then follow sdlc-task-execution.mdc)
  - `daily-review` → `node ~/agentic-sdlc/agents/cycles/daily-review.mjs`
  - `weekly-review` → `node ~/agentic-sdlc/agents/cycles/weekly-review.mjs`
  - `rem-sleep` → `node ~/agentic-sdlc/agents/rem-sleep.mjs`
  - `pattern-hunt` → `node ~/agentic-sdlc/agents/pattern-hunt.mjs`
  - `cost-tracker` → `node ~/agentic-sdlc/agents/cost-tracker.mjs report`
  - `alignment-monitor` → `node ~/agentic-sdlc/agents/alignment-monitor.mjs`
  - `capability-monitor` → `node ~/agentic-sdlc/agents/capability-monitor.mjs check`
- Each invocation includes: run command, commit any output artifacts to a `pm/auto/<cycle>-<date>.md` file if the cycle produces a report, push to main
- Cycle outputs that don't produce artifacts (capability-monitor with no drift): no commit, just log the no-op

#### docs/cursor-automations-playbook.md

**File**: `docs/cursor-automations-playbook.md`

User-facing setup guide. 7 recommended Automations, each with:
- Name (suggested)
- Trigger (schedule cron expression, off-the-hour)
- Action: "Start a cloud agent in this repo"
- Initial prompt (the seed message the agent reads first)
- Tools to enable (typically just file system + bash)
- Branch policy (commit to feature branch vs. main)

Plus a "First time you see a PR from cursor-agent" subsection — what to expect, how to review, when to merge.

### Data Flow

```
User opens cursor.com/automations
  ↓
Creates 7 Automations following docs/cursor-automations-playbook.md
  ↓ (later, on schedule)
Cron-trigger fires (e.g. hourly at :13)
  ↓
Cursor spawns Cloud Agent in sandbox, clones user's repo, loads .cursor/rules/*.mdc
  ↓
Agent reads its prompt: "Run a queue-drain cycle in this repo"
  ↓
sdlc-housekeeping.mdc auto-attaches (keyword match: "queue-drain")
  ↓
Agent runs `queue-drainer.mjs status`, sees pending tasks
  ↓
sdlc-task-execution.mdc auto-attaches (keyword match: "task", "claim")
  ↓
Agent claims top task, branches, implements, tests, commits, pushes
  ↓
Cursor surfaces the new branch / PR in the user's review queue
```

### Schema / Interface Changes

No new code, no new JSON schemas. The change is entirely:
- 2 markdown rule files (`.mdc` format with YAML frontmatter)
- 1 markdown playbook
- Edits to README.md and AGENTS.md to link to the playbook

---

## Decisions

### Decision 1: Two Rule Files vs. One Big One

**Chosen**: Two files — `sdlc-task-execution.mdc` and `sdlc-housekeeping.mdc`.

**Considered**: One combined `sdlc-autonomous.mdc`.

**Rationale**: The two files have different `description` patterns and auto-attach on different keywords. Splitting keeps each file <250 lines and gives Cursor more precise context loading. Also separates concerns: housekeeping cycles are "run one specific script and commit output," task execution is "follow the full micro cycle."

### Decision 2: Branch Convention `agent/cursor/<task-id>`

**Chosen**: All Cursor Background Agent work commits to branches matching `agent/cursor/<task-id>`. Never directly to main.

**Considered**: Commit to main with `[cursor-agent]` prefix on the message; commit to a single shared `cursor-agent/work` branch.

**Rationale**: PR-gated review preserves quality. The user can inspect, request changes, merge selectively. A single shared branch creates merge conflicts when multiple Automations fire in parallel. The `agent/cursor/` prefix makes the work visible at a glance in `git branch --list`.

### Decision 3: Cycle Output Artifact Commits

**Chosen**: Cycles that produce reports commit them to `pm/auto/<cycle>-<YYYY-MM-DD>.md`. Cycles with no output skip the commit.

**Considered**: Always commit (even empty); never commit (let user manually inspect); write to an issues backend.

**Rationale**: `pm/auto/` is grep-able historical record. Empty commits clutter `git log`. Issues backend adds dependency.

### Decision 4: Tests Mandatory Before Commit

**Chosen**: Rule file explicitly requires the test command (`agents/project.json`'s `testCmd`) to pass before the agent commits. Test failure → revert changes → release task → flag as blocked.

**Considered**: Best-effort (commit anyway with a failing-test note); skip test step (let CI catch it).

**Rationale**: Avoiding broken-commits-to-main is the entire reason for the framework's quality gates. CI catches failures but the diff is harder to revert once merged. Tests-before-commit is non-negotiable per CLAUDE.md.

### Decision 5: Cursor Auto Mode Default (No Model Pinning)

**Chosen**: Rule files don't pin a specific model. Cursor's auto mode picks based on task. Auto mode is unlimited within Pro+.

**Considered**: Pin Claude Sonnet for code tasks, GPT for review tasks; pin Opus everywhere.

**Rationale**: Auto mode is unlimited (free within Pro+); pinning a specific model burns the $20/mo API credit pool. The framework's quality gates (four-layer-validate, tests, behavior-tests) are what enforce quality, not the model choice.

### Decision 6: Playbook in `docs/` Not the Rule Files

**Chosen**: UI setup instructions live in `docs/cursor-automations-playbook.md`, not in the `.mdc` files.

**Considered**: Bundle UI setup steps into the rule file headers.

**Rationale**: `.mdc` files are loaded by Background Agents at run-time — UI setup is user-facing, not agent-facing. Bloating `.mdc` files wastes the Background Agent's context budget on instructions it can't act on.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cursor's Automations UI changes, playbook goes stale | High over 6 months | Medium | Playbook describes intent + cron expressions, not pixel locations. Date-stamp the playbook. Future change `cursor-automations-playbook-refresh` quarterly. |
| Background Agent runs against wrong branch, commits to main | Low (rule explicit) | High | Rule mandates `agent/cursor/<task-id>` branch; PR workflow gates merge. |
| Auto mode picks a weak model for a complex task | Medium | Medium | 3-attempt retry; release task if all fail. Bryce reviews blocked tasks in interactive session. |
| Cycle output artifact commits create git noise | Medium | Low | Commit only when artifact is non-empty. `pm/auto/` namespace isolates them. `git log -- ':!pm/auto/'` filters them out. |
| Cursor sandbox can't run `node ~/agentic-sdlc/...` | Low (framework is cloned in repo) | High | If sandbox can't reach `~/agentic-sdlc`, fallback: rule file instructs agent to `git clone https://github.com/that-gum-you-like/agentic-sdlc.git ~/agentic-sdlc` first. |
| Two Automations fire concurrent queue-drain → claim same task | Medium | Medium | `queue-drainer.mjs claim` is atomic (uses file `mv` with NX flag). Second concurrent claim fails cleanly, no double-execution. |

---

## Open Questions

### OQ1: GitHub PR Creation — Agent or User?

**Question:** When a Background Agent finishes a task on `agent/cursor/<task-id>`, who opens the PR?

**Options:**
- Agent opens PR using its `gh pr create` access if Cursor sandbox has `gh` CLI
- Separate "PR opener" Automation triggered by branch push
- User opens manually

**Working answer:** Agent opens PR if `gh` is available in sandbox; falls back to leaving branch pushed for user. Document both paths in the rule file.

### OQ2: Multi-Project Setup

**Question:** Bryce will use this framework on multiple projects (agentic-sdlc itself, his work project, future projects). Does each project need its own set of Automations, or is one global setup sufficient?

**Working answer:** Per-project. Cursor Automations are scoped to a specific repo. Document this in the playbook so the user knows to repeat the setup per new project. Future improvement: an "import these Automations" JSON export from Cursor (not currently available).

### OQ3: Sandbox Environment Tools

**Question:** Does the Cursor cloud sandbox have `gh`, `jq`, `python3`, and other CLIs the framework scripts may invoke?

**Working answer:** Node 18+ is confirmed. `git` confirmed (it's the basis of clone). `gh` likely. `jq` likely. Python optional (only needed for semantic-index.mjs which is optional). Document the assumed tool set in the playbook; if anything's missing the user can ask Cursor support or wrap calls in a pre-flight check.

---

## Testing Approach

- **Unit tests**: none — this change is pure markdown content
- **Integration test**: Bryce creates the 7 Automations in his Cursor UI following the playbook. One of them (queue-drain) fires on schedule. Verify: a Background Agent runs, branches, commits, pushes within 60 minutes of trigger.
- **Manual verification**:
  - Open the 2 `.mdc` files in a markdown viewer — frontmatter valid, sections readable
  - Run `node setup.mjs --yes --dir /tmp/cursor-auto-test` and confirm `.cursor/rules/sdlc-*.mdc` files are copied to the test project
  - Read the playbook end-to-end and check it's actionable without back-references
- **Behavior verification (post-merge)**:
  - First Automation fire: was the agent's commit message clean? Did it follow the micro cycle?
  - First 7-day window: how many task executions succeeded vs. flagged-blocked? Tune rule files based on failures.

---

## Next Step

Proceed to specs phase. One spec file: `cursor-automation-agent-behavior.md` covering REQs for the rule file content + playbook acceptance criteria.
