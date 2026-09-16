# Design: supply-chain-security-program

**Date**: 2026-09-15
**Author**: Claude (Opus 5) with Bryce
**Status**: design

---

## Context

### Current State

**Security tooling on this host: none.** Verified 2026-09-15 — `gitleaks`, `trufflehog`, `semgrep`,
`osv-scanner`, `syft`, `grype`, `trivy`, `cosign`, `socket`, `snyk` are all absent. `npm`, `pnpm`,
`node`, `gh`, `git`, `jq` are present.

What exists nearby, and what each does *not* cover:

| Component | Covers | Does not cover |
|---|---|---|
| `agents/red-team-tester.mjs` (weekly, Sun 22:00) | Prompt injection, exfiltration asks, tool abuse, jailbreak markers in `agents/**/AGENT.md` + `pm/**/*.md`. Exports `screenExternalInput()`, consumed by `notify.mjs`. | Any package, lockfile, secret, install script, or MCP server. |
| `agents/net-doctor.mjs` + `scripts/network-preflight.sh` (`egress-preflight`, implemented + parked) | DNS / IPv6 egress diagnosis. | Anything about *what* is being fetched. |
| `agents/env-guard.mjs` | Environment-tier guarding for deploys. | Dependency integrity. |
| `agents/capability-logger.mjs` / `capability-monitor.mjs` / `alignment-monitor.mjs` | Agent capability-use telemetry and drift. | Supply chain. |
| `agents/pr-auto-review.mjs` (3×/hr, 5 repos) | Scope/safety scan + LLM review; **auto-merges green PRs**. | No dependency-integrity gate. A poisoned lockfile diff reads as noise. |
| `cron-schedule.json` → `dependency-audit` | — | **Never installed.** Gated on `agentRequired: dependency-auditor`, which is not configured. Absent from `systemctl --user list-timers`. |

The framework convention it must fit: dependency-free ESM `.mjs` agents under `agents/`, injectable
probes for hermetic tests (`net-doctor.mjs` is the reference), `loadConfig()` for `projectDir`,
`logCapabilityUsage()` at every entry point, `--dry-run` / `--notify` flags, dated markdown reports
under `pm/`, and `node --test` suites under `tests/`.

### Problem Restatement

Nothing on this machine detects a compromised, hallucinated, or typosquatted dependency, a leaked
secret, or a malicious install script — in a portfolio where autonomous agents add dependencies
every 15 minutes and merge their own PRs into a repo holding a paying customer's data.

---

## Goals

- Detect supply-chain compromise across all repos in `~`, weighted by **blast radius**, not
  dependency count.
- Run twice daily on **two different model families** over byte-identical inputs, and ship the
  diff between their findings as a first-class output.
- Ground every model judgement in **deterministic tool evidence** — the tools find the known, the
  model finds the novel.
- Operate **fully offline/self-hosted**: no source, dependency graph, or SBOM leaves this machine.
- Be **quiet enough to stay trusted**: HIGH-only notification, baselined findings, no repeat fires.
- Make a dead timer and a clean run **impossible to confuse**.
- Bound cost and concurrency so a scan can never eat an interactive work session.

## Non-Goals

- Remediation. Sentinel reports; it never bumps a version, rewrites a lockfile, or opens a PR.
- Prompt-injection content scanning — `red-team-tester.mjs` owns that threat class.
- Network egress restriction — `egress-preflight` owns it.
- Runtime/production monitoring of deployed sites.
- Writing to `~/languageapp` (read-only) or to any repo under scan. **Sentinel never writes outside
  `~/agentic-sdlc`.**

---

## Design

### Overview

One orchestrator, two stages, two daily runs.

**Stage 1 — deterministic pass.** Pure-Node scanners walk every repo in scope and emit a single
normalized JSON **evidence bundle**. No model involved. This stage alone is a working security
scanner; if the model stage fails entirely, Stage 1 findings still report and still notify.

