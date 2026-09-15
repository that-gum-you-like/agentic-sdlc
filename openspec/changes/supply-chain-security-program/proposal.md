# Proposal: supply-chain-security-program

**Date**: 2026-09-15
**Author**: Claude (Opus 5) with Bryce
**Status**: proposed

---

## Problem

**There is no security tooling on this box at all**, and the autonomous stack has grown into
exactly the shape that makes that dangerous.

Verified on this host, 2026-09-15 — every one of these is MISSING: `gitleaks`, `trufflehog`,
`semgrep`, `osv-scanner`, `syft`, `grype`, `trivy`, `cosign`, `socket`, `snyk`. Present: `npm`,
`pnpm`, `node`, `gh`, `git`, `jq`. Nothing scans a lockfile, a secret, an install script, or a
CVE anywhere in the portfolio today.

Meanwhile the attack surface is real and measured:

| Repo | Lockfile | Transitive packages | Blast radius |
|---|---|---|---|
| `peach-shaker-5000` | npm | 857 | app store builds |
| `wireframe-live` | npm | 760 | unpushed Hermes commits |
| `tally` | npm | 704 | **customer-facing — granary.farm, real Texas Olive Ranch data** |
| `willtopaint` | npm | 554 | live client site, willtopaint.com |
| `nels-workshop` | npm | 190 | client business OS — hosted UAT, no client on it yet |
| `personal-website` | npm | 157 | live, brycewadley.com |
| `agentic-sdlc` | — | 0 | **total: its content is executed by agents** |
| `component-library` | — | 0 | **copied into everything; invisible to every SCA tool** |
| `ai-gateway`, `personal-tools` | — | nested `package.json`, no lock | credentials / local tooling |

~3,200 lockfile entries nobody has ever looked at, plus five nested `package.json` files
(`ai-gateway/ledger`, `personal-tools/screenrec`, `personal-tools/nellis-scout`,
`nellis-scout/ebay-notify`, `component-library`) that carry no lockfile at all.

Three properties of *this* setup make the generic risk acute:

1. **Agents add dependencies unattended.** 20 `sdlc-sched-*` timers are live; `hermes-drain.sh`
   runs every 15 minutes across five repos and opens PRs. An LLM that hallucinates a package name
   into a `package.json` is the documented **slopsquatting** vector — attackers pre-register the
   names models invent. Nothing here checks that a newly added package existed before the agent
   named it.
2. **`pr-auto-review.mjs` auto-merges.** Green agent PRs merge with no dependency-integrity gate
   in the path. A poisoned lockfile diff reads as noise to the current review.
3. **The framework itself is unguarded.** `agentic-sdlc` and `component-library` have the widest
   reach and the *least* tool coverage, because they have no dependency graph for a tool to scan.
   Risk here tracks blast radius, not dependency count.

The existing `red-team-tester.mjs` covers a **different threat class** — prompt injection,
exfiltration asks, tool abuse, jailbreak markers in agent prompts. It is weekly, deterministic,
regex-based, and it does not look at a single package, lockfile, secret, or install script.

Finally, a scheduled `dependency-audit` job exists in `agents/cron-schedule.json` but is
`agentRequired: dependency-auditor` — **it is not installed and has never run** (absent from
`systemctl --user list-timers`). The gap has been notionally acknowledged and never closed.

---

## Discovery

- **Files examined**:
  - `agents/red-team-tester.mjs` — rule set, `screenExternalInput()` export (consumed by
    `notify.mjs`), severity vocabulary `low|medium|high`, report convention
    `pm/red-team-reports/red-team-<date>.md`, `--notify` gated on HIGH count only.
  - `agents/scheduler-install.mjs` — `loadSchedule()`, `buildUnits()`, `extraPathDirs()`,
    `UNIT_PREFIX = 'sdlc-sched-'`, units written to `~/.config/systemd/user`.
  - `agents/cron-schedule.json` — 28 scheduled jobs, 20 installed; slot times catalogued below.
  - `agents/notify.mjs` — `triggerNotification()`, `deliverArtifact()`, CLI `notify.mjs send`.
  - `openspec/changes/egress-preflight/` — implemented + parked; `net-doctor.mjs` +
    `scripts/network-preflight.sh` already solved DNS/IPv6 egress diagnosis.
  - `~/.config/systemd/user/sdlc-sched-red-team-weekly.service` — the live unit.
