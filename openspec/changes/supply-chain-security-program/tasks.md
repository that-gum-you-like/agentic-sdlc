# Tasks: supply-chain-security-program

**Date**: 2026-09-15
**Author**: Claude (Opus 5) with Bryce
**Status**: tasks

---

## Overview

Build `sentinel` — a two-stage, twice-daily supply-chain and code-integrity security layer — per
`design.md` and the four capability specs (`SCS-REQ-001` – `SCS-REQ-031`).

Sequencing rationale: the scheduler node-path fix (Phase 0) ships **first and alone**, because it
is a live latent outage affecting all 20 existing timers and because sentinel's own timers would
otherwise inherit the same defect. The toolchain (Phase 1) gates the scanners that shell out. Stage
1 scanners (Phase 2) are independently valuable and land before any model work (Phase 3), so that
a working deterministic scanner exists even if Phase 3 stalls.

Task ids use the `SCS` prefix claimed in `openspec/REQUIREMENT-PREFIXES.md`, matching the
requirement ids.

---

## Prerequisites

- [x] Design is approved
- [x] Specs are written and reviewed
- [x] `SCS` prefix claimed in `openspec/REQUIREMENT-PREFIXES.md`
- [ ] Bryce confirms outbound npm **registry metadata** lookups are acceptable (package name only —
      no source, no graph, no SBOM). This is the only outbound call in the design; if declined,
      `SCS-REQ-002` degrades to offline heuristics only and must be re-specced.

---

## Work Stream Summary

| Work Stream | Agent | Tasks | Parallel With |
|-------------|-------|-------|---------------|
| Scheduler fix | sdlc-developer | SCS-001 – SCS-004 | none (ships first, alone) |
| Toolchain | sdlc-developer | SCS-010 – SCS-012 | Scanners (pure-Node ones) |
| Stage 1 scanners | sdlc-developer | SCS-020 – SCS-029 | each other, after SCS-012 |
| Stage 2 + orchestration | sdlc-developer | SCS-030 – SCS-035 | blocked-by Phase 2 |
| Reporting + liveness | sdlc-developer | SCS-040 – SCS-044 | blocked-by Phase 3 |
| Schedule + live verify | sdlc-developer | SCS-050 – SCS-054 | blocked-by Phase 4 |
| Review | sdlc-reviewer | SCS-060 – SCS-061 | blocked-by Phase 5 |
| Docs | sdlc-documentarian | SCS-070 – SCS-072 | blocked-by Phase 5 |

---

## Implementation Tasks

### Phase 0: Scheduler node-path fix — ships first, separate commit

- [x] **SCS-001**: Replace `nodeBin = process.execPath` with stable-shim resolution
  - Files: `agents/scheduler-install.mjs`
  - Spec: SCS-REQ-030
  - Agent: sdlc-developer
  - Parallel: no
  - Complexity: S
  - Notes: Prefer a PATH-stable shim whose `realpath` equals `process.execPath`; fall back to
    `process.execPath`. Probe injectable. Do **not** special-case Homebrew — nvm/asdf must work too.
    Touch nothing else in this file; six active changes contend for it.

- [x] **SCS-002**: Unit tests for shim resolution
  - Files: `tests/scheduler-install.test.mjs`
  - Covers: SCS-REQ-030
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-001
  - Complexity: S
  - Notes: Cover match, no-match fallback, broken symlink, non-Homebrew layouts.

- [x] **SCS-003**: Reinstall all units and verify migration
  - Command: `node agents/scheduler-install.mjs install` then
    `grep -rl Cellar ~/.config/systemd/user/sdlc-sched-*` (must return nothing)
  - Spec: SCS-REQ-031
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-002
  - Complexity: S
  - Notes: Confirm all 20 timers still listed by `systemctl --user list-timers`, then **watch one
    migrated timer actually fire successfully** before moving on.