**Stage 2 — model pass.** The evidence bundle plus the raw diffs since the last run are handed to
`claude -p` with a fixed prompt. The model reasons about what regex cannot: is this package name
something an LLM would plausibly invent? Does this maintainer change plus this version jump plus
this new install script add up to an account takeover? It returns structured JSON findings.

Run A (06:30, `claude-opus-5`) and Run B (18:30, `claude-fable-5-1`) use **identical prompts,
identical scanners, identical scope** — only `--model` differs. Run B additionally diffs its
findings against Run A's and reports what each model saw that the other missed.

### Components

#### Evidence scanners

**File(s)**: `agents/sentinel/*.mjs`

Each exports a pure `scan(ctx)` returning `{ findings[], evidence{} }`, with every filesystem and
subprocess probe injectable so tests run hermetic and offline — the `net-doctor.mjs` pattern.

| Module | Threat | Method |
|---|---|---|
| `lockfile-diff.mjs` | Poisoned lockfile | `git diff` of `package-lock.json` since last run. Flags: integrity hash changed for an *unchanged* version; `resolved` URL off `registry.npmjs.org`; a package gaining `hasInstallScript`; a version jump crossing a major without a matching `package.json` change. |
| `slopsquat.mjs` | **Slopsquatting** — the priority vector | For each newly added package: registry age, download counts, maintainer count, repository field, publish history. A package whose first publish postdates its appearance in an agent-authored commit is HIGH. Also Levenshtein-1 against the union of packages already in use (typosquat) and scope names resolvable from the public registry (dependency confusion). |
| `install-scripts.mjs` | npm RCE | Enumerates `preinstall`/`install`/`postinstall`/`prepare` across the whole resolved tree, diffed against an allowlist at `agents/sentinel/install-script-allowlist.json`. New unallowlisted script = HIGH. |
| `secrets.mjs` | Credential leak | `gitleaks detect` on the working tree **and** `gitleaks detect --log-opts=--all` over git history, per repo. Known-credential repos (`ai-gateway`, `~/.hermes/.env`) get an explicit baseline so they report drift, not their whole contents. |
| `vulns.mjs` | Known CVEs | `syft` → CycloneDX SBOM → `osv-scanner` against the **offline** OSV database. SBOMs are written to `pm/security-reports/sbom/` and never uploaded. |
| `copied-source.mjs` | `component-library` blind spot | Content-hashes every component in `~/component-library` plus any shadcn-style registry content; maintains a provenance ledger recording where each component came from. Flags: a component with no recorded provenance; a hash change on a component previously copied into a downstream repo. **This is the one scanner with no off-the-shelf equivalent — copied source is invisible to SCA by construction.** |
| `mcp-inventory.mjs` | MCP supply chain | Inventories `~/.claude.json`, `~/.claude/mcp-servers/`, `~/.claude/plugins/installed_plugins.json`. Each server is treated as a dependency: pinned version, source, and a hash of its tool descriptions. A changed tool description is a **tool-poisoning** signal and is HIGH. |
| `ci-audit.mjs` | CI/CD | `.github/workflows/*` — actions referenced by tag rather than commit SHA; `permissions: write-all`; `pull_request_target` with checkout of untrusted refs. |
| `sast.mjs` | Obvious code classes | `semgrep --config auto --offline` with a small local ruleset. Includes a **Supabase RLS-vs-GRANT** rule: a table with RLS enabled and no corresponding GRANT review is flagged — Bryce's known trap, where a policy is mistaken for a privilege. |

#### Orchestrator

**File(s)**: `agents/sentinel-run.mjs`

`sentinel-run.mjs --model <id> --run-label <A|B> [--dry-run] [--no-model] [--notify]`

1. Acquire an exclusive lockfile at `pm/.sentinel.lock` (stale-breaks after 2×timeout). **A second
   run never starts while one is in flight** — including the other model's run.
2. Run every scanner; assemble the evidence bundle.
3. Stage 2: spawn `claude -p --model <id> --output-format json`, prompt on stdin, evidence attached.
4. Parse `result`, merge model findings with tool findings, dedupe, write the report.
5. Record `lastSuccessfulRun`, per-run cost, and duration to `pm/sentinel-state.json`.