- **Existing patterns**: dependency-free ESM `.mjs` agents; injectable probes for hermetic tests
  (`net-doctor.mjs` is the model); dated markdown reports under `pm/`; `--dry-run` / `--notify`
  flags; `loadConfig()` for `projectDir`; `logCapabilityUsage()` on every agent entry point.
- **Existing tests**: `tests/*.test.mjs` + `agents/__tests__/*.test.mjs` via `node --test`, plus
  `agents/four-layer-validate.mjs` and `agents/test-behavior.mjs --framework` in `npm test`.
- **Key findings**:
  1. **Confirmed the node-path trap and found its root cause.** Every generated unit pins
     `/home/linuxbrew/.linuxbrew/Cellar/node/25.6.1/bin/node`. Source:
     `scheduler-install.mjs:231` uses `nodeBin = process.execPath`, and on this host
     `/home/linuxbrew/.linuxbrew/bin/node` is a symlink whose realpath is the Cellar path — so
     `process.execPath` resolves through it. **The next `brew upgrade node` breaks all 20 timers
     at once, silently, with rc=127.** This is a live latent outage, not a style nit.
  2. **Headless Claude works under a stripped environment.** Verified:
     `env -i HOME=... PATH=... claude -p --model claude-fable-5-1` returned `HEADLESS_OK`, exit 0.
     Claude Code 2.1.272 at `~/.local/bin/claude`, subscription auth, no `ANTHROPIC_API_KEY`.
     The same run emitted `SessionEnd hook ... failed: /bin/sh: 1: node: not found` — PATH must be
     set explicitly in the unit.
  3. **Cross-feature gate**: no conflicts against the new change name. But
     `agents/scheduler-install.mjs` and `agents/cron-schedule.json` are contended by six active
     changes (`auto-review-merge`, `business-os`, `scheduler-daemon`, `command-center-visibility`,
     `telegram-activation`, `pilot-autonomous-replication`). The node-path fix touches
     `scheduler-install.mjs` — keep it to a surgical, separately-committed edit.
  4. **Free schedule slots**: 06:00, 06:15, 07:00, 08:23, 09:00 are taken daily; 22:00/23:00/23:30
     Sunday are taken. **06:30 and 18:30 are free** — use those, not the requested 06:00/18:00.
  5. **MCP inventory is small and enumerable today**: `firecrawl` in `~/.claude.json`,
     `openclaw-bridge` under `~/.claude/mcp-servers/`, Vercel via `~/.claude/plugins/`. Small
     enough to baseline now, which is exactly why now is the time.

---

## Proposed Solution

Add **`sentinel`** — a supply-chain and code-integrity security layer that runs twice a day, once
on each of two model families, over all repos in `~`. Each run is two stages: a **deterministic
tool pass** (lockfile diff, SBOM, CVE, secrets, install-script audit, registry-provenance check,
MCP inventory) whose raw JSON is the evidence, then a **model pass** that reasons over that
evidence and over the actual diffs for what the tools cannot pattern-match — slopsquatted package
names, a component copied in from nowhere, a maintainer change that reads wrong.

Run A (06:30, Opus 5) and Run B (18:30, Fable 5.1) get **byte-identical prompts and inputs**, so
the diff between their findings is a real cross-model signal and ships as its own report section.
Reports land in `pm/security-reports/`, share the `low|medium|high` vocabulary with
`red-team-tester.mjs`, and notify over `notify.mjs` on **HIGH only**. A staleness check makes a
dead timer and a clean run distinguishable.

Everything runs **offline and self-hosted**: OSV's downloadable database, Go-binary scanners
pinned by checksum, no source or SBOM leaves the machine.

---

## Value Analysis

### Benefits

- Closes a **total** gap: today nothing would detect a compromised dependency in `tally`, the repo
  holding a paying customer's farm data, or in `agentic-sdlc`, whose contents agents execute.
- Puts a gate in front of the specific hole opened by autonomy — agents adding packages at
  15-minute intervals and `pr-auto-review.mjs` merging them.
- Covers `component-library`, which **no off-the-shelf SCA tool can see**, before the proposed
  shadcn-registry-over-MCP change makes agents install from it unattended.
- Fixes a live latent outage (the Cellar node pin) that would otherwise take down all 20 timers on
  the next `brew upgrade`.
- Cross-model diff: a finding one family sees and the other misses is reported as a signal, not
  averaged away.
- Zero third-party SaaS, zero new paid services, no API key — runs on the Max subscription.

