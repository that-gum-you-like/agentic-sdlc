# Spec: autonomous-drain

**Date**: 2026-07-05
**Status**: specs
**Capability**: NEW

---

## Overview

An isolated, local-backend Hermes profile drains ready queue tasks unattended using affordable OpenRouter models and opens PRs for human review, without de-sandboxing the main assistant and without ever touching `main`.

---

### REQ-001: Isolated Drain Profile

**Statement:** The drain shall run in a standalone Hermes profile separate from the main assistant.

**Acceptance Criteria:**
- [ ] `~/.hermes-drain/` provides `config.yaml` (OpenRouter affordable ladder, `terminal.backend: local`, gateway disabled) and `.env` with `OPENROUTER_API_KEY`
- [ ] Invoking `HERMES_HOME=~/.hermes-drain hermes` operates on the **host** repo (verified: a file it writes persists to `~/agentic-sdlc`)
- [ ] The main `~/.hermes` profile is unchanged (still `terminal.backend: docker`)

**Complexity:** S · **Value:** High

---

### REQ-002: Guarded, Cost-Gated Runner

**Statement:** `agents/hermes-drain.sh` shall invoke the drain only when it is safe and productive to do so.

**Acceptance Criteria:**
- [ ] Skips unless the repo is on `main` with a clean working tree
- [ ] Skips (making **no LLM call**) when `queue-drainer status` reports zero ready/unblocked tasks
- [ ] Uses a single-flight lock (stale after 2h) and skips when ≥ N (default 3) open `agent/drain/*` PRs await review
- [ ] `--dry-run` reports intent without invoking the model
- [ ] Runs the isolated profile with a bounded timeout and logs to `pm/drain-logs/`

**Complexity:** M · **Value:** High

---

### REQ-003: Safe Autonomy Contract

**Statement:** The drain prompt shall constrain the agent to reviewable, non-destructive output.

**Acceptance Criteria:**
- [ ] Processes exactly ONE ready task per run
- [ ] Works on a new `agent/drain/<task-id>` branch off `main`; never commits/pushes/resets/force-pushes/merges `main`
- [ ] Opens a PR for human review and never merges it
- [ ] Requires `npm test` to pass before committing; leaves the task blocked (no PR) if it can't
- [ ] Forbids destructive commands and touching `.env`/secrets/`~/.hermes*`/other repos
- [ ] A test asserts the prompt encodes these constraints and that a non-`main` run is a safe no-op

**Complexity:** M · **Value:** High

---

### REQ-004: Scheduled Activation

**Statement:** The drain shall run automatically on a schedule via the framework's timer installer.

**Acceptance Criteria:**
- [ ] `cron-schedule.json.template` includes an `autonomous-drain` job (`*/15 * * * *`)
- [ ] `scheduler-install.mjs` renders and installs `sdlc-sched-autonomous-drain.{service,timer}` with an absolute `ExecStart`
- [ ] Removable via `scheduler-install.mjs uninstall`

**Complexity:** S · **Value:** Medium