- [x] **SCS-004**: Preserve deliberately-disabled timers across a reinstall
  - Files: `agents/scheduler-install.mjs`, `tests/scheduler-install.test.mjs`
  - Spec: SCS-REQ-032
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-003
  - Complexity: S
  - Notes: Added after SCS-003's reinstall re-enabled five drain timers. Enablement is sampled
    before any unit file is written — afterwards a new timer and a disabled one are
    indistinguishable. Blocks SCS-051, which reinstalls to add the sentinel timers.

### Phase 1: Toolchain

- [ ] **SCS-010**: SHA-256-pinned toolchain installer
  - Files: `scripts/security-toolchain-install.sh`
  - Spec: SCS-REQ-016
  - Agent: sdlc-developer
  - Parallel: yes
  - Complexity: M
  - Notes: `osv-scanner`, `syft`, `grype`, `gitleaks`, `semgrep` → `~/.local/bin/sentinel/`.
    Verify checksum **before** `chmod +x`. No auto-update. Record resolved absolute paths and
    versions to `agents/sentinel/toolchain.json`.

- [ ] **SCS-011**: Offline OSV database seed + staleness metadata
  - Files: `scripts/security-toolchain-install.sh`, `agents/sentinel/toolchain.json`
  - Spec: SCS-REQ-005
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-010
  - Complexity: S
  - Notes: Record fetch date so a >7-day-old database becomes a MEDIUM finding.

- [ ] **SCS-012**: Toolchain preflight module
  - Files: `agents/sentinel/toolchain.mjs`, `tests/sentinel-toolchain.test.mjs`
  - Spec: SCS-REQ-016
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-010
  - Complexity: S
  - Notes: Absolute paths only; `--version` check; missing/failing tool → HIGH "scanner
    unavailable". Never a bare command name — Homebrew shadowing fails silently on this host.

### Phase 2: Stage 1 scanners

Each task: the scanner plus its hermetic test with a **known-bad fixture**. A scanner never shown
to fire is not tested.

- [ ] **SCS-020**: Scope + blast-radius tiering
  - Files: `agents/sentinel/scope.json`, `agents/sentinel/scope.mjs`, `tests/sentinel-scope.test.mjs`
  - Spec: SCS-REQ-009
  - Agent: sdlc-developer
  - Parallel: yes
  - Complexity: S
  - Notes: Tier 1 `tally`, `agentic-sdlc`, `component-library`; tier 2 `willtopaint`,
    `nels-workshop` (hosted UAT, no client yet), `personal-website`; tier 3 rest. `~/languageapp`
    read-only. Include the five nested `package.json` paths with no lockfile.

- [ ] **SCS-021**: `lockfile-diff.mjs`
  - Files: `agents/sentinel/lockfile-diff.mjs`, `tests/sentinel-lockfile-diff.test.mjs`
  - Spec: SCS-REQ-001
  - Agent: sdlc-developer
  - Parallel: yes
  - Complexity: M
  - Notes: Fixture — integrity hash changed under an unchanged version.

- [ ] **SCS-022**: `slopsquat.mjs`
  - Files: `agents/sentinel/slopsquat.mjs`, `tests/sentinel-slopsquat.test.mjs`
  - Spec: SCS-REQ-002
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-021
  - Complexity: L
  - Notes: **Highest-priority vector.** Registry probe injectable; tests fully offline. Fixtures —
    package published after the commit that added it; Levenshtein-1 neighbour; unreachable registry
    producing "could not verify", never silence.

- [ ] **SCS-023**: `install-scripts.mjs` + allowlist
  - Files: `agents/sentinel/install-scripts.mjs`, `agents/sentinel/install-script-allowlist.json`, `tests/sentinel-install-scripts.test.mjs`
  - Spec: SCS-REQ-003
  - Agent: sdlc-developer
  - Parallel: yes
  - Complexity: M
  - Notes: First run must yield a reviewable inventory, not hundreds of HIGHs. Hash script bodies so
    an allowlisted package that changes its script still fires.