### Costs

- **Effort**: L. ~5 new `.mjs` agents, a toolchain install script, two units, ~40 tests.
- **Risk**:
  - *Subscription capacity* — headless runs consume the same quota Bryce uses interactively.
    Mitigated by a hard `timeout`, a turn cap, a lockfile against overlap, and off-peak slots.
  - *Alert fatigue* — the failure mode that kills the whole thing. HIGH-only notification, a
    findings baseline so a known-accepted item never re-fires, and a first week in `--dry-run`.
  - *False confidence* — a scanner that runs but misses. Mitigated by the staleness check and by
    seeding known-bad fixtures into the test suite.
  - *Scanner supply chain* — the irony is real: scanners are themselves downloaded binaries.
    Pinned by SHA-256, verified on install, never auto-updated.
- **Dependencies**: `notify.mjs`, `scheduler-install.mjs`, `loadConfig()`, `logCapabilityUsage()`,
  the `claude` CLI. No new npm dependencies in `agentic-sdlc` — the framework stays lock-free.

### Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Snyk / Socket.dev / GitHub Advanced Security | Uploads the dependency graph and source to a third-party SaaS. Violates the privacy-first rule; Socket's value is exactly the registry telemetry Bryce will not send. |
| `npm audit` alone | Only known CVEs in declared deps. Blind to slopsquatting, install scripts, secrets, copied source, and MCP servers — i.e. blind to every vector specific to this setup. |
| Dependabot / Renovate | Upgrade automation, not compromise detection. Would itself add unreviewed dependency bumps to the merge path. |
| Fold into `red-team-tester.mjs` | Different threat class, different cadence, different evidence shape. Would make one file own two unrelated jobs. Share the severity vocabulary and report format instead. |
| Gate in `pr-auto-review.mjs` only | Catches only what arrives by PR. Misses direct commits, `~/.claude` MCP config, copied components, and history-resident secrets. (A PR gate is proposed as a follow-up, not as the whole answer.) |
| One model, once a day | Loses the cross-model diff, which is the stated reason for two runs. A single model's blind spot becomes systemic. |
| Do nothing | An unmonitored supply chain feeding autonomous agents that merge their own PRs into a customer-facing repo. |

### Decision

**Yes.** The cost is one-time build plus bounded daily compute already paid for. The downside case
is a compromised package reaching `granary.farm` — a client's production data — through a pipeline
built to merge without a human. Nothing currently stands between those two facts.

---

## Scope

### In Scope

- `agents/sentinel/` — deterministic scanners: lockfile-diff, SBOM/CVE, secrets (+ git history),
  install-script audit, registry-provenance / slopsquat check, copied-source provenance,
  MCP-server inventory.
- `agents/sentinel-run.mjs` — orchestrator: tool pass → model pass via `claude -p --model <id>
  --output-format json`, with timeout, turn cap, and lockfile.
- `agents/sentinel-report.mjs` — dated markdown reports in `pm/security-reports/`, shared severity
  buckets, cross-run diff section, HIGH-only notify, staleness tracking.
- `scripts/security-toolchain-install.sh` — SHA-256-pinned installs of `osv-scanner`, `syft`,
  `grype`, `gitleaks`, `semgrep`; offline OSV database.
- Two entries in `agents/cron-schedule.json` (06:30 Opus 5, 18:30 Fable 5.1).
- **Surgical fix to `scheduler-install.mjs`**: stop pinning the Cellar realpath; prefer the stable
  brew shim when it resolves to the same binary. Separate commit.
- `openspec/REQUIREMENT-PREFIXES.md` — created here (does not exist yet), claiming prefix `SCS`.
- Tests for every scanner, with known-bad fixtures.

### Out of Scope

- Prompt-injection scanning of agent prompts — `red-team-tester.mjs` owns that.
- Network egress restriction — `egress-preflight` + `nellis-egress-proxy` own that.
- Remediation. Sentinel **reports**; it does not bump versions, rewrite lockfiles, or open PRs.
  (A `pr-auto-review.mjs` gate is a deliberate follow-up once findings are proven low-noise.)
- `~/languageapp` — read-only, never written to.
- Runtime/production monitoring of deployed sites.
- Any change to the `component-library` shadcn-registry-over-MCP proposal; this change only
  states the controls that work must be designed against.

---

## Next Step

If approved: proceed to design phase using `openspec-continue-change`.
