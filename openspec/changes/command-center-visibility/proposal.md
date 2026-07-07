# Proposal: command-center-visibility

**Date**: 2026-07-06
**Author**: Fable (claude-fable-5) with Bryce
**Status**: proposed

---

## Problem

`command-center-bridge` (PR #40) filled the Hermes kanban board with the
file-based task queue (`tasks/queue/*.json`) and emitted `pm/agents.json`. That
answers "what tasks exist" — but Bryce's actual ask is **Paperclip-style full
visibility**: open `hermes dashboard` and SEE, cleanly cataloged:

1. **Every OpenSpec change** (proposal/design/specs/tasks) as a card he can
   read and **approve** — today no change appears on the board at all.
2. **Every backlog item and every sub-task that spawns**, with parent→child
   structure — a change's `tasks.md` checklist should appear as sub-cards under
   the change card; `openspec/BACKLOG.md` ideas should be cataloged too.
3. **Every job, task, and agent run** — the 13 `sdlc-sched-*` scheduler jobs,
   drain passes, pr-auto-review merges, daily/weekly cycles — as run history,
   like Paperclip's run log. Today that history is scattered across
   `pm/cycle-history.json`, `pm/pr-auto-review.log`, and `pm/drain-logs/`.
4. An **approval mechanism** usable from the board: Bryce approves a change
   without dropping to the terminal.

Bonus defect discovered during discovery: the `sdlc-sched-kanban-sync` unit's
`ExecStart` contains a literal `&&` — systemd does not shell-parse, so
`agent-registry.mjs` has **never actually run from the timer** (the `&&`,
`node`, and the registry path are passed as ignored argv to kanban-bridge).

## Discovery

- **OpenSpec change anatomy**: `openspec/changes/<name>/` = `proposal.md`,
  `design.md`, `specs/<cap>/spec.md`, `tasks.md` (markdown checklist
  `- [ ]`/`- [x]`), `status.json` `{status, phase, ...}` with phase ∈
  proposal|design|specs|tasks|implement|verify|archive.
- **Hermes kanban CLI**: `create --parent <id> --idempotency-key <key>` makes
  deduped sub-cards; `show <id> --json` returns
  `{task, parents, children, comments, events, runs}` where comments are
  `{author, body, created_at}` — a comment stream is a workable approval
  channel. `link <parent> <child>` adds parent→child after the fact.
  **CLI limitation**: card title/body cannot be updated after creation
  (`edit` only backfills result fields on done tasks) — so live state (phase)
  must be surfaced via lane, comments, and `pm/` snapshots, not title edits.
- **Run history sources** (no structured unified ledger exists):
  `pm/cycle-history.json` (daily/weekly review outcomes),
  `pm/pr-auto-review.log` (JSONL: `{ts, pr, branch, sha, action, detail}`),
  `pm/drain-logs/drain-<stamp>.log` (one file per drain pass).
  `hermes kanban runs` is per-Hermes-worker attempt history — our runs are
  systemd/Claude-driven, so it stays empty; we must emit our own `pm/runs.json`.
- **Existing bridge** (`agents/kanban-bridge.mjs`) is solid and tested; this
  change composes with it rather than modifying it.

## Proposed Solution

One new tested, idempotent orchestrator — **`agents/command-center-sync.mjs`**
— that the existing 15-minute `kanban-sync` timer runs instead of the broken
two-command line. Each pass it:

1. **Runs the existing bridges**: `kanban-bridge.sync()` (queue → cards) and
   `agent-registry` (budget → `pm/agents.json`) — via import, in-process,
   fixing the `&&` defect.
2. **Syncs OpenSpec changes** (`syncChanges`): every non-archived
   `openspec/changes/<name>/` becomes a parent card
   (`--idempotency-key openspec:<name>`) whose body carries the proposal's
   Problem + Value Analysis excerpt, current phase, how to read the full spec
   (`openspec show <name>` + file path), and how to approve. Lane follows
   phase (pre-implement → todo/ready, implement/verify → running, archive →
   done). Phase transitions post a comment on the card (title is immutable).
3. **Syncs sub-tasks** (`syncSubtasks`): each change's `tasks.md` checklist
   items become child cards via `--parent`, keyed `subtask:<change>:<n>`;
   checked items land in done. Queue tasks whose `tags`/`description` name a
   change get `hermes kanban link`-ed under the change card.
4. **Syncs the backlog** (`syncBacklog`): `openspec/BACKLOG.md` "Remaining
   Ideas" (`### <id>. <title>`) become child cards under one "OpenSpec
   Backlog" parent, keyed `backlog:<id>`; shipped/completed items go to done;
   rejected (`R-xx`) items are skipped.
5. **Surfaces run history** (`syncRuns`): normalizes cycle-history +
   pr-auto-review + drain-log entries into `pm/runs.json` (last 200), and
   appends each NEW run as a comment on a single "Agent run history" card
   (seen-run cursor in state; capped per pass so a backlog can't flood).
6. **Reads approvals back** (`reconcileApprovals`): scans each change card's
   comments for `approve`/`approved`/`lgtm`; on first sight records
   `pm/approvals.json` `{change, approvedBy, approvedAt}`, stamps
   `approved/approvedBy/approvedAt` into the change's `status.json`, and posts
   a confirmation comment. This runs on every plain `sync` — it only ever
   writes when a human explicitly commented approval.
7. **Updates the schedule**: `cron-schedule.json.template` kanban-sync job
   becomes `node ~/agentic-sdlc/agents/command-center-sync.mjs sync`;
   `scheduler-install.mjs install` regenerates the unit.

State (card ids, seen runs, last phases, linked pairs) persists in
`pm/command-center-links.json`. Zero npm deps; shells out to `hermes` only;
rule #9 CLI guard; fake-hermes-shim tests like `tests/kanban-bridge.test.mjs`.

Out of scope: Telegram, GitHub write access, dashboard UI changes (we only
populate the board the existing UI reads).

## Value Analysis

- **Delivers the #1 ask directly**: Bryce opens `hermes dashboard` and sees
  every OpenSpec change as a readable card with its tasks.md sub-cards nested
  under it, the backlog cataloged, and the queue already there — Paperclip-style
  parent/child structure over the real ledger.
- **Approval from the board**: comment "approve" on a change card → the next
  sync pass (≤15 min) records it in `status.json` + `pm/approvals.json` and
  confirms on-card. No terminal needed.
- **Run visibility**: one card + `pm/runs.json` gives the Paperclip-style run
  log across scheduler jobs, drains, auto-review merges, and cycles.
- **Fixes a live defect for free**: agent-registry actually runs on the timer
  again (systemd `&&` bug).
- **Idempotent + additive**: keyed cards, no duplicates, existing
  kanban-bridge untouched, safe every 15 minutes.
- **Cost**: M — one orchestrator script + tests + template line + docs.
  Risk low: read-mostly; the only writes to spec artifacts are the explicit,
  human-triggered approval stamps.