- [ ] **SCS-024**: `secrets.mjs`
  - Files: `agents/sentinel/secrets.mjs`, `tests/sentinel-secrets.test.mjs`
  - Spec: SCS-REQ-004
  - Agent: sdlc-developer
  - Parallel: yes
  - Complexity: M
  - Notes: Working tree **and** `--log-opts=--all` history. Baseline the known credential-bearing
    locations so they report drift. **Invariant: never emit a secret value** — assert this in test.

- [ ] **SCS-025**: `vulns.mjs` (SBOM + offline OSV)
  - Files: `agents/sentinel/vulns.mjs`, `tests/sentinel-vulns.test.mjs`
  - Spec: SCS-REQ-005
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-011
  - Complexity: M
  - Notes: SBOMs to `pm/security-reports/sbom/`, never uploaded. Assert no network in test.

- [ ] **SCS-026**: `copied-source.mjs` + provenance ledger
  - Files: `agents/sentinel/copied-source.mjs`, `agents/sentinel/provenance.json`, `tests/sentinel-copied-source.test.mjs`
  - Spec: SCS-REQ-006
  - Agent: sdlc-developer
  - Parallel: yes
  - Complexity: L
  - Notes: The one scanner with no off-the-shelf equivalent. Seed the ledger from
    `~/component-library`'s 44 components. Coordinate with the shadcn-registry-over-MCP proposal —
    that work should be designed against these controls, not retrofitted.

- [ ] **SCS-027**: `mcp-inventory.mjs`
  - Files: `agents/sentinel/mcp-inventory.mjs`, `tests/sentinel-mcp-inventory.test.mjs`
  - Spec: SCS-REQ-007
  - Agent: sdlc-developer
  - Parallel: yes
  - Complexity: M
  - Notes: Baseline today's set — `firecrawl`, `openclaw-bridge`, Vercel plugin. Changed tool
    description → HIGH (tool poisoning).

- [ ] **SCS-028**: `ci-audit.mjs`
  - Files: `agents/sentinel/ci-audit.mjs`, `tests/sentinel-ci-audit.test.mjs`
  - Spec: SCS-REQ-008
  - Agent: sdlc-developer
  - Parallel: yes
  - Complexity: S

- [ ] **SCS-029**: `sast.mjs` incl. Supabase RLS-vs-GRANT rule
  - Files: `agents/sentinel/sast.mjs`, `agents/sentinel/rules/`, `tests/sentinel-sast.test.mjs`
  - Spec: SCS-REQ-008
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-010
  - Complexity: M
  - Notes: Fixture — RLS enabled with no GRANT must fire. A policy is not a privilege.

### Phase 3: Orchestration and model pass

- [ ] **SCS-030**: Evidence bundle assembly + per-scanner isolation
  - Files: `agents/sentinel/bundle.mjs`, `tests/sentinel-bundle.test.mjs`
  - Spec: SCS-REQ-010
  - Agent: sdlc-developer
  - Parallel: blocked-by Phase 2
  - Complexity: M
  - Notes: One scanner throwing must not abort the run; record it as a failed scanner.

- [ ] **SCS-031**: Stable finding ids + baseline suppression
  - Files: `agents/sentinel/findings.mjs`, `agents/sentinel/baseline.json`, `tests/sentinel-findings.test.mjs`
  - Spec: SCS-REQ-022, SCS-REQ-021
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-030
  - Complexity: M
  - Notes: Ids must survive line-number churn. Baselining and cross-run diff both key on this.

- [ ] **SCS-032**: Orchestrator — lock, cost ceiling, Stage 1
  - Files: `agents/sentinel-run.mjs`, `tests/sentinel-run.test.mjs`
  - Spec: SCS-REQ-010, SCS-REQ-015
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-031
  - Complexity: M
  - Notes: `pm/.sentinel.lock`, stale-break at 2× timeout, rolling 24h cost ceiling. A crashed run
    must not leave a permanently blocking lock.

