# Spec: scheduled-self-improvement

**Date**: 2026-05-21
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: specs
**Capability**: NEW

---

## Overview

This capability turns the existing self-improvement scripts (queue-drainer, daily-review, weekly-review, alignment-monitor, pattern-hunt, capability-monitor, maturity-assess, garden-roadmap, cost-tracker, seed-queue-from-openspec) into a cron-driven autonomous loop using `systemd --user` timers. The loop combines non-LLM housekeeping (frequent, free) with LLM task execution (throttled, budgeted). It includes an installer that reconstitutes the full schedule from a fresh clone via `setup.mjs --install-timers`.

---

## Requirements

### REQ-001: Cron Installer Idempotency

**Statement:** The system shall provide `agents/cron-installer.sh install` which installs all systemd user timers and is safely idempotent — running it twice in succession leaves the same end state as running it once.

**Acceptance Criteria:**
- [ ] First run creates all timer + service files in `~/.config/systemd/user/`
- [ ] Second run produces no diff (file mtimes may change but content identical)
- [ ] Returns non-zero exit code if `systemctl --user` is unavailable
- [ ] `uninstall` subcommand removes all installed sdlc-* timers and reloads daemon
- [ ] `status` subcommand shows each timer's last-run, next-run, and state in table form

**Dependencies:** none

**Complexity:** M

**Value:** Critical

**Notes:** Templates live in `agents/templates/systemd/`. The installer substitutes `$AGENTIC_SDLC_HOME` at install time. Persistent=true on all timers so missed ticks during sleep fire on wake.

---

### REQ-002: Nine Recurring Cycles

**Statement:** The system shall install exactly the following nine `sdlc-*.timer` units with the locked cadences:

| Timer | OnCalendar (or OnUnitActiveSec) | Unit |
|---|---|---|
| `sdlc-seed-queue.timer` | `*-*-* *:00/15` (every 15 min) | seed-queue-from-openspec |
| `sdlc-capability-monitor.timer` | `*-*-* */6:17:00` (every 6h at :17) | capability-monitor.mjs check |
| `sdlc-cost-tracker.timer` | `*-*-* 06:23:00` (daily 06:23) | cost-tracker.mjs report |
| `sdlc-garden-roadmap.timer` | `*-*-* 06:27:00` (daily 06:27) | garden-roadmap.mjs --status |
| `sdlc-queue-drain.timer` | `*-*-* 08..22:13:00` (hourly 08-22 at :13) | queue-drainer.mjs run |
| `sdlc-alignment-monitor.timer` | `*-*-* 12:33:00` (daily 12:33) | alignment-monitor.mjs |
| `sdlc-metrics.timer` | `*-*-* 06:37:00` (daily 06:37) | metrics.mjs |
| `sdlc-daily-review.timer` | `*-*-* 23:07:00` (daily 23:07) | cycles/daily-review.mjs |
| `sdlc-weekly-review.timer` | `Sun 23:43:00` (weekly Sun 23:43) | cycles/weekly-review.mjs |

**Acceptance Criteria:**
- [ ] `systemctl --user list-timers sdlc-*` returns 9 active timers after install
- [ ] None of the cadences land on `:00` or `:30` (avoids the global rush)
- [ ] All timers have `Persistent=true`
- [ ] All services have `Type=oneshot` and a sensible `WorkingDirectory`
- [ ] Service unit files use absolute paths (no shell-aliases assumed)

**Dependencies:** REQ-001

**Complexity:** M

**Value:** Critical

**Notes:** Off-minute timing prevents fleet-wide thundering-herd. The `queue-drain` window (08-22) matches Bryce's machine-awake hours.

---

### REQ-003: Token Budget Circuit-Breaker

**Statement:** The system shall enforce a daily LLM-token budget across all cron-fired jobs and pause LLM-using crons when the budget is exhausted.

**Acceptance Criteria:**
- [ ] `budget.json` gains a `cronTokenBudget` object: `{ dailyLimit: number, circuitBreak: boolean, warningThreshold: number }`
- [ ] Default `dailyLimit` = 200000 tokens
- [ ] Cron-fired scripts read the current day's spend from `pm/cost-tracker.jsonl` and skip if `dailySpend >= dailyLimit && circuitBreak === true`
- [ ] Skip events are logged via log.mjs at `warn` level
- [ ] A `warningThreshold: 0.8` triggers a notify.mjs send at the warning level (file or openclaw)
- [ ] Daily budget resets at UTC midnight (cron-fired jobs read budget against the day in which they fire)

**Dependencies:** REQ-002, structured-observability/REQ-001

**Complexity:** S

**Value:** Critical

**Notes:** Non-LLM crons (seed-queue, garden-roadmap, capability-monitor, metrics) are NEVER paused by this circuit-breaker.

---

### REQ-004: Schedule Reconstitution from Fresh Clone

**Statement:** The system shall provide `setup.mjs --install-timers` that reconstitutes the full cron schedule on a fresh clone of agentic-sdlc, requiring zero manual systemd configuration.

