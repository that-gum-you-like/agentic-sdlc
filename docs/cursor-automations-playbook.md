# Cursor Automations Playbook for the Agentic SDLC

**Last updated**: 2026-05-21
**Cursor version assumed**: Pro+ tier with Automations + Cloud Agents (Automations launched March 2026)
**Audience**: A user who just ran `setup.mjs --yes --dir <project>` and wants to enable the autonomous SDLC loop via Cursor Automations.

---

## What you're setting up

7 recommended Automations, each scheduled at a different cadence, that fire a Cloud Agent in your project's sandbox. The agent loads `.cursor/rules/sdlc-task-execution.mdc` or `.cursor/rules/sdlc-housekeeping.mdc` (whichever applies) and executes the cycle. Results commit to feature branches (`agent/cursor/...`) so you can review before merging.

**Time to set up**: ~15 minutes (one-time, per project)
**Marginal cost**: $0 (Cursor auto mode within Pro+ is unlimited)

---

## Prerequisites

- Cursor Pro+ subscription (Background Agents + Automations enabled)
- The project's GitHub repo connected to your Cursor account
- `setup.mjs` has been run against the project (so `.cursor/rules/sdlc-*.mdc` files exist in the repo)
- The project's `agents/project.json` has a valid `testCmd` field

---

## Setup steps (do these once per project)

### Step 1 — Open Cursor Automations

Go to **cursor.com/automations** in your browser. Sign in if needed. You should see your existing Automations list (likely empty if this is your first one).

### Step 2 — Create each of the 7 Automations below

For each Automation, click "+ New Automation" and fill in:
1. **Name** (suggested below)
2. **Trigger** → Schedule → cron expression
3. **Action** → "Start a cloud agent" → select your project's repo
4. **Initial prompt** (paste from the table below — this is what the agent reads first)
5. **Tools** to enable: file system, bash, git, gh (PR creation). MCP server: not required.
6. **Save**

---

## The 7 Automations

### 1. Queue Drain (hourly, business hours)

| Field | Value |
|---|---|
| Name | `sdlc-queue-drain` |
| Trigger | Schedule: cron `13 8-22 * * *` (every hour 08:13–22:13 local) |
| Initial prompt | `Drain the task queue. Pick the highest-priority unblocked task, claim it, execute it following the sdlc-task-execution rules. Commit on branch agent/cursor/<task-id>. Push and open a PR if possible. If queue is empty, exit cleanly.` |
| Tools | file system, bash, git, gh |
| Branch policy | Always feature branch; PR-gated merge |

**Why hourly business hours:** Avoids 24×7 token consumption; matches when you're likely to review the resulting PRs.

### 2. Daily Review (22:07 local)

| Field | Value |
|---|---|
| Name | `sdlc-daily-review` |
| Trigger | Schedule: cron `7 22 * * *` |
| Initial prompt | `Run the daily-review cycle. Follow sdlc-housekeeping.mdc. The cycle command is: node ~/agentic-sdlc/agents/cycles/daily-review.mjs. Commit the output to pm/auto/daily-review-<YYYY-MM-DD>.md on a feature branch and push.` |
| Tools | file system, bash, git, gh |
| Branch policy | Feature branch (housekeeping branches can be auto-merged after CI passes) |

### 3. Weekly Review (Sunday 23:43 local)

| Field | Value |
|---|---|
| Name | `sdlc-weekly-review` |
| Trigger | Schedule: cron `43 23 * * 0` |
| Initial prompt | `Run the weekly-review cycle. Follow sdlc-housekeeping.mdc. Command: node ~/agentic-sdlc/agents/cycles/weekly-review.mjs. Commit the output to pm/auto/weekly-review-<YYYY-MM-DD>.md on a feature branch and push.` |
| Tools | file system, bash, git, gh |
| Branch policy | Feature branch |

### 4. REM Sleep (Sunday 23:53 local)

| Field | Value |
|---|---|
| Name | `sdlc-rem-sleep` |
| Trigger | Schedule: cron `53 23 * * 0` |
| Initial prompt | `Run the rem-sleep cycle. Follow sdlc-housekeeping.mdc special case for rem-sleep. Command: node ~/agentic-sdlc/agents/rem-sleep.mjs. This modifies agents/<agent>/memory/*.json files in-place. Commit all modified memory files plus the pm/auto/rem-sleep-<YYYY-MM-DD>.md summary on a feature branch and push.` |
| Tools | file system, bash, git, gh |
| Branch policy | Feature branch — **requires human review** because memory consolidation can drop entries |

### 5. Pattern Hunt (Sunday 23:33 local — before REM sleep)

| Field | Value |
|---|---|
| Name | `sdlc-pattern-hunt` |
| Trigger | Schedule: cron `33 23 * * 0` |
| Initial prompt | `Run the pattern-hunt cycle. Follow sdlc-housekeeping.mdc special case for pattern-hunt. Command: node ~/agentic-sdlc/agents/pattern-hunt.mjs. Commit the output to pm/auto/pattern-hunt-<YYYY-MM-DD>.md. Do NOT auto-commit any suggested defeat tests — list them as TODOs in the artifact.` |
| Tools | file system, bash, git, gh |
| Branch policy | Feature branch — **requires human review** because new defeat tests need human judgment |

### 6. Cost Tracker (daily 06:23 local)

