# Spec: supply-chain-security-program — Scheduler Node-Path Fix

**Date**: 2026-09-15
**Author**: Claude (Opus 5) with Bryce
**Status**: specs
**Requirement band**: `SCS-REQ-030` – `SCS-REQ-039`

---

## Overview

A latent outage found while surveying the scheduler for this change, fixed here because sentinel's
own timers would otherwise inherit it. Every generated unit hardcodes a version-pinned Homebrew
Cellar node path. The next `brew upgrade node` breaks all 20 live timers at once, silently, with
rc=127 — including the security timers this change adds.

Root cause, verified 2026-09-15: `agents/scheduler-install.mjs:231` sets `nodeBin =
process.execPath`. On this host `/home/linuxbrew/.linuxbrew/bin/node` is a symlink whose realpath
is `/home/linuxbrew/.linuxbrew/Cellar/node/25.6.1/bin/node`, so `process.execPath` resolves through
it and the version lands in `Environment=PATH=` and `ExecStart=` of every unit.

---

## Requirements

### SCS-REQ-030: Generated units use a version-stable node path

**Statement:** The system shall generate units referencing a version-stable node path whenever one
resolves to the same binary as the running interpreter.

**Acceptance Criteria:**
- [ ] When a stable shim path's `realpath` equals `process.execPath`, the shim path is used in both `ExecStart` and `PATH`
- [ ] When no stable shim resolves to the same binary, `process.execPath` is used unchanged
- [ ] No generated unit contains a version-pinned Cellar path
- [ ] The resolution function is unit-tested with injected probes — no real filesystem needed
- [ ] Edge case: a non-Homebrew node (system, nvm, asdf) is handled without special-casing Homebrew
- [ ] Edge case: a broken symlink falls back rather than throwing

**Dependencies:** None
**Complexity:** S
**Value:** CRITICAL
**Notes:** Surgical and separately committed — `scheduler-install.mjs` is contended by six active
changes (`auto-review-merge`, `business-os`, `scheduler-daemon`, `command-center-visibility`,
`telegram-activation`, `pilot-autonomous-replication`).

---

### SCS-REQ-031: Existing units are migrated

**Statement:** The system shall regenerate all installed `sdlc-sched-*` units so no live timer
retains a version-pinned node path.

**Acceptance Criteria:**
- [ ] After reinstall, no unit under `~/.config/systemd/user/sdlc-sched-*` contains `/Cellar/`
- [ ] All 20 previously installed timers remain installed, enabled, and scheduled
- [ ] The next scheduled run of at least one migrated timer is observed to succeed
- [ ] Edge case: reinstall is idempotent and does not duplicate or orphan units

**Dependencies:** SCS-REQ-030
**Complexity:** S
**Value:** CRITICAL
**Notes:** Verification is the point. A migration that silently drops a timer reproduces the exact
failure class being fixed.

---

### SCS-REQ-032: Reinstall preserves deliberately-disabled timers

**Statement:** The system shall not enable a timer that is currently installed and disabled, so that
a reinstall never changes operator intent.

**Acceptance Criteria:**
- [ ] A timer present and disabled before an install remains disabled after it
- [ ] A timer not previously present is enabled
- [ ] A timer present and enabled stays enabled
- [ ] Enablement state is sampled **before** any unit file is written
- [ ] The install output names every timer it deliberately left disabled
- [ ] Edge case: repeated installs are idempotent in both unit content and enablement

**Dependencies:** SCS-REQ-031
**Complexity:** S
**Value:** CRITICAL
**Notes:** Found the hard way on 2026-09-15: the reinstall for SCS-REQ-031 ran blanket
`enable --now` and switched on five deliberately-disabled drain timers
(`autonomous`, `pilot`, `personal-website`, `nels-workshop`, `willtopaint`), starting each
immediately. All five happened to no-op (`no ready tasks — skip (no LLM call)`, one mutex skip) and
were disabled within 30 seconds, but the exposure was real: wave-2 timers must stay off until
`env-guard` exists, and an unrelated reinstall must never be the thing that enables them.

The sampling order is the subtle part. Once unit files are written, a brand-new timer and a
deliberately-disabled one both report `disabled` — indistinguishable. The first version of this fix
had exactly that bug and would have left new timers permanently off.

---

## Acceptance Criteria (Scenarios)

### Scenario 1: A stable shim is preferred
**Verifies:** SCS-REQ-030
**WHEN** units are generated on a host where the shim path's realpath equals `process.execPath`
**THEN** the generated `ExecStart` and `PATH` reference the shim path
**AND** no version string appears in either

### Scenario 2: A node upgrade no longer breaks the timers
**Verifies:** SCS-REQ-030
**WHEN** the node version directory changes behind a stable shim
**THEN** previously generated units still resolve a working node

### Scenario 3: All live timers are migrated
**Verifies:** SCS-REQ-031
**WHEN** `scheduler-install.mjs install` is re-run on this host
**THEN** every `sdlc-sched-*` unit is rewritten without a Cellar path
**AND** the installed timer count is unchanged

### Scenario 4: Error Case — no stable shim exists
**Verifies:** SCS-REQ-030
**WHEN** no candidate shim resolves to the running interpreter
**THEN** `process.execPath` is used and unit generation succeeds

### Scenario 5: Edge Case — broken symlink
**Verifies:** SCS-REQ-030
**WHEN** a candidate shim path is a broken symlink
**THEN** it is skipped and generation continues without throwing

---

### Scenario 6: A reinstall does not resurrect disabled timers
**Verifies:** SCS-REQ-032
**WHEN** `scheduler-install.mjs install` runs on a host where five drain timers are disabled
**THEN** those five remain disabled and are not started
**AND** the install output names them as deliberately left off

### Scenario 7: Edge Case — a new timer among disabled ones
**Verifies:** SCS-REQ-032
**WHEN** an install adds a brand-new timer while other timers are disabled
**THEN** the new timer is enabled and the disabled ones are untouched

---

## Invariants

- No generated unit ever contains a version-pinned interpreter path.
- Unit generation never throws on an unresolvable candidate path.
- Reinstall is idempotent in unit content **and** in enablement.
- An install never changes whether a timer is enabled, except to enable a genuinely new one.

---

## Out of Scope

- Any other change to scheduler behaviour, scheduling semantics, or unit content.
- The `scheduler-daemon` change's redesign of this area.

---

## Test Mapping

| Scenario | Test File | Test Name |
|----------|-----------|-----------|
| Scenario 1 | `tests/scheduler-install.test.mjs` | `prefers stable shim when realpath matches execPath` |
| Scenario 2 | `tests/scheduler-install.test.mjs` | `generated unit survives version directory change` |
| Scenario 3 | `tests/scheduler-install.test.mjs` | `reinstall rewrites all units without Cellar path` |
| Scenario 4 | `tests/scheduler-install.test.mjs` | `falls back to execPath when no shim matches` |
| Scenario 5 | `tests/scheduler-install.test.mjs` | `skips broken symlink candidates` |
| Scenario 6 | `tests/scheduler-install.test.mjs` | `deliberately disabled timers are not re-enabled by a reinstall` |
| Scenario 7 | `tests/scheduler-install.test.mjs` | `brand-new timers are enabled` |

---

## Next Step

Proceed to tasks phase using `openspec-continue-change`.
