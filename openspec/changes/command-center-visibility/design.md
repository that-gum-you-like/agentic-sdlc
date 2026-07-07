# Design: command-center-visibility

**Date**: 2026-07-06
**Author**: Fable (claude-fable-5) with Bryce
**Status**: design

---

## Architecture

```
sdlc-sched-kanban-sync.timer (every 15 min)
  └─ node agents/command-center-sync.mjs sync
       ├─ kanban-bridge.sync()            (existing; queue/*.json → cards)
       ├─ agent-registry write            (existing; budget → pm/agents.json)
       ├─ syncChanges()                   openspec/changes/* → parent cards
       ├─ syncSubtasks()                  tasks.md items → child cards (--parent)
       ├─ linkQueueTasks()                queue cards ← link → change cards
       ├─ syncBacklog()                   BACKLOG.md ideas → cards under one parent
       ├─ syncRuns()                      ledgers → pm/runs.json + run-card comments
       └─ reconcileApprovals()            card comments → status.json + pm/approvals.json
```

One process, sequential, best-effort per section: a failure in one section is
reported but does not abort the others (the board should still fill).

## Key decisions

**D1 — Compose, don't modify.** `kanban-bridge.mjs` stays untouched; the
orchestrator imports its exported `sync()` and reuses its exported
`runKanban()` for all CLI calls. `agent-registry.mjs` gains nothing; the
orchestrator rebuilds+writes `pm/agents.json` via its exported `buildRegistry`.

**D2 — Idempotency keys as the identity scheme.**
- change card: `openspec:<name>`
- sub-task card: `subtask:<change>:<n>` (n = 1-based order of appearance in
  tasks.md — stable in practice; a reorder worst-cases as a mislabeled lane
  until items complete, never a duplicate)
- backlog parent: `backlog:root`; backlog item: `backlog:<id>` (id from
  `### <id>. <title>` headings)
- run history card: `runs:root`

**D3 — Immutable titles, live state elsewhere.** Hermes cannot edit a card's
title/body after creation. Phase therefore lives in: (a) the lane, (b) a
comment posted on each phase transition (`phase: specs → implement`), (c) the
body snapshot taken at creation. `pm/command-center-links.json` stores
`phases.<change>` to detect transitions.

**D4 — Change lane mapping** (`mapChangePhase`):
| phase | lane | mechanism |
|---|---|---|
| proposal, design, specs, tasks, planning | ready (create default) | none needed |
| implement, implementation, verify | running | `--initial-status running` at create; comment on later transition (no CLI verb to move an existing card to running) |
| archive (or dir under `changes/archive/`) | done | `complete` verb |
Archived changes under `openspec/changes/archive/` are NOT synced (history, not
work). A change whose dir disappears (archived later) has its card completed on
the next pass via the state file diff.

**D5 — Sub-task parsing.** From `tasks.md`, take checklist items (`- [ ]` /
`- [x]`, any indent) that appear under a heading matching `/task/i`
(`## Implementation Tasks`, `## Tasks`, ...). If no such heading exists, fall
back to all checklist items. Prerequisites/Done-Checklist sections are thereby
excluded in the normal case. Title = item text stripped of markdown
(`**`, backticks), truncated to 120 chars. Checked → `complete` verb.

**D6 — Approval channel = comments.** Bryce (dashboard or
`hermes kanban comment <id> approve`) comments on a change card. Detector:
first comment whose body matches `/^\s*(approve[d]?|lgtm|ship it)\b/i` and
whose author is not the sync's own author (`sdlc-sync`). Effects, once:
1. `pm/approvals.json` append `{change, kanbanId, approvedBy, approvedAt, body}`
2. change `status.json` gains `"approved": true, "approvedBy", "approvedAt"`
   (merge, never clobber other fields)
3. confirmation comment posted as `--author sdlc-sync`:
   `✅ approval recorded → status.json (approvedBy: <author>)`
Idempotent: an approval already present in `pm/approvals.json` (or already
stamped in status.json) is skipped. Runs on plain `sync` — it is human-intent
driven, unlike kanban-bridge's `--reconcile` which stays opt-in.

**D7 — Runs ledger.** `syncRuns()` merges, newest-first, capped at 200 into
`pm/runs.json`:
- `pm/cycle-history.json` → `{kind: type, ts: timestamp, ok: success, detail: stats}`
- `pm/pr-auto-review.log` (JSONL) → `{kind: 'pr-auto-review', ts, ok: action !== 'error', detail: 'PR #<pr> <action>'}`
- `pm/drain-logs/drain-<stamp>.log` → `{kind: 'drain', ts: parsed stamp, ok: true, detail: filename}`
Each run has a stable key (`<kind>:<ts>[:<discriminator>]`). New keys (not in
state `seenRuns`) are appended as comments on the `runs:root` card, oldest
first, max 20 per pass; `seenRuns` is capped at 500 (FIFO). The card body
explains where the full ledger lives (`pm/runs.json`).

**D8 — Queue-task → change linking.** For each queue task the kanban-bridge
already synced (kid via `pm/kanban-links.json`), if any tag equals a change
name or the description contains `openspec/changes/<name>`, call
`hermes kanban link <changeKid> <taskKid>` once (recorded in state
`linkedPairs`); failures (e.g. link exists) are swallowed.

**D9 — State file** `pm/command-center-links.json`:
```json
{ "changes": {"<name>": "t_x"}, "subtasks": {"subtask:a:1": "t_y"},
  "backlog": {"11": "t_z", "root": "t_r"}, "runsRoot": "t_q",
  "phases": {"<name>": "implement"}, "seenRuns": ["drain:..."],
  "linkedPairs": ["t_x:t_y"], "approvedAnnounced": ["<name>"] }
```
`pm/` is gitignored; losing the file is safe — idempotency keys re-resolve ids,
comments may repeat once for phase/runs (accepted, bounded).

**D10 — Scheduler wiring.** `agents/templates/cron-schedule.json.template`
kanban-sync `script` → `node ~/agentic-sdlc/agents/command-center-sync.mjs sync`.
Single command — no shell operators, fixing the systemd `&&` defect.
Operator action after merge: `node agents/scheduler-install.mjs install`.

## Testing strategy

`tests/command-center-sync.test.mjs`, same harness as
`tests/kanban-bridge.test.mjs`: temp project dir (`SDLC_PROJECT_DIR` set before
import), fake `hermes` shim on PATH logging argv to `$HERMES_LOG`. Shim
extensions: `show --json` returns canned `{task, comments}` from
`$HERMES_SHOW_FILE` when set (drives the approval scenario); `create` echoes
`{id: "t_<key>"}`; `list` returns `[]`; everything else `ok`. Fixtures: two
fake changes (one pre-implement with tasks.md, one archived-phase), a
BACKLOG.md with live + shipped + rejected ideas, cycle-history/pr-log/drain-log
ledgers, one queue task tagged with a change name.
