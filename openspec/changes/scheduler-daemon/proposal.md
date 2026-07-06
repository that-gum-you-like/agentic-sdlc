# Proposal: scheduler-daemon

**Date**: 2026-07-05
**Author**: CTO-Opus (claude-opus-4-8[1m]) with Bryce
**Status**: proposed

---

## Problem

The framework documents a full set of automated iteration cycles (daily review, cost report, weekly pattern-hunt/REM-sleep, monthly behavior audit, model-manager checks) and the newly-ported Hermes cron scripts (`health-check`, `red-team-tester`, `rag-indexer`, `document-sync`). Their cadence lives in `agents/templates/cron-schedule.json.template` and as OpenClaw-cron one-liners in the docs — but **nothing actually runs them**. The `hermes-integration` change explicitly left "standing up a live scheduler" as a Non-Goal.

Bryce wants these to run autonomously **for as long as this machine is online**, with runs missed during downtime caught up on next boot. That requires activating the schedule, not just documenting it.

---

## Discovery

- **Host reality:** Linux with the **systemd user manager running** and **`loginctl` linger already enabled** (`Linger=yes`) — so user timers run on boot and persist across logout without an active session. `XDG_RUNTIME_DIR` is set; `systemctl --user` works. A pre-existing `sdlc-update.timer` (daily `git pull`) already uses this mechanism — proof the pattern is viable and in use.
- **Schedule source of truth:** `agents/templates/cron-schedule.json.template` — 13 jobs, each `{name, cron, script, description, session}` with optional `agentRequired` / `adapterRequired` gates.
- **Config reality:** this repo's `agents/project.json` uses the `file-based` adapter; `budget.json` configures 4 agents (`sdlc-developer`, `jony-aive`, `sdlc-reviewer`, `sdlc-documentarian`). So `orchestration-sync` (needs paperclip) and `dependency-audit` / `performance-check` (need those agents) must be **skipped** — 10 of 13 jobs are live-able here.
- **Constraints:** zero npm deps; every script ships a test; `__isMainModule` guard; privacy-first (no cloud egress — this is purely local systemd). Must never clobber unrelated user units (e.g. `sdlc-update`).

---

## Proposed Solution

Add **`agents/scheduler-install.mjs`** — a stdlib-only installer that turns the schedule config into live **systemd user timers**:

- Reads `agents/cron-schedule.json` (falls back to the shipped `.template`), selects jobs whose required agent/adapter is actually present, and **skips the rest with a stated reason**.
- Translates each 5-field cron expression into a systemd `OnCalendar` spec (validated against `systemd-analyze`), and renders a `oneshot` `.service` + a `Persistent=true` `.timer` per job under `~/.config/systemd/user/`.
- Namespaces every unit `sdlc-sched-*` so `uninstall` can never touch unrelated units.
- Commands: `list` (preview), `install [--dry-run]`, `status` (`list-timers`), `uninstall`.
- Each timer pins `WorkingDirectory` + `SDLC_PROJECT_DIR` to the repo so the jobs resolve config correctly. `Persistent=true` catches up runs missed while the machine was off.

Docs (`script-reference`, `iteration-cycles`) point at the installer as the concrete "activate the schedule" step alongside the existing OpenClaw-cron one-liners.

**Non-Goals:** a bespoke always-on daemon process (systemd *is* the supervisor); wiring per-project schedules for other repos (this activates the framework repo's own cycles — the installer is reusable per-project via `SDLC_PROJECT_DIR`); any cloud scheduler (tracked separately — see Value Analysis).

---

## Value Analysis

- **Turns documented cadence into actual autonomous operation** — the maturity model's Automation level assumes these cycles *run*; until now they didn't. This closes that gap for the framework repo itself.
- **Robust by construction:** systemd supervises, restarts are unnecessary (oneshot), `Persistent=true` recovers missed runs, and per-job `agentRequired`/`adapterRequired` gating means the install set always matches reality. No daemon to crash.
- **Safe:** `sdlc-sched-*` namespace + reason-logged skips + a tested cron→OnCalendar translator (verified against `systemd-analyze`). Uninstall is total and scoped.
- **Privacy-first:** entirely local; no cloud, no network scheduler, no third-party.
- **Cost:** S–M. One new script + one test + two doc pointers; additive, zero deps. Risk low — no existing code paths changed; a mis-render is caught by `--dry-run` and `systemd-analyze` before anything is enabled.
- **Cloud option (deferred):** a Cloudflare + Postgres cloud instance could run an always-on subset independent of this machine, but the cron scripts are local-filesystem Node CLIs (they read the repo, queue, and memory) — cloud execution needs a different architecture (container/VM or a Worker that triggers a webhook here). Captured in BACKLOG, not built here.
