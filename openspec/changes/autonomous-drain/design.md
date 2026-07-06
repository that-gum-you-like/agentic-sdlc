# Design: autonomous-drain

**Date**: 2026-07-05
**Status**: design

---

## Context

Draining coding tasks requires a tool-calling agent that edits files, runs tests, and uses git — the framework delegates that to Hermes (affordable OpenRouter models). The only obstacle is that the main Hermes runs in a docker sandbox that doesn't persist to the host. The design isolates the drain into its own local-backend Hermes profile so work lands on the host repo, and wraps it in guards + a PR-review gate so unattended cheap-model execution stays safe.

## Goals

- Autonomous, unattended draining of ready queue tasks using affordable models.
- Zero blast radius on `main`; every result is a reviewable PR.
- Main Hermes assistant untouched (still sandboxed).
- Idle operation is free (no LLM call unless a task is ready).

## Non-Goals

- Auto-merging PRs (human reviews every drain PR).
- Draining while the repo is mid-development (only acts on a clean, idle `main`).
- Populating the queue (that's the planning pipeline / seed-queue; this consumes the queue).
- Changing the main assistant's sandbox.

## Design

### Isolation
`~/.hermes-drain/config.yaml`: primary `qwen/qwen3-coder:free` + the OpenRouter fallback ladder, `terminal.backend: local`, `use_gateway: false` everywhere, STT disabled. `.env` copied for `OPENROUTER_API_KEY`. Invoked as `HERMES_HOME=~/.hermes-drain hermes -z <prompt> --cli --yolo` — standalone, no gateway, runs in the host CWD. Verified to persist to the host repo.

### Runner guards (`agents/hermes-drain.sh`) — in order, fail-safe
1. **Single-flight lock** (`pm/.hermes-drain.lock`, stale after 2h).
2. **On `main` only** — skip if the repo is on any other branch (won't disturb active dev).
3. **Clean tree** — skip if `git status --porcelain` is non-empty.
4. **Cost gate** — parse `queue-drainer status`; skip (no LLM call) if `Ready (unblocked) == 0`.
5. **Back-pressure** — skip if ≥ `MAX_OPEN_DRAIN_PRS` (default 3) open `agent/drain/*` PRs await review.
6. Invoke the isolated Hermes with a 1h timeout; tee to `pm/drain-logs/`.

`--dry-run` reports what it would do without invoking the model.

### Autonomy contract (`agents/drain-prompt.md`)
ONE task → claim → branch `agent/drain/<id>` from `origin/main` → implement per CLAUDE.md/OpenSpec → `npm test` (≤2 fix attempts) → commit + push + `gh pr create` (no merge) → mark complete → return to `main`. Hard prohibitions: never commit/reset/force-push/merge `main`; no `rm -rf`/`git clean`/`git reset --hard`; never touch `.env`/secrets/`~/.hermes*`/other repos; one task per run; STOP + leave blocked if ambiguous or tests won't pass (a half-working PR is worse than none).

### Scheduling
`cron-schedule.json.template` gains `autonomous-drain` (`*/15 * * * *`) → `scheduler-install.mjs` renders `sdlc-sched-autonomous-drain.{service,timer}` (the runner is a `#!/usr/bin/env bash` executable, so `ExecStart` is its absolute path — no `node` prefix). Every 15 min the guards run; the LLM fires only when there's real, ready work on a clean idle `main`.

### Testing
`tests/hermes-drain.test.mjs`: script exists + executable; contains each guard (main-only, clean-tree, cost-gate, PR-cap, lock, isolated-profile env); the prompt encodes the hard constraints (never main/merge/force-push, PR-gate, one task, no `rm -rf`); and — the behavioral check — running it on a non-`main` branch is a safe no-op that never reaches the Hermes invocation. Wired into `npm test`.