- [ ] **SCS-033**: Stage 2 model invocation
  - Files: `agents/sentinel-run.mjs`, `agents/sentinel/prompt.md`
  - Spec: SCS-REQ-011, SCS-REQ-014
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-032
  - Complexity: M
  - Notes: `claude -p --output-format json --allowedTools "Read Grep Glob" --disallowedTools "Bash
    Edit Write WebFetch WebSearch"`, wall-clock 10 min. **No `--max-turns` exists in this CLI build**
    — verified. Parse `result`; `is_error: true` = failure. Record `total_cost_usd`. Hash the prompt
    template per run; Run A and Run B differ **only** by `--model`.

- [ ] **SCS-034**: Evidence screening before the prompt
  - Files: `agents/sentinel-run.mjs`
  - Spec: SCS-REQ-012
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-033
  - Complexity: S
  - Notes: Reuse `screenExternalInput()` from `red-team-tester.mjs`. Do not reimplement. Screening
    failure must fail Stage 2, not send unscreened content.

- [ ] **SCS-035**: Grounding filter + merge/dedupe
  - Files: `agents/sentinel/findings.mjs`
  - Spec: SCS-REQ-013
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-034
  - Complexity: M
  - Notes: Drop unciteable model findings; count them as "dropped (ungrounded)" in the report.

### Phase 4: Reporting, notification, liveness

- [ ] **SCS-040**: Report writer
  - Files: `agents/sentinel-report.mjs`, `tests/sentinel-report.test.mjs`
  - Spec: SCS-REQ-020
  - Agent: sdlc-developer
  - Parallel: blocked-by Phase 3
  - Complexity: M
  - Notes: `pm/security-reports/sentinel-<date>-<A|B>.md`. Mirror the `red-team-tester.mjs` shape
    and severity vocabulary. Zero-finding runs still write a full report.

- [ ] **SCS-041**: HIGH-only notification
  - Files: `agents/sentinel-report.mjs`
  - Spec: SCS-REQ-021
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-040
  - Complexity: S
  - Notes: Exactly **one** message per run via `notify.mjs`. Test the 50-findings case explicitly.

- [ ] **SCS-042**: Cross-model diff
  - Files: `agents/sentinel/crossmodel.mjs`, `tests/sentinel-crossmodel.test.mjs`
  - Spec: SCS-REQ-023
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-040
  - Complexity: M
  - Notes: Mark non-comparable when prompt hashes or scanned commits differ — 12 hours of drain
    activity separates the runs, so commit drift is expected, not exceptional.

- [ ] **SCS-043**: Liveness state + `health-check.mjs` integration
  - Files: `agents/sentinel/state.mjs`, `agents/health-check.mjs`, `tests/sentinel-liveness.test.mjs`
  - Spec: SCS-REQ-024
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-040
  - Complexity: M
  - Notes: >36h without success → degraded. "Never run" must read differently from "stale".

- [ ] **SCS-044**: Live-compromise escalation path
  - Files: `agents/sentinel-report.mjs`
  - Spec: SCS-REQ-025
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-041
  - Complexity: S
  - Notes: Fires even under `--dry-run`; never suppressed by baseline; delivers even if the report
    write failed. Takes no remediation action.

### Phase 5: Schedule and live verification

- [ ] **SCS-050**: Add both schedule entries
  - Files: `agents/cron-schedule.json`
  - Spec: SCS-REQ-026
  - Agent: sdlc-developer
  - Parallel: blocked-by Phase 4
  - Complexity: S
  - Notes: `sentinel-run-a` `30 6 * * *` (`claude-opus-5`), `sentinel-run-b` `30 18 * * *`
    (`claude-fable-5-1`). Start **without** `--notify` — dry-run week first.

