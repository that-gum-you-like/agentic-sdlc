# Hermes ↔ Backlog Bridge

How the **Hermes** agent CLI, **Claude Code**, and the **autonomous launcher** share one body of work over this repo — and how the capabilities that started as Hermes skills became first-class repo artifacts.

---

## Three runtimes, one ledger

| Runtime | What it is | How it picks up work |
|---|---|---|
| **Hermes** (`~/.hermes/`) | Full tool-calling agent CLI with its own skill store, cron, kanban, memory-graph | `hermes chat`, `hermes cron`, `hermes kanban` — reads/writes the repo |
| **Claude Code** | Interactive/agentic CLI in this repo | Direct requests + the queue/backlog |
| **Autonomous launcher** | `agents/autonomous-launcher.sh` | Claims roadmap/queue items headless, runs the micro cycle |

None of them share a process. **They coordinate through repo artifacts** — the OpenSpec backlog, the task queue, and `pm/` reports. That shared ledger is what keeps three runtimes from stepping on each other.

### The shared work ledger

1. **`openspec/BACKLOG.md`** — candidate ideas. Promotion → an OpenSpec change under `openspec/changes/`.
2. **`openspec/changes/<name>/`** — the spec-driven unit of work (proposal → design → specs → tasks).
3. **`tasks/queue/*.json`** — active tasks; `queue-drainer.mjs` assigns them, enforces permissions, and detects file-pattern conflicts so parallel agents don't collide.
4. **`pm/` reports** — the runtimes leave state here: `pm/red-team-reports/`, `pm/rag-index/`, `pm/doc-versions.json`, alignment reports, dashboard.

**Hand-off pattern:** whoever picks up a task claims it in its queue JSON (`in_progress` + owner). Stale-claim detection flags anything `in_progress` > 30 min. On completion the task moves to `tasks/completed/`. Because claims and completions are files, any runtime can see what any other is doing.

---

## Capability map: Hermes skill → repo template

The advanced "workshop" capabilities were built as Hermes skills. They are now **also** execution-agent templates in this repo, so this framework's agent-routing, `budget.json` model tiers, and `test-behavior.mjs` can use them too. Same capability, two homes:

| Capability | Hermes skill (`hermes skills list`) | Repo template (`agents/templates/execution-agents/`) |
|---|---|---|
| Constitutional AI / self-critique / red-team | `constitutional-ai-engineer` | `constitutional-ai-engineer.md` |
| Context / prompt / window engineering | `context-engineering-master` | `context-engineering-master.md` |
| Hierarchical memory design | `hierarchical-memory-architect` | `memory-architect.md` |
| 12-factor / stateless / portable agents | `oodle-12factor-agent` | `twelve-factor-agent.md` |
| Retrieval-augmented generation | `rag-specialist` | `rag-specialist.md` |
| Token & embedding analysis | `token-embedding-analyzer` | `token-embedding-analyzer.md` |

Templates are **addenda**: they layer role-specific rules onto the base agent prompt and are selected by `role_keywords` / `default_patterns`. They intentionally reference only capabilities the framework already tracks (`memoryRecall`, `memoryRecord`, `costTracking`, `semanticSearch`).

---

## Capability map: cron scripts

The onboarding guide referenced these automation scripts; they now exist under `agents/` and pair with the templates and the autonomous loops:

| Script | Purpose | Pairs with |
|---|---|---|
| `red-team-tester.mjs` | Adversarial injection / jailbreak / alignment scan over agent prompts & outputs → `pm/red-team-reports/` | `constitutional-ai-engineer` |
| `rag-indexer.mjs` | Local semantic index of `docs/` + `openspec/` + agent `memory/` → `pm/rag-index/` (embedding or lexical fallback) | `rag-specialist`, `token-embedding-analyzer` |
| `document-sync.mjs` | Version-track knowledge docs, flag changes into `pm/rag-index/reindex-queue.json` | `rag-indexer.mjs` (feeds it) |
| `health-check.mjs` | Queue / budget / disk / cron liveness → `ok\|degraded\|down` | autonomous launcher, cron |
| `telegram-notify.mjs` | Opt-in Telegram notification channel (stdlib `https`, no-op when unconfigured) | `notify.mjs` provider pattern |

