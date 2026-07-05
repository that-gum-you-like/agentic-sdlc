# Spec: live-scheduler

**Date**: 2026-07-05
**Status**: specs
**Capability**: NEW

---

## Overview

Activates the framework's documented schedule as live systemd user timers via a single stdlib-only installer, so the iteration cycles and Hermes cron scripts run autonomously for as long as the machine is online.

---

### REQ-001: Installer Exists and Matches Framework Conventions

**Statement:** The system shall provide `agents/scheduler-install.mjs` following the framework's script conventions.

**Acceptance Criteria:**
- [ ] Begins with `#!/usr/bin/env node` + a JSDoc usage header; imports only Node stdlib + `load-config.mjs` / `capability-logger.mjs` (zero npm deps)
- [ ] Guards its CLI entry with `__isMainModule`; importing the module writes nothing, prints nothing, and does not shell out
- [ ] Exports pure helpers (`cronToOnCalendar`, `selectJobs`, `buildUnits`, `loadSchedule`) for testing
- [ ] Logs capability usage via `logCapabilityUsage()` on a real install
- [ ] Commands: `list`, `install [--dry-run]`, `status`, `uninstall`

**Complexity:** M · **Value:** High

---

### REQ-002: Correct, Verified cron → OnCalendar Translation

**Statement:** The installer shall translate every 5-field cron expression in the schedule into a valid systemd `OnCalendar` spec.

**Acceptance Criteria:**
- [ ] Supports `*`, integers, and step forms (`*/N`, `A/N`) across all five fields
- [ ] Maps cron day-of-week `0..7` (0/7 = Sunday) to the `Sun..Sat` prefix; omits it when `*`
- [ ] Throws on a non-5-field expression
- [ ] Every translation used by `cron-schedule.json.template` is accepted by `systemd-analyze calendar`
- [ ] A test asserts the full translation table + the malformed-throw

**Complexity:** M · **Value:** High

---

### REQ-003: Reality-Matched Job Selection

**Statement:** The installer shall install only jobs whose required agent and adapter are present, skipping the rest with a stated reason.

**Acceptance Criteria:**
- [ ] A job with `agentRequired` not in the project's configured agents is skipped
- [ ] A job with `adapterRequired` ≠ the active orchestration adapter is skipped
- [ ] `list` prints both the install set and the skipped set with reasons
- [ ] Agents are read from `budget.json`; adapter from `project.json.orchestration.adapter`

**Complexity:** S · **Value:** Medium

---

### REQ-004: Persistent, Isolated, Reversible Units

**Statement:** Installed units shall run whenever the machine is online, catch up missed runs, and be safely removable without affecting unrelated user units.

**Acceptance Criteria:**
- [ ] Each job renders a `Type=oneshot` `.service` (absolute `ExecStart`, `WorkingDirectory` + `SDLC_PROJECT_DIR` pinned to the repo) and a `.timer` with `Persistent=true` and `WantedBy=timers.target`
- [ ] `ExecStart` contains no unexpanded `~` and uses an absolute node path
- [ ] Every managed unit name is prefixed `sdlc-sched-`; `uninstall` only ever disables/removes `sdlc-sched-*` (a pre-existing `sdlc-update.timer` is provably untouched)
- [ ] `install` is idempotent (re-run overwrites + re-enables); `--dry-run` writes/enables nothing
- [ ] After `install`, `systemctl --user list-timers 'sdlc-sched-*'` shows every selected job enabled with a future `NEXT`

**Complexity:** M · **Value:** High