**Acceptance Criteria:**
- [ ] Adding `--install-timers` to `setup.mjs` invokes `cron-installer.sh install` after the standard setup completes
- [ ] On a machine with no prior agentic-sdlc install, running `git clone ... && cd agentic-sdlc && node setup.mjs --install-timers` results in 9 active sdlc-* timers
- [ ] `setup.mjs --dry-run --install-timers` previews timer files without actually writing
- [ ] If systemd user mode is unavailable (e.g. macOS launchd, Windows), the flag prints a clear error and instructions for manual setup

**Dependencies:** REQ-001, REQ-002

**Complexity:** S

**Value:** High

**Notes:** Portability requirement from proposal ("clone to any device").

---

### REQ-005: Skipped Cycles Are Observable

**Statement:** The system shall log every skipped cycle (due to debounce, budget circuit-break, file lock, disabled project, or other reason) so missed work is visible.

**Acceptance Criteria:**
- [ ] Every skip emits a `warn`-level log line with `data: { reason, cycle, project? }`
- [ ] Daily-review.mjs includes a "Skipped Cycles" section in pm/DASHBOARD.md
- [ ] Metrics.mjs computes a "skip rate" per cycle in pm/METRICS.md
- [ ] If skip rate exceeds 30% for any cycle over a 24h window, an alert is sent via notify.mjs

**Dependencies:** REQ-003, structured-observability/REQ-001

**Complexity:** S

**Value:** Medium

**Notes:** Without visibility, missed work is silently lost — defeats the "self-improving" property.

---

## Acceptance Criteria (Scenarios)

### Scenario 1: Fresh Install Produces a Running Schedule

**Verifies:** REQ-001, REQ-002, REQ-004

**WHEN** Bryce runs `node setup.mjs --install-timers` on a clean machine with `systemd --user` available

**THEN** `systemctl --user list-timers sdlc-*` returns exactly 9 timers, all enabled and active

**AND** Each timer's `NEXT` field is non-empty (timer is scheduled)

**AND** The first `sdlc-seed-queue.timer` tick fires within 15 minutes and writes a log line to `pm/logs/<today>.jsonl`

---

### Scenario 2: Budget Exhaustion Pauses LLM Crons but Not Housekeeping

**Verifies:** REQ-003

**WHEN** The day's LLM token spend reaches `budget.json.cronTokenBudget.dailyLimit` at 14:00 local

**THEN** The 15:13 `sdlc-queue-drain` fire skips with `warn` log line `{ reason: "daily-token-budget-exhausted" }`

**AND** The 18:00 `sdlc-capability-monitor` fire runs normally (no LLM call)

**AND** The 06:23 next-day `sdlc-cost-tracker` fire runs (budget reset at UTC midnight)

---

### Scenario 3: Idempotent Reinstall

**Verifies:** REQ-001

**WHEN** `cron-installer.sh install` is run twice in succession

**THEN** Both runs exit with code 0

**AND** The set of `~/.config/systemd/user/sdlc-*` files is identical after the second run

**AND** No timer is paused, restarted, or otherwise disrupted

---

### Scenario 4: Error Case — systemd Unavailable

**Verifies:** REQ-001, REQ-004

**WHEN** `cron-installer.sh install` runs on a machine without `systemd --user`

**THEN** It exits with code 1 and stderr includes "systemd user mode not available; see docs/macos-cron-setup.md"

**AND** No files are written to `~/.config/systemd/user/`

---

### Scenario 5: Edge Case — Persistent Timer Catches a Sleep-Missed Tick

**Verifies:** REQ-002

**WHEN** Bryce's laptop is closed at 12:30 local and reopens at 14:00 local

**THEN** Within 60 seconds of wake, the missed `sdlc-queue-drain` timer (scheduled for 13:13) fires once

**AND** Subsequent ticks (14:13 etc.) fire on schedule

---

## Invariants

- Non-LLM crons (seed-queue, garden-roadmap, capability-monitor, metrics) never call any LLM provider directly or indirectly
- All cron jobs run as Bryce's user (not root)
- No cron writes outside the agentic-sdlc workspace or `pm/` directories of registered projects
- Daily token budget resets cleanly at UTC midnight regardless of timer firing times

---

## Out of Scope

- System (root) cron support — user mode only
- macOS launchd support (Open Question; future change)
- Windows Task Scheduler support (Open Question; future change)
- Web-UI for cron management (Paperclip will serve this need)

---

## Test Mapping

| Scenario | Test File | Test Name |
|---|---|---|
| Scenario 1 | `tests/cron-installer.smoke.test.sh` | "fresh install produces 9 timers" |
| Scenario 2 | `tests/budget-circuit-break.test.mjs` | "exhausted budget pauses LLM crons" |
| Scenario 3 | `tests/cron-installer.idempotent.test.sh` | "double install is idempotent" |
| Scenario 4 | `tests/cron-installer.no-systemd.test.sh` | "exits cleanly when systemd missing" |
| Scenario 5 | manual | observed during Day 1-7 verification |
