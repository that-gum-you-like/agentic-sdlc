# Proposal: autonomous-drain

**Date**: 2026-07-05
**Author**: CTO-Opus (claude-opus-4-8[1m]) with Bryce
**Status**: proposed

---

## Problem

The scheduler activates the framework's *maintenance* cycles, and OpenRouter routing makes Hermes affordable — but nothing yet **executes queued work autonomously**. Bryce wants: as the backlog/queue is populated, an agent automatically drains it using the affordable OpenRouter models, unattended.

The blocker (discovered while wiring this): the main Hermes runtime executes terminal/file operations inside a **docker sandbox** (verified — a file written by Hermes did not appear on the host). Draining through it would produce work that never reaches the host repo. Changing the global backend to `local` would de-sandbox the entire assistant (voice, WhatsApp, everything) — an unacceptable security downgrade for a daily assistant.

## Discovery

- Hermes terminal backend is set by config (`terminal.backend`) / env (`TERMINAL_ENV`), and all execution routes through the single running gateway — so it can't be scoped per-invocation while the gateway is up.
- **A separate `HERMES_HOME` profile runs standalone (no gateway) with its own backend.** Verified: `HERMES_HOME=~/.hermes-drain` (with `terminal.backend: local`) ran Hermes in the **real host repo** (`pwd=/home/bryce/agentic-sdlc`) and its file **persisted to the host**.
- `gh` is authenticated on the host; the queue-drainer exposes ready-task counts; the repo is normally idle on `main`.

## Proposed Solution

An **isolated drain profile + a guarded runner + a systemd timer**:

1. **`~/.hermes-drain/`** — a standalone Hermes profile: OpenRouter affordable ladder (same as the main assistant) + `terminal.backend: local` + no gateway. The main `~/.hermes` assistant stays docker-sandboxed and untouched.
2. **`agents/hermes-drain.sh`** — the runner. Acts **only** when the repo is idle on `main` with a clean tree AND a task is ready (idle ticks make no LLM call); single-flight lock; caps unreviewed drain PRs; then invokes the isolated Hermes on `agents/drain-prompt.md`.
3. **`agents/drain-prompt.md`** — the autonomy contract: take ONE ready task, branch from `main`, implement per CLAUDE.md + OpenSpec, run tests, and **open a PR for human review** — never touching `main`, never merging, never running destructive commands. If tests fail, leave the task blocked rather than commit broken code.
4. **Schedule** — a `sdlc-sched-autonomous-drain` systemd timer (every 15 min) added to `cron-schedule.json.template` and installed via `scheduler-install.mjs`.

## Value Analysis

- **Delivers the requested capability:** as the queue populates, affordable OpenRouter models drain it unattended — the missing "execution" half of autonomous operation (the audit noted orchestration only *assembles* prompts today).
- **Safe by construction:** isolated profile (main assistant stays sandboxed); PR-review gate (never merges, never touches main); acts only from a clean idle `main`; destructive-command prohibitions; back-pressure cap; cost-gated so idle polling is free.
- **Cheap:** free coders first, cheap paid fallback; only fires when there's actually a ready task.
- **Reversible:** delete the timer (`scheduler-install uninstall`) and the `~/.hermes-drain` profile; nothing about the main assistant changed.
- **Cost:** M. One profile + one runner + one prompt + one timer + tests. Risk is the autonomy itself — bounded by the PR-gate and the hard constraints; a human reviews every PR before merge.