| Field | Value |
|---|---|
| Name | `sdlc-cost-report` |
| Trigger | Schedule: cron `23 6 * * *` |
| Initial prompt | `Run the cost-tracker cycle. Follow sdlc-housekeeping.mdc. Command: node ~/agentic-sdlc/agents/cost-tracker.mjs report. Commit the output to pm/auto/cost-tracker-<YYYY-MM-DD>.md on a feature branch and push.` |
| Tools | file system, bash, git, gh |
| Branch policy | Feature branch (low-stakes, auto-mergeable after CI) |

### 7. Alignment Monitor (daily 12:33 local)

| Field | Value |
|---|---|
| Name | `sdlc-alignment` |
| Trigger | Schedule: cron `33 12 * * *` |
| Initial prompt | `Run the alignment-monitor cycle. Follow sdlc-housekeeping.mdc special case for alignment-monitor. Command: node ~/agentic-sdlc/agents/alignment-monitor.mjs. Commit pm/auto/alignment-monitor-<YYYY-MM-DD>.md. Do NOT auto-modify any AGENT.md files — list suggestions as TODOs in the artifact.` |
| Tools | file system, bash, git, gh |
| Branch policy | Feature branch — **requires human review** for any AGENT.md prompt changes |

---

## First time you see a PR from cursor-agent

Within ~60 minutes of creating the queue-drain Automation, you should see a new branch (or PR) in your repo named `agent/cursor/<task-id>`. Here's what to expect and how to handle it:

### What's in the PR

- **Title**: matches the task title from `tasks/queue/<task-id>.json`
- **Body**: auto-generated summary, list of tests added/modified, memory entries recorded
- **Files**: source code changes + test files + memory file entries
- **Branch**: `agent/cursor/<task-id>` (never `main`)

### Review checklist

- [ ] Does the diff match the task spec? (Compare to `tasks/queue/<task-id>.json`'s `description` and `acceptanceCriteria`)
- [ ] Are tests included? Open a test file and confirm it has real assertions, not stubs.
- [ ] Run the tests yourself locally to confirm they pass (don't trust the PR description alone — verify)
- [ ] Did the agent modify files outside the task's declared scope? If yes, that's a yellow flag — read the commit message for justification.
- [ ] Is the memory entry sensible? Open `agents/<agent>/memory/recent.json` and check the new entry.

### When to merge

- Tests pass locally → merge
- Tests fail → close the PR, mark task as `blocked` in `tasks/queue/<task-id>.json`, debug in your interactive Cursor session

### When to revert (rare)

- If the agent over-modified files (touched 10 files when 2 were needed)
- If the test suite was passing but the change has a logic error the tests didn't catch
- Revert with `gh pr close <num>` + `git branch -D agent/cursor/<task-id>`

---

## Tuning after the first week

Plan a **30-minute review** ~7 days after creating these Automations:

1. **Open `pm/auto/`** and read through the daily/weekly artifacts. Is the content useful?
2. **Check `git log --author=cursor-agent`** to see the actual commits. Are they small? Atomic? Well-described?
3. **Count blocked tasks** (`tasks/queue/<id>.json` with `status: blocked`). High count → tune the rule files or the task specs.
4. **Check Cursor's usage dashboard** for token consumption. Sustainable?
5. **Adjust cadences**: too frequent → token drain. Too infrequent → backlog grows.

If the rule files need tweaking, open a new OpenSpec change `cursor-rules-tuning-<date>` and route through the framework's normal change process.

---

## Disabling / pausing

- **Pause an Automation**: toggle "active" off in cursor.com/automations. Tasks won't fire until you re-enable.
- **Pause all Automations**: pause each one individually (Cursor doesn't have a "pause all" yet)
- **Delete an Automation**: clicking delete removes it; you'll need to recreate from this playbook
- **Pause cleanly during a vacation**: pause Automations 24h before you leave to let in-flight runs finish; pause main 7 first, then 1 (queue-drain) last

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No PRs appearing after 2h | queue is empty | Add tasks to `tasks/queue/` via `seed-queue-from-openspec.mjs` |
| PRs appearing but tests failing | rule file's test command doesn't match project | Check `agents/project.json` `testCmd` field |
| Agent committing to main | rule files not loaded — check `.cursor/rules/` exists in the repo | Re-run `setup.mjs --yes --dir <project>` |
| `node: command not found` in sandbox | Cursor sandbox lacks Node 18+ | Add a setup step to the Automation prompt: `nvm install 18 && nvm use 18` |
| `~/agentic-sdlc` not found in sandbox | Framework not cloned in sandbox | Add to Automation prompt: `git clone https://github.com/that-gum-you-like/agentic-sdlc.git ~/agentic-sdlc` |
| Auto mode picks bad model | Cursor's auto mode mis-routed | Open the PR, comment the desired model name; Cursor learns over time |

---

## Where to go next

- [docs/cursor-background-agents.md](cursor-background-agents.md) — broader Cursor Pro+ patterns
- [docs/cursor-setup.md](cursor-setup.md) — Cursor base setup (any tier)
- [AGENTS.md](../AGENTS.md) — what an AI agent should do when pointed at this repo
- `openspec/changes/cursor-automations-worker-integration/` — the OpenSpec change that produced this playbook (for context on design decisions)
