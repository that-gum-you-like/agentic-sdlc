# Drain any SDLC project, not just this repo

## Why

`autonomous-drain` shipped and works — but only against `~/agentic-sdlc` itself. Pointing it at another SDLC-bootstrapped project (`SDLC_REPO=~/tally`) fails, and **fails silently in the worst possible way**: it reports `no ready tasks — skip`, which is indistinguishable from a genuinely empty queue.

Found while seeding a 24-task backlog into `~/tally` for the `game-log-inventory` change. The queue was full and unblocked; the drain insisted there was nothing to do.

Three repo-relative assumptions in `agents/hermes-drain.sh` cause it:

1. **Cost gate runs the framework from the target repo.** Line 51 does `cd "$REPO"` then `node agents/queue-drainer.mjs status`. The framework scripts live in `~/agentic-sdlc/agents/`; a bootstrapped project's `agents/` holds only project config (`project.json`, `domains.json`, `AGENT.md`s). So the node call dies with "Cannot find module" — and because the gate pipes stderr to `/dev/null` and defaults the count to `0`, the crash is laundered into "no ready tasks".
2. **Base branch is hardcoded to `main`.** Lines 82–83 run `checkout -f -B main origin/main` and `reset --hard origin/main` in the clone. `~/tally`'s default branch is `master`, so the clone checkout fails and the run aborts — after the LLM gate has already passed, so it burns the setup for nothing.
3. **Prompt file is looked up in the target repo.** Line 21 resolves `agents/drain-prompt.md` under `$REPO`. Only the framework repo has one.

The irony is that `load-config.mjs` *already* supports `SDLC_PROJECT_DIR` and `--project-dir` precisely so framework scripts can run cross-project. The drain script is the one piece that doesn't use that capability.

This blocks the thing the framework exists for: draining a real product backlog. `~/tally` is the first real customer of it.

## What Changes

`agents/hermes-drain.sh` learns the difference between **where the framework lives** and **which project it is draining**.

- **Separate the two paths.** A new `SCRIPTS_DIR` resolves to the directory the drain script itself lives in (so the framework is found regardless of `SDLC_REPO`). The cost gate becomes `node "$SCRIPTS_DIR/queue-drainer.mjs" status --project-dir "$REPO"`, using the cross-project support `load-config.mjs` already has. `PROMPT_FILE` falls back to the framework's `drain-prompt.md` when the target project has none, and a project may still override it with its own.
- **Detect the base branch.** The clone's base branch is read from `origin/HEAD` (falling back to `main`), and is overridable with `SDLC_BASE_BRANCH`. `main` stops being an assumption.
- **Stop laundering failures into "no tasks".** The cost gate distinguishes *"the status command failed"* from *"the status command reported zero"*. A failure logs the actual stderr and exits non-zero instead of reporting an empty queue. This is the defect that cost the most time and it is the most important part of the change.
- **Per-project drain state.** `DRAIN_CLONE` and the log directory derive from the project name so two projects can be drained without colliding, and the mutex stays shared (still drain XOR review, one autonomous job at a time).

### Explicitly unchanged
- The safe-autonomy contract (`REQ-003`): one task per run, branch + PR, never merge, never touch `main`, no destructive commands.
- The single-flight mutex, the open-PR back-pressure cap, and the `FIX-*` bypass.
- The isolated `~/.hermes-drain` profile and the OpenRouter ladder.
- The main repo is still never touched — dedicated clone only.

## Value Analysis

**Value: High.** The framework's stated purpose is draining real backlogs autonomously. Today it can only drain its own repo — the framework can automate the framework, which is circular. This is the change that makes it usable on a product.

- **Unblocks the first real consumer.** `~/tally` has a 24-task `game-log-inventory` backlog queued and correctly routed. It cannot drain a single task until this lands.
- **Removes a trust-destroying failure mode.** A drain that reports "no ready tasks" while the queue is full is worse than one that crashes: it runs every 15 minutes, looks healthy, and does nothing. Any future project hitting this would lose the same hours. Cost of the bug scales with the number of projects onboarded.
- **Cheap and contained.** One shell script, ~30 lines changed, three regression tests. No change to `queue-drainer.mjs`, `load-config.mjs`, or the autonomy contract.
- **Cost of delay:** every project onboarded before this lands inherits a drain that silently does nothing.
- **Risk:** low. The default `SDLC_REPO` is unchanged, so the installed timer behaves exactly as today. The one visible side effect is a one-time re-clone from the renamed default clone path.

**Alternative considered and rejected:** hand-run the tally backlog through the interactive assistant. Faster once, but it forfeits the entire point of the exercise — Bryce asked specifically to *test the agents automatically working through the backlog*.

## Capabilities

### Modified Capabilities
- `autonomous-drain`: the runner targets any SDLC-bootstrapped project rather than only the framework repo — framework scripts resolved independently of the target, base branch detected rather than assumed, per-project clone and logs, and a cost gate that reports failure as failure instead of as an empty queue.

## Impact

- **`agents/hermes-drain.sh`** — the only file with behavior changes.
- **`tests/hermes-drain.test.mjs`** — extend with the three regressions: framework-script resolution independent of `SDLC_REPO`, non-`main` base branch detection, and a failing status command not being reported as zero ready tasks.
- **No change** to `queue-drainer.mjs`, `load-config.mjs`, or the drain prompt — the cross-project capability they expose is being *used*, not extended.
- **Consumers**: `~/tally` becomes drainable, unblocking its 24-task `game-log-inventory` backlog. The `sdlc-sched-autonomous-drain` timer keeps its current behavior by default (`SDLC_REPO` still defaults to `~/agentic-sdlc`).
