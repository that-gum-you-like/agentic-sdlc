# Proposal: runtime-state-isolation

**Date**: 2026-11-12
**Author**: Claude with Bryce
**Status**: proposed

---

## Problem

The live checkout `~/agentic-sdlc` is the human's working tree, and it is also where the framework's own scheduled jobs write their runtime state. The tree is
therefore permanently dirty, and every safety mechanism that assumes a clean tree either fails silently or destroys something. Five symptoms, one root cause
("runtime state lives inside the git working tree of a human-owned checkout"), each verified on 2026-11-12:

1. **`tasks/completed/` is neither tracked nor ignored.** `queue-drainer.mjs archive` (`agents/queue-drainer.mjs:778-789`) calls `fileBased.archiveTask`, which is a
   `renameSync` out of the tracked `tasks/queue/` (`agents/adapters/orchestration/file-based.mjs:27-32`). Result: ~146 tracked deletions plus one untracked directory.
   `git ls-files tasks` lists only `tasks/queue` (192 files). Of the 146 files in `tasks/completed/`, 144 are byte-identical to the file of the same name that origin/main
   keeps in `tasks/queue/` with `status: completed`: the archive step moves files that upstream deliberately keeps in place. The directory is `root:root` (`drwxr-xr-x`),
   so the human user cannot even `git clean` it.
2. **Agent memory is tracked but rewritten in place.** `agents/<agent>/memory/{core,long-term,medium-term,recent,compost}.json` (20 files, plus `sdlc-developer/memory/vectors.json`)
   are tracked. `saveMemory` (`agents/memory-manager.mjs:60-88`) writes straight to `config.agentsDir/<agent>/memory/`, called from `rem-sleep`, `weekly-review`, `monthly-review`,
   `worker`, `version-snapshot restore`. The weekly REM sleep (`agents/cron-schedule.json`, `weekly-pattern-hunt`, Sun 23:00) runs from `~/agentic-sdlc` and dirties the human tree every week.
   This is the known root gap "agent memory is wiped every drain pass" (memory: `project_sdlc_curriculum_rubric`): `hermes-drain.sh:185-188` does `checkout -B`, `reset --hard`, `clean -fdq`
   in the drain clone before every pass, so anything a worker writes to memory is erased unless it happens to be committed in that PR, and anything a timer writes to the live tree is
   reverted by the trespass guard. A real lesson in `agents/sdlc-developer/memory/long-term.json` survived only because PR #164 (`chore/preserve-dirty-tree-2026-11-12`, open) preserved it by hand.
3. **A guard that cannot tell writers apart.** `agents/drain-trespass-guard.sh` snapshots tracked-dirty files before a drain and, after it, `git checkout`s any file that became modified
   (saving a patch first). Its own header admits: "The guard cannot tell a worker's edit from a human's or a timer's (2026-11-09: it reverted an interactive session's edits and the weekly
   REM-sleep memory writes)". The TRESPASS rc=97 of 2026-11-09 was that false positive. As long as legitimate non-worker writers exist in the live checkout, a guard that treats every change
   as trespass is wrong, and a guard that tolerates changes is blind.
   *Correction to the premise that "drains run in the live checkout":* the drain WORKER already runs in a dedicated clone (`hermes-drain.sh:41,160-188`, `~/.sdlc-drain-clone-<project>`) and
   `pr-auto-review.mjs` reviews in a clone (`:674-679`). What runs in the live checkout is everything on the scheduler (`cron-schedule.json` scripts are all `node ~/agentic-sdlc/agents/...`)
   and, in practice, something that ran as root: `agents/secrets.mjs` (`-rwx--x--x root:root`, unreadable by the user, untracked, 2026-11-11 11:24, a VaultWarden resolver whose origin is the unmerged
   branch `agent/drain/OS-curriculum-v2-conformance-130`) and `tasks/completed/` (root, 2026-11-12 11:28). How root got a write path into the live checkout is **not established** (open question 1).
4. **`sdlc-update` has no dirty-tree guard.** `~/.config/systemd/user/sdlc-update.service` is a bare `ExecStart=/usr/bin/git pull --ff-only`. The log it appends to
   (`~/.config/systemd/user/sdlc-crons.log`) ends in git's `Please commit your changes or stash them before you merge. Aborting` (Nov 9, 11, 12 per the investigation), the unit still reports a
   plain failure that nobody reads, and the repo drifted 31 commits behind origin/main. The unit lives outside the repo and outside the `sdlc-sched-*` namespace that `scheduler-install.mjs`
   manages, so nothing in the repo describes or tests it.
5. **The Docker Hermes cron lane could not see host paths** and was paused 2026-11-12 in favour of the host `sdlc-drain-supervisor` (guard: `agents/hermes-cron-guard.mjs`). That fixed the symptom
   (spam), not the cause: any process that can write into the live checkout, by any route, dirties it.

## Discovery