#### Reporting and notification

**File(s)**: `agents/sentinel-report.mjs`

Writes `pm/security-reports/sentinel-<date>-<A|B>.md`, mirroring the `red-team-tester.mjs` report
shape and sharing its `low|medium|high` vocabulary so the two read together. Report sections:
summary counts, findings table by severity, **cross-model diff** (Run B only), and evidence
pointers. Notification via `notify.mjs` on **HIGH only**, and only for findings not already in the
baseline at `agents/sentinel/baseline.json`.

#### Toolchain installer

**File(s)**: `scripts/security-toolchain-install.sh`

Installs `osv-scanner`, `syft`, `grype`, and `gitleaks` as **SHA-256-verified** release binaries
into `~/.local/bin/sentinel/`, verifies each checksum before `chmod +x`, and seeds the offline OSV
database. Never auto-updates — an upgrade is a deliberate, reviewed act, because a security scanner
is itself a downloaded binary.

**`semgrep` is deliberately excluded** (decided during implementation, 2026-09-15). It publishes no
release binary — it is pip-only — and `semgrep --config auto` fetches its ruleset from the semgrep
registry at scan time, which would both break the offline requirement and put code patterns in
front of a third-party service. `sast.mjs` implements its rules natively instead, which is what the
one rule that actually matters here (Supabase RLS-vs-GRANT) required anyway.

Pinning is **trust-on-first-use**: the first install verifies each artifact against the publisher's
checksum file over HTTPS, then records the verified hash in `agents/sentinel/toolchain.json`. Every
later install must reproduce that hash, and a mismatch under a fixed version aborts and is treated
as compromise. This is weaker than a hash vendored from an out-of-band source, and the manifest
says so; it is strong against a publisher silently re-cutting a release, which is the realistic
attack.

#### Scheduler node-path fix

**File(s)**: `agents/scheduler-install.mjs`

Separate, surgical commit. `nodeBin` currently comes from `process.execPath`, which on this host
resolves *through* the `.linuxbrew/bin/node` symlink to
`/home/linuxbrew/.linuxbrew/Cellar/node/25.6.1/bin/node`. Replace with: prefer a stable shim
directory on PATH when its `realpath` matches `process.execPath`; fall back to `process.execPath`
otherwise. Then reinstall all units so the existing 20 stop carrying the version pin.

### Data Flow

```
                  ┌─ repos in ~ (read-only) ─┐
                  │  git diff since last run │
                  └────────────┬─────────────┘
                               v
   Stage 1   lockfile-diff · slopsquat · install-scripts · secrets · vulns
   (no LLM)  copied-source · mcp-inventory · ci-audit · sast
                               │
                               v
                  evidence bundle (JSON)  ──────────────┐
                               │                        │
                               v                        │  (Stage 2 failure
   Stage 2   claude -p --model <A|B> --output-format json│   degrades to
   (LLM)     read-only tools · wall-clock timeout        │   Stage-1-only;
                               │                        │   never silent)
                               v                        │
                  model findings (JSON) <───────────────┘
                               │
                               v
        merge + dedupe + baseline filter  →  pm/security-reports/sentinel-<date>-<A|B>.md
                               │                     │
                               │                     └─→ Run B also emits cross-model diff
                               v
                  HIGH findings only → notify.mjs → Telegram
                               │
                               v
                  pm/sentinel-state.json (lastSuccessfulRun, cost, duration)
                               │
                               └─→ health-check.mjs reads staleness → alerts if > 36h
```

### Schema / Interface Changes

