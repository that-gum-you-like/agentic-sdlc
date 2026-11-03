# Design: command-center-portfolio-sync

**Date**: 2026-09-07
**Author**: hermes-drain (autonomous drain worker)
**Status**: design

---

## Problem

`command-center-sync.mjs sync` walks exactly one project — the one resolved by
`SDLC_PROJECT_DIR` (default: the framework repo). Every additional mission
currently needs a hand-written cron entry passing `SDLC_PROJECT_DIR`, and
those entries sync with unnamespaced kanban idempotency keys that collide
across projects on the shared board.

## Goals

- `sync --all` walks every `enabled: true` portfolio project whose `path`
  exists and contains `tasks/queue`.
- All kanban idempotency keys minted for a project carry the project name as a
  prefix, so identical task ids / change names across projects produce
  distinct cards.
- A missing or unusable `path` skips that project with a warning; the other
  projects still sync. The run never aborts on a bad entry.
- The default `sync` path (framework repo, no namespace) is behaviorally
  unchanged — every existing idempotency key and link-map key stays identical.
- Zero new dependencies; the per-project pass is a child process of the same
  script (`spawnSync`), which reuses the module's existing
  `SDLC_PROJECT_DIR` resolution and per-project `pm/` state isolation.

## Design

### Namespacing: `SDLC_PROJECT_NAMESPACE`

Both `kanban-bridge.mjs` and `command-center-sync.mjs` grow a module-level
constant read from the environment at import time:

```js
const NAMESPACE = process.env.SDLC_PROJECT_NAMESPACE || null;
export function nsKey(key) { return NAMESPACE ? `${NAMESPACE}:${key}` : key; }
```

Every idempotency key handed to `hermes kanban create --idempotency-key` is
wrapped in `nsKey(...)`:

| minted by | key without namespace | key with namespace `proj` |
|-----------|----------------------|---------------------------|
| bridge `syncTask` | `<task-id>` | `proj:<task-id>` |
| `syncChanges` | `openspec:<name>` | `proj:openspec:<name>` |
| `syncSubtasks` | `subtask:<name>:<n>` | `proj:subtask:<name>:<n>` |
| `syncBacklog` | `backlog:root` / `backlog:<id>` | `proj:backlog:root` / `proj:backlog:<id>` |
| `syncRuns` | `runs:root` | `proj:runs:root` |
| `syncPortfolio` | `portfolio:<name>` | `proj:portfolio:<name>` |

The bridge's `pm/kanban-links.json` link map is keyed by the same key used at
create time (so `linkQueueTasks` looks up `links[nsKey(task.id)]`), and
`reverseReconcile` strips the namespace before mapping a card back to its task
file (`proj:A-1` → `tasks/queue/A-1.json`).

State files (`pm/command-center-links.json` and `pm/kanban-links.json`) need
NO namespacing: each pass writes to the synced project's OWN `pm/` directory
(unchanged `SDLC_PROJECT_DIR` scoping). The namespace guards only the shared
board.

### The `--all` runner

`syncAllProjects()` in `command-center-sync.mjs`:

1. `portfolioModule.load(PORTFOLIO_PATH)` — never throws out of the runner;
   an unreadable portfolio surfaces as a warning, not a crash.
2. For each portfolio project:
   - `enabled !== true` → silent skip (deliberately off).
   - `path` missing, or `join(path, 'tasks', 'queue')` absent → `console.warn`
     + collected warning; continue (never abort).
   - otherwise → `spawnSync(process.execPath, [__filename, 'sync'], {
     env: { ...process.env, SDLC_PROJECT_DIR: path,
            SDLC_PROJECT_NAMESPACE: name } })`. `PORTFOLIO_PATH` is removed
     from the child env so the child resolves its OWN portfolio relative to
     its project dir, like every other path constant.

A child process (rather than in-process re-configuration) is used because the
module's path constants are computed at import time; re-executing the script
per project gives each pass a coherent `PROJECT_DIR` — the exact mechanism the
bespoke timers already rely on.

The child runs the existing full pass (queue + agents + changes + portfolio +
subtasks + backlog + links + runs + approvals). Child failures are captured as
warnings; the runner reports per-project status and exits non-zero only if at
least one project failed.

`PORTFOLIO_PATH` from the parent is intentionally NOT inherited by children —
each project's own `portfolio.json` (or absence, which `syncPortfolio` already
degrades on) is authoritative for that project's pass.

## Open Questions / Decisions

- **Why not thread a context object through every function?** The module's
  constants (`CHANGES_DIR`, `PM_DIR`, …) are import-time. Threading a full
  context would touch a dozen signatures and every existing test call; the
  child-process approach reuses the established `SDLC_PROJECT_DIR` contract
  with a 5-line runner. It also matches how the bespoke timers already work,
  making the removal of those timers a pure cron edit.
- **State keys stay unnamespaced.** They are already per-project-dir; only
  board-facing keys need the prefix. A project whose sync flips from
  unnamespaced (bespoke timer) to namespaced (`--all`) will see the board gain
  namespaced cards while old cards fade from management — noted in the
  proposal as out-of-scope migration.
- **`--reconcile` + `--all`** are mutually exclusive today; `--all` children
  run a plain `sync` (no reconcile), keeping the runner single-purpose.