- **Files examined**: `agents/queue-drainer.mjs`, `agents/adapters/orchestration/file-based.mjs`, `agents/load-config.mjs` (`completedDir`, `agentsDir`), `agents/memory-manager.mjs`, `agents/version-snapshot.mjs`,
  `agents/rem-sleep.mjs`, `agents/cycles/{daily,weekly,monthly}-review.mjs`, `agents/hermes-drain.sh`, `agents/drain-trespass-guard.sh`, `agents/drain-supervisor.mjs`, `agents/pr-auto-review.mjs`,
  `agents/notify.mjs` (`shouldNotifyOnce`, `triggerNotificationOnce`, `errorSignature`), `agents/scheduler-install.mjs`, `agents/hermes-cron-guard.mjs`, `agents/worktree.mjs`, `agents/cron-schedule.json`,
  `.gitignore`, `~/.config/systemd/user/sdlc-update.{service,timer}`, `~/.config/systemd/user/sdlc-crons.log`, `openspec/changes/{business-os,curriculum-v2-conformance}`.
- **Existing patterns to reuse (not duplicate)**: `agents/worktree.mjs` (one worktree per agent, `land` runs gates in a scratch worktree); the dedicated drain clone; `shouldNotifyOnce` / `triggerNotificationOnce`
  for deduped alerts; `version-snapshot.mjs` + `pm/memory-audit.jsonl` (CV-REQ-072) for memory history; `pii-scrub.mjs`; `scheduler-install.mjs` `UNIT_PREFIX` namespacing; `SDLC_PROJECT_DIR` env override in `load-config.mjs`.
- **Existing tests**: `tests/drain-trespass-guard.test.mjs`, `tests/hermes-drain.test.mjs`, `tests/scheduler-install.test.mjs`, `tests/pr-auto-review.test.mjs`, `agents/__tests__/memory-audit.test.mjs`, `agents/__tests__/monthly-review.test.mjs`.
- **Key findings**: (a) the archive step is destructive relative to upstream's convention and is redundant, since 144 of 146 archived files are already in main's queue; (b) memory has exactly one write path
  (`saveMemory`) and one read path (`getMemoryPath`), so relocating it is a one-function change plus snapshot/restore; (c) the existing drain clone design is right: the missing piece is a state location that is
  *outside every checkout*; (d) no `openspec` CLI is installed on this host; artifacts were written by hand from `openspec/templates/`.

## Proposed Solution

Draw one line: **git holds code, specs and curated seeds; `$SDLC_STATE_DIR` holds everything the system writes while running.** Runtime memory moves to a per-host state directory outside every checkout
(default `~/.local/state/sdlc/<project>/`), the tracked `agents/<agent>/memory/*.json` become frozen seeds that change only through a reviewed branch+PR (`memory-publish`), and `tasks/completed/` is abolished
(archive becomes a status/`archived_at` stamp in place, matching upstream). `sdlc-update` becomes a small script that refuses to pull into a dirty tree, says exactly why through the deduped notifier, and never stashes or resets.
A `checkout-doctor` reports root-owned and stray files in the live checkout and the drain/supervisor refuse to run as root. With no legitimate writer left in the live checkout, the trespass guard's
false-positive class disappears and any change it sees really is trespass.

## Value Analysis

### Success Metrics

| Metric | Baseline | Target | How Measured |
|--------|----------|--------|--------------|
| `git status --porcelain` in live checkout after a full scheduler week (no human edits) | ~170 entries (146 deletions, untracked dirs, memory diffs) | 0 | `tests/runtime-state-isolation.test.mjs` fixture run + one real week post-rollout (`checkout-doctor --json`) |
| Agent memory lost to `reset --hard`/guard revert per drain pass | every pass (root gap) | 0 | audit log shows a worker `saveMemory` entry surviving the next drain pass (RS-REQ-013) |
| `sdlc-update` failures that go unannounced | 3 of last 4 days | 0 (alerted once per distinct cause per 24h) | `tests/sdlc-update.test.mjs`; `pm/error-signatures`-style ledger |
| Commits behind origin/main on the live checkout | 31 | <= 5 at any scheduled tick, or one alert outstanding | `checkout-doctor` |
| Root-owned paths in the live checkout | 2 | 0, and any new one alerts within one tick | `checkout-doctor` |
| Guard false-positive TRESPASS (rc=97) caused by a non-worker writer | 1 known (2026-11-09) | 0 | `tests/drain-trespass-guard.test.mjs` timer-writer case |

### Who Benefits

- Bryce: the working tree he opens is his own again; `git pull` works; no "why is main dirty" archaeology.
- Agents: lessons persist across drain passes, which is the point of the memory system (curriculum W6).
- The drain guard and `pr-auto-review`: they can treat any live-checkout change as a signal instead of noise.

### Benefits

- Closes the "memory wiped every drain pass" root gap without losing the human-reviewable history.
- Removes a recurring source of silent failure (update) and of destructive recovery (guard revert).
- Shrinks drain PRs: no memory churn riding along.