```typescript
type Severity = 'low' | 'medium' | 'high';   // shared with red-team-tester.mjs

interface Finding {
  id: string;              // stable hash of (scanner, repo, subject) — drives baseline + dedupe
  scanner: string;         // 'slopsquat' | 'secrets' | ... | 'model'
  severity: Severity;
  repo: string;
  subject: string;         // package name, file path, MCP server name
  summary: string;
  detail: string;
  evidence: string[];      // concrete pointers: file:line, lockfile key, registry URL
  remedy: string;          // actionable, per net-doctor.mjs convention
  source: 'tool' | 'model';
}

interface EvidenceBundle {
  generatedAt: string;
  repos: Array<{ name: string; path: string; head: string; sinceCommit: string | null }>;
  scanners: Record<string, { ok: boolean; error?: string; evidence: unknown }>;
  findings: Finding[];     // Stage 1 only
}

interface SentinelState {
  lastSuccessfulRun: Record<'A' | 'B', string | null>;
  lastCommitScanned: Record<string, string>;   // repo -> sha
  runs: Array<{ label: 'A'|'B'; at: string; model: string;
                durationMs: number; costUsd: number;
                findingCounts: Record<Severity, number>; ok: boolean }>;
}
```

---

## Decisions

### Decision 1: Bounding the model pass without `--max-turns`

**Chosen**: Wall-clock `timeout` (Stage 2 capped at 10 min) **plus a read-only tool allowlist** —
`--allowedTools "Read Grep Glob"`, `--disallowedTools "Bash Edit Write WebFetch WebSearch"` — plus
a cost ceiling read from `total_cost_usd` in the JSON envelope, which aborts the *next* run if a
rolling daily budget is exceeded.

**Considered**: `--max-turns` (the brief assumed it); an unbounded run with only a timeout.

**Rationale**: **Verified 2026-09-15 that this CLI build has no `--max-turns` flag** — `claude
--help` has zero matches. So the brief's suggested cap does not exist and something else must carry
the bound. The tool allowlist does more work than a turn cap would anyway: it makes the security
scanner itself **incapable of writing or executing anything**. A scanner that cannot modify the
system it inspects is the correct shape, and it removes the worry that a prompt-injection payload
buried in a scanned dependency could turn the scan into an actuator.

### Decision 2: Cost control is a first-order concern, not a footnote

**Chosen**: Bound and record cost per run; abort on a rolling daily ceiling; run at 06:30/18:30.

**Considered**: Treating subscription usage as free.

**Rationale**: Measured on this host, a **trivial** `claude -p` call returning 9 tokens reported
`total_cost_usd: 0.30`, because the CLI loads ~25k tokens of session context (cache creation +
read) on *every* invocation. A real evidence bundle will be far larger. That is a hard floor of
~$0.60/day before any actual work, drawn against the same Max capacity Bryce uses interactively.
Recording `total_cost_usd` per run makes the trade visible rather than discovered later.

### Decision 3: Stage 1 must stand alone

**Chosen**: Stage 1 writes a complete report and notifies on HIGH even if Stage 2 fails, times out,
or returns unparseable output. Stage 2 failure is itself a MEDIUM finding in the report.

**Considered**: Treating the run as failed if the model pass fails.

**Rationale**: The failure mode Bryce has actually been burned by is a scheduled job that breaks
and goes quiet. A model pass depends on network, subscription state, and CLI version — all more
fragile than local Node. Degrading to deterministic-only keeps protection on during exactly the
window when something else is already wrong.

### Decision 4: Schedule at 06:30 / 18:30, not 06:00 / 18:00

**Chosen**: 06:30 and 18:30.

**Considered**: The brief's 06:00 / 18:00.

**Rationale**: 06:00 already fires `daily-review` **and** `health-check-daily`; 06:15 `doc-sync`,
07:00 `cost-report`. Stacking a heavy scan there contends for CPU and for the Telegram channel at
the moment the morning digest is being assembled. 18:30 is clear of everything, and both slots
avoid the `*/15` drain ticks landing on the hour.

### Decision 5: Blast-radius weighting overrides dependency count

**Chosen**: A severity multiplier per repo from `agents/sentinel/scope.json`: `tally` (customer
production data) and `agentic-sdlc` (agent-executed) are tier 1; `component-library` is tier 1
despite having zero dependencies; `willtopaint` (live client site) tier 2; everything else tier 3.

**Considered**: Uniform severity; ranking by dependency count.