- [ ] **SCS-051**: Install timers and confirm unit content
  - Command: `node agents/scheduler-install.mjs install && systemctl --user list-timers 'sdlc-sched-sentinel*'`
  - Spec: SCS-REQ-026
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-050
  - Complexity: S
  - Notes: Confirm explicit PATH and no Cellar path.

- [ ] **SCS-052**: **Watch both timers actually fire and read the reports**
  - Spec: SCS-REQ-026, SCS-REQ-020
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-051
  - Complexity: M
  - Notes: **The change is not done until this passes.** Per the brief: a timer that fails silently
    is worse than no timer. Verify `systemctl --user list-timers`, then read the actual report files
    on disk, then confirm the Telegram side. Precedent: the Hermes cron Docker path trap ran broken
    for weeks.

- [ ] **SCS-053**: End-to-end known-bad fixture test on a scratch repo
  - Spec: SCS-REQ-002, SCS-REQ-021
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-052
  - Complexity: M
  - Notes: Plant a fixture in a scratch repo; confirm detection, report, and notification end to
    end. Proves the pipeline fires, not just that it runs.

- [ ] **SCS-054**: Dry-run tuning week, then enable `--notify`
  - Files: `agents/cron-schedule.json`
  - Spec: SCS-REQ-021
  - Agent: sdlc-developer
  - Parallel: blocked-by SCS-053
  - Complexity: S
  - Notes: Review seven days of reports with Bryce, baseline the accepted findings, **then** turn on
    notification. Tune for a signal still worth reading in three months.

### Phase 6: Tests and review

- [ ] **SCS-060**: Full suite green, no regressions
  - Command: `npm test`
  - Expected: all passing, including `four-layer-validate.mjs` and `test-behavior.mjs --framework`
  - Agent: sdlc-developer
  - Parallel: blocked-by Phase 5

- [ ] **SCS-061**: Security review of sentinel itself
  - Agent: sdlc-reviewer
  - Parallel: blocked-by SCS-060
  - Complexity: M
  - Notes: Confirm the invariants hold in code — writes confined to `~/agentic-sdlc`; no secret
    value in any output path; Stage 2 cannot write/execute/fetch; no source or SBOM transmitted.
    The scanner is itself attack surface.

### Phase 7: Documentation

- [ ] **SCS-070**: Runbook section
  - Files: `docs/RUNBOOK.md`
  - Agent: sdlc-documentarian
  - Parallel: blocked-by SCS-060
  - Notes: How to read a report, baseline a finding, respond to escalation, re-pin the toolchain.

- [ ] **SCS-071**: README + ONBOARDING mention
  - Files: `README.md`, `ONBOARDING.md`
  - Agent: sdlc-documentarian
  - Parallel: blocked-by SCS-070

- [ ] **SCS-072**: Update memory with change summary
  - Files: `agents/memory/recent.json`, `agents/memory/medium-term.json`
  - Agent: sdlc-documentarian
  - Parallel: blocked-by SCS-071

---

## Completion Criteria

This change is complete when:

- [ ] All implementation tasks are checked off
- [ ] All tests pass (`npm test`)
- [ ] No regressions in the existing suite
- [ ] No `sdlc-sched-*` unit contains a version-pinned node path
- [ ] **Both sentinel timers have been observed firing and producing reports on disk** (SCS-052)
- [ ] A planted known-bad fixture was caught end to end (SCS-053)
- [ ] The dry-run tuning week is complete and `--notify` is enabled (SCS-054)
- [ ] Memory is updated
- [ ] Change is committed and pushed

---

## Notes

- **Ship Phase 0 alone and first.** It is a live latent outage, and `scheduler-install.mjs` is
  contended by six active changes.
- **Do not let this become a framework rewrite.** Add a capability; leave the rest alone.
- **Sentinel reports; it never remediates.** A `pr-auto-review.mjs` dependency-integrity gate is the
  deliberate follow-up, opened only once findings are proven low-noise.
- If an **actual live compromise** turns up at any point during implementation: stop, do not fix it
  quietly, notify immediately with evidence.