### Costs

- **Effort**: M. About 14 tasks. One load-config resolver, one memory-manager/version-snapshot path change, two small new scripts (`sdlc-update.mjs`, `checkout-doctor.mjs`), one migration script, one unit-file change outside the repo, guard test.
- **Risk**: losing or forking agent memory during migration (mitigated: copy-verify-then-flip, seeds kept, one-env-var rollback); a state dir that diverges between hosts (accepted: only one machine runs the timers, per host-primary-box rule); touching `hermes-drain.sh`, `drain-trespass-guard.sh` and `pr-auto-review.mjs` consumers, which are guardrail-surface files and need the interactive lane.
- **Dependencies**: none external. No new npm dependency; no OpenAI; no Anthropic API; node stdlib only. Systemd unit install touches `~/.config/systemd/user/`, which only Bryce's session may do.

### Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| **A. Gitignore the five memory layers in place** | Simplest, but the data then exists only on this disk with no history, no review, and `hermes-drain.sh`'s `clean -fdq` plus `reset` in the clone would still erase worker-written memory (gitignored files survive `clean -fd` but not `-x`; and a fresh clone has none). Fixes the dirt, not the loss. Used only for derived `vectors.json`. |
| **B. Keep memory tracked; commit it from every writer via branch+PR** | Honest history, but a PR per timer write floods review (weekly REM, every drain) and PRs conflict on one JSON file. Kept as the *publish* path, scheduled and batched, not as the write path. |
| **C. Run every timer in a dedicated worktree/clone, merge memory back by PR** | Correct isolation, but scheduler scripts are hard-wired to `~/agentic-sdlc`; every timer needs a sync step and memory is still a merge target. Over-engineered for a one-host system; the clone remains the model for the *drain*, not for cycles. |
| **D. Stash-and-pull in `sdlc-update`** | Hides human work; the standing rule is no stash/reset in the human checkout. Rejected. Alert instead. |
| **E. Track `tasks/completed/`** | Duplicates 144 files already in `tasks/queue/`; upstream does not do it. Rejected. |
| **F. Ignore `tasks/completed/`** | Hides the dir but keeps archive moving tracked files out of the queue (deletions persist). Rejected. |
| **Do nothing** | The drift, the silent update failure and the memory loss all recur weekly; the guard keeps reverting real edits. |

### Decision

Yes. Recommended: **state dir for runtime memory + frozen tracked seeds + batched `memory-publish` PR (A+B hybrid), abolish `tasks/completed/`, guarded `sdlc-update`, `checkout-doctor` + no-root drain.**
This is new capability (a state-location contract and two new tools), so it takes the full OpenSpec flow rather than the bug-fix exception.

---

## Scope

### In Scope

- `config.stateDir` resolver and `SDLC_STATE_DIR` env contract; memory read/write/snapshot/restore through it.
- One-time migration of the 20 tracked memory files into the state dir with verification; seeds retained.
- `memory-publish` (state -> seed) as a worktree + branch + PR, with `pii-scrub` and a refusal on secrets-looking content.
- `tasks/completed/` abolition: `archive` stamps `archived_at`, readers count archived-in-queue; one-time restore of the 146 moved files.
- `agents/sdlc-update.mjs` and a repo-owned unit template; alert via `triggerNotificationOnce`.
- `agents/checkout-doctor.mjs`; refusal to drain as root in `hermes-drain.sh` and `drain-supervisor.mjs`.
- Trespass guard: keep behaviour, add "no legitimate writer remains" assertion and a regression test for a timer writer.

### Out of Scope

- Changing which model or provider the drain uses; OpenRouter ladder untouched.
- Moving `pm/` (already gitignored) or `agents/versions/` (tracked snapshots stay; they are the publish target).
- Rewriting `agents/secrets.mjs` or deciding whether the VaultWarden resolver lands (separate change; here it is only reported, never touched).
- A general multi-host state sync. One host runs the timers.
- Re-enabling the Docker Hermes cron lane.

---

## User Stories (by persona)

| Persona  | User Story |
|----------|------------|
| Operator (Bryce) | As the operator, I want `git status` in `~/agentic-sdlc` to be clean unless I changed something so that I can tell my work from the machine's. |
| Operator | As the operator, I want one alert, once, when `sdlc-update` cannot pull and why, so that drift never goes unnoticed for days. |
| Agent | As an agent, I want a lesson I record in one pass to still be there in the next so that the memory system actually learns. |
| Reviewer | As the reviewer, I want memory changes to arrive as one batched, scrubbed PR so that I can approve what the agents "know". |
| Drain guard | As the guard, I want a live checkout with no legitimate writers so that any change I see is a real trespass. |

---

## Next Step

If approved: `design.md`, `specs/`, `tasks.md` are drafted alongside this proposal in the same PR. Implementation is NOT started; Bryce reviews the specs first.
