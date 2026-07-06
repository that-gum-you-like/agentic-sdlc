# Design: scheduler-daemon

**Date**: 2026-07-05
**Status**: design

---

## Context

The framework already carries the *what* and *when* of automation (the schedule template) and the *how to run one thing* (each script's CLI). What's missing is a supervisor that fires them on cadence and survives reboots. Rather than write a bespoke long-running daemon (which would need its own crash-recovery, logging, and a cron parser), we delegate supervision to the **systemd user manager** — already running on the host with linger enabled — and generate its units from the existing schedule config. systemd gives us persistence, missed-run catch-up, journald logging, and per-unit control for free.

## Goals

- One installer script converts the schedule config → live, enabled `sdlc-sched-*` systemd user timers, idempotently.
- Only jobs whose `agentRequired`/`adapterRequired` are satisfied get installed; the rest are skipped with a reason.
- cron→OnCalendar translation is correct for every form the template uses, and verified.
- Uninstall is total and scoped to `sdlc-sched-*` only — never touches unrelated user units.
- Zero npm deps; side-effect-free import; tested.

## Non-Goals

- A custom daemon process. systemd is the supervisor.
- Scheduling other project repos in this change (reusable via `SDLC_PROJECT_DIR`, but out of scope to configure here).
- Cloud scheduling (Cloudflare/Postgres) — different architecture; deferred to BACKLOG.
- Wiring `--notify` destinations beyond what each script already does (the `telegram`/`file`/`openclaw` provider choice is a `project.json` setting).

## Design

### cron → OnCalendar

A 5-field cron expression `min hour dom mon dow` maps to systemd `[<Dow> ]*-<mon>-<dom> <hour>:<min>:00`:

- Each field: `*` → `*`; `A/N` or `*/N` → `<A|0>/N` (systemd step form); integer → zero-padded.
- Day-of-week: cron `0..7` (0/7 = Sunday) → `Sun..Sat` prefix; omitted when `*`.

Every translation the template needs was checked against `systemd-analyze calendar` (e.g. `*/15 * * * *` → `*-*-* *:0/15:00` → normalized `*:00/15`; `0 6 1 * *` → `*-*-01 06:00:00`; `0 23 * * 0` → `Sun *-*-* 23:00:00`). Malformed (non-5-field) expressions throw.

### Unit rendering

Per job, a pair:

```ini
# sdlc-sched-<name>.service
[Unit]
Description=Agentic SDLC — <description>
After=network-online.target
[Service]
Type=oneshot
WorkingDirectory=<repoDir>
Environment=PATH=<node dir>:/usr/local/bin:/usr/bin:/bin
Environment=SDLC_PROJECT_DIR=<repoDir>
ExecStart=<abs node> <abs script> <args>

# sdlc-sched-<name>.timer
[Timer]
OnCalendar=<translated>
Persistent=true
AccuracySec=1min
[Install]
WantedBy=timers.target
```

`ExecStart` is made absolute: the leading `node` token → `process.execPath`, and `~/` → `$HOME`. `Type=oneshot` because each job runs to completion and exits (no long-running process). `Persistent=true` re-runs a job whose window elapsed while the machine was off. Pinning `SDLC_PROJECT_DIR` guarantees `load-config.mjs` resolves this repo regardless of the timer's cwd.

### Selection gating

`selectJobs(jobs, {agents, adapter})` drops any job with an `agentRequired` not in `agents` or an `adapterRequired` ≠ the active adapter, recording a `skipReason`. `agents` comes from `budget.json` keys; `adapter` from `project.json.orchestration.adapter`.

### Safety

- **Namespace:** every managed unit is `sdlc-sched-*`. `uninstall` globs only that prefix — a pre-existing `sdlc-update.timer` is provably out of reach.
- **Dry-run:** `install --dry-run` prints the exact unit text without writing or enabling. `list` shows the plan (incl. skips). `systemd-analyze` validates OnCalendar before real enable.
- **Idempotent:** re-`install` overwrites unit files and re-`enable --now`s; `daemon-reload` picks up changes.

### Testing

`tests/scheduler-install.test.mjs` (pure functions, no systemctl, no writes): cron→OnCalendar table incl. every template form + malformed-throw; `selectJobs` gating; `buildUnits` shape (oneshot, absolute ExecStart, no unexpanded `~`, Persistent timer, correct names); `loadSchedule` returns jobs and every entry translates. Import is side-effect-free (`__isMainModule` guard). The live install is verified operationally via `status` (`systemctl --user list-timers`) and a manual `systemctl --user start` test-fire.