**Data flow:** `document-sync.mjs` detects changed docs → writes a re-index queue → `rag-indexer.mjs` rebuilds the index → `rag-specialist` retrieves against it. All embeddings are **local-only** (privacy-first, no OpenAI, zero npm deps), degrading to a deterministic lexical index when `sentence-transformers` isn't installed.

---

## Privacy & safety posture

- **No OpenAI, no cloud embeddings.** Retrieval uses local `sentence-transformers` or a lexical fallback.
- **Telegram is opt-in and config-gated** (`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`). No always-on listening; unconfigured → silent no-op.
- **GitHub via existing `gh` OAuth** — no PATs, no tokens handed to any agent.
- **`red-team-tester.mjs`** exists precisely to keep the agent prompts themselves honest against injection and jailbreak drift.

---

## Getting started

New to the repo? Read [claude-quickstart.md](claude-quickstart.md) for the operating loop, then `CLAUDE.md` for the full operating manual.

---

## Command-center visibility (openspec change `command-center-visibility`)

`agents/command-center-sync.mjs sync` (run by the `sdlc-sched-kanban-sync` timer every
15 min) is the single command that fills the board `hermes dashboard` reads:

| Board object | Source | Idempotency key |
|---|---|---|
| `OpenSpec: <name>` parent card (proposal excerpt + phase + read path) | `openspec/changes/<name>/` | `openspec:<name>` |
| Sub-task child cards under each change | that change's `tasks.md` checklist | `subtask:<change>:<n>` |
| `OpenSpec Backlog` parent + one card per idea | `openspec/BACKLOG.md` `### <id>. <title>` | `backlog:<id>` |
| Queue task cards (via kanban-bridge) linked under their change | `tasks/queue/*.json` (tag or description naming the change) | task id |
| `Agent run history` card (one comment per run) + `pm/runs.json` | `pm/cycle-history.json` · `pm/pr-auto-review.log` · `pm/drain-logs/` | `runs:root` |
| `pm/agents.json` (agent roster + spend) | `budget.json` + cost ledger | — |

**Reading a change from the board:** open the `OpenSpec: <name>` card — the body
holds the Problem + Value Analysis excerpt and the full read path
(`openspec show <name>`, `openspec/changes/<name>/`). Its child cards are the
tasks.md items; phase transitions arrive as comments.

**Approving a change from the board:** comment `approve` (or `approved` / `lgtm` /
`ship it`) on the change card — dashboard comment box or
`hermes kanban comment <card-id> approve`. The next sync pass (≤15 min, or run
`node agents/command-center-sync.mjs sync` now) stamps
`approved/approvedBy/approvedAt` into that change's `status.json`, records it in
`pm/approvals.json`, and posts a ✅ confirmation comment back on the card.

State (card ids, seen-run cursor, completed-card + parked-card caches) lives in
`pm/command-center-links.json`; deleting it is safe — idempotency keys re-resolve.
Dry-run: `node agents/command-center-sync.mjs status`.

## Parked changes (openspec change `command-center-parked-lane`)

Kanban lanes are fixed (`triage · todo · scheduled · ready · running · blocked ·
done`), so the **`scheduled` lane is repurposed as the Parked lane**: deliberately
deferred OpenSpec changes live there, off the active Todo, without losing their
written proposal/design/specs.

**Park a change:** add `"parked": true` to
`openspec/changes/<name>/status.json`. The next sync pass moves the change's
parent card AND all of its unchecked sub-task cards to `scheduled` (via
`hermes kanban schedule`, which also stamps a `SCHEDULED: PARKED — …` comment on
each card). New parent cards for parked changes are titled
`OpenSpec (Parked): <name>`. Checked (finished) tasks stay in `done`. Re-runs are
idempotent — 0 duplicates, 0 redundant lane moves (`parkedCards` cache +
live-lane check).

**Un-park:** remove the `"parked": true` flag. The next pass issues
`hermes kanban unblock` for exactly the cards the sync parked (never a card a
human scheduled by hand); Hermes re-gates them to `ready`/`todo` by dependency
state.

**Deleting a change outright** (dir removed, NOT moved to
`openspec/changes/archive/`): the sync archives the parent card and every
sub-task card off the board entirely and forgets them — no orphan cards in
Todo. A change moved to `archive/` instead completes its parent card (finished
work), as before.