**Rationale**: `peach-shaker-5000` has 857 transitive packages and ships to nobody yet;
`agentic-sdlc` has zero and its contents are executed by agents with shell access. Ranking by count
would sort this exactly backwards. Note `nels-workshop` is **hosted UAT with no client on it**
(corrected 2026-09-15), so it is tier 2, not tier 1.

### Decision 6: No new npm dependencies in `agentic-sdlc`

**Chosen**: Scanners are dependency-free Node; external scanners are pinned standalone binaries
invoked as subprocesses.

**Considered**: npm libraries for SBOM/semver/Levenshtein.

**Rationale**: `agentic-sdlc` has no lockfile today and that is a security property worth keeping —
the repo with the widest blast radius has the smallest supply chain. Adding npm dependencies *to
the supply-chain scanner* would be self-defeating.

### Decision 7: Scanners shell out with absolute paths

**Chosen**: Every subprocess call uses an absolute path resolved at install time into
`agents/sentinel/toolchain.json`, never a bare command name.

**Considered**: Relying on PATH.

**Rationale**: Documented host trap — Homebrew shadows `python3`/`ffmpeg`/`pactl`/`gsettings` and
those failures are **silent**. A silently-wrong scanner is worse than an absent one. The installer
records resolved paths and the orchestrator fails loudly if one is missing at run time.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Alert fatigue kills the channel | **High** | **High** — mutes the one channel that matters | HIGH-only notify; `baseline.json` so accepted findings never re-fire; first week runs `--dry-run`; tune before enabling notify |
| Timer breaks silently | Medium | High | `sentinel-state.json` staleness surfaced by `health-check.mjs` (>36h = alert); zero-finding runs still write a report |
| Cost/capacity contention with interactive work | Medium | Medium | Measured $0.30 floor/run; rolling daily ceiling aborts; lockfile prevents overlap; off-peak slots |
| `brew upgrade node` breaks all 20 timers | **Medium** | **Critical** | The `scheduler-install.mjs` fix, shipped as its own commit, then reinstall units |
| Model pass hallucinates a finding | Medium | Medium | Every model finding must cite evidence present in the bundle; unciteable findings are dropped at merge, not reported |
| Scanner binaries are themselves compromised | Low | Critical | SHA-256 pinning verified at install; no auto-update; offline databases |
| Prompt injection via scanned dependency content | Low | High | Stage 2 has no Bash/Edit/Write/WebFetch; evidence is passed as data through `screenExternalInput()` from `red-team-tester.mjs` before reaching the model |
| Conflicts with six active changes touching `scheduler-install.mjs` / `cron-schedule.json` | Medium | Low | Surgical separate commit; flagged by the cross-feature gate |
| Scan writes to a repo under inspection | Low | High | Sentinel writes only under `~/agentic-sdlc`; enforced by an invariant test |

---

## Testing Approach

- **Unit tests**: one suite per scanner in `tests/sentinel-*.test.mjs`, fully hermetic — all
  filesystem/subprocess probes injected. **Known-bad fixtures are mandatory**: a lockfile whose
  integrity hash changed under a fixed version, a package published after the commit that added it,
  a new `postinstall`, a planted fake secret, an MCP tool description that changed. A scanner that
  has never been shown to fire is not tested.
- **Integration tests**: orchestrator end-to-end with `--no-model` against a fixture repo tree;
  lock contention (second run refuses while first holds); Stage 2 failure degrading to Stage-1-only;
  baseline suppression; cross-model diff assembly from two recorded runs.
- **Manual verification** (the brief's explicit gate — *do not mark done without it*):
  1. `scheduler-install.mjs install`, confirm both units exist and carry a non-Cellar node path.
  2. Force both timers to fire; `systemctl --user list-timers` shows them; read the **actual report
     files** on disk.
  3. Confirm the Telegram side received exactly what was expected — and nothing on a clean run.
  4. Plant a known-bad fixture in a scratch repo, confirm it is caught end-to-end and notified.
  5. Confirm `health-check.mjs` reports stale when `sentinel-state.json` is backdated.

---

## Next Step

Proceed to specs phase using `openspec-continue-change`.
