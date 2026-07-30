# Proposal: egress-preflight

**Date**: 2026-07-30
**Author**: Claude (Opus 5) with Bryce
**Status**: proposed

---

## Problem

The autonomous stack keeps reporting that its **providers are down** when the
providers are fine. The real fault is on this host, and it has bitten us
repeatedly:

1. **IPv6 blackhole.** `openrouter.ai` and `api.telegram.org` both publish
   AAAA records. This host has **no IPv6 default route** (`ip -6 route show
   default` is empty) and `/etc/gai.conf` is entirely commented out, so glibc
   applies the RFC 6724 default table and *prefers* IPv6. Every
   IPv6-preferring HTTP stack — notably Python `httpx`/`httpcore`, which is
   what the Hermes Telegram adapter uses — tries the AAAA address first and
   fails instantly with `ENETUNREACH`. The observed symptom in
   `~/.hermes/logs/errors.log` is:
   `telegram.error.NetworkError: httpx.ConnectError: All connection attempts failed`
   — which reads as "Telegram is down" and is not.
2. **Flaky router DNS.** The active resolver is the router (`192.168.0.1`).
   The same log shows
   `Primary api.telegram.org connection failed ([Errno -3] Temporary failure in
   name resolution); trying fallback IPs` — the adapter falling back to
   hard-coded IPs because name resolution died.
3. **The failure is invisible to our own monitoring.** `health-check.mjs`
   checks queue depth, budget, disk, and cron — nothing about egress. So the
   one failure mode that actually stops every autonomous cycle (drain, review,
   deploy, notify) is the one thing the health check cannot see.

Each occurrence has cost a debugging session that started by suspecting
OpenRouter, the model ladder, or the Telegram bot token.

## Proposed Solution

1. **`agents/net-doctor.mjs`** — a dependency-free egress diagnostic that
   names this failure mode precisely instead of leaving us to infer it.
   Exports `checkEgress({ timeoutMs, hosts, probes })` returning
   `{ ok, findings[], checkedAt }`, where each finding carries an `id`,
   `severity`, `summary`, `detail`, and an actionable `remedy`. Every probe
   (DNS resolution, TCP connect per address family, IPv6 default route,
   active resolvers) is injectable, so the tests run fully hermetic — no
   network in CI. Also runs standalone as a CLI, exiting non-zero on a
   critical finding.
2. **`scripts/network-preflight.sh`** — the remedy `net-doctor` points at.
   Idempotently makes IPv4 win: writes an RFC 6724 precedence rule into
   `/etc/gai.conf` that deprioritizes IPv6 for global-scope destinations, and
   puts reliable public resolvers (1.1.1.1 / 9.9.9.9) ahead of the router.
   Supports `--check` (diagnose, no writes) and `--revert` (restore from the
   timestamped backups it takes). This is the only piece requiring `sudo`, so
   it is a script Bryce runs deliberately — never something an agent escalates
   into.
3. **Wire egress into `health-check.mjs`** — add an `egress` check to
   `runHealthCheck()` mapping net-doctor's `critical` → `down` and `warn` →
   `degraded`. The daily `sdlc-sched-health-check-daily` timer already runs
   this with `--notify`, so from here on a blackholed host announces itself
   instead of masquerading as a dead provider.

## Value Analysis

- **Converts the single most expensive recurring misdiagnosis into a one-line
  health check.** "Providers are down" has cost multiple debugging sessions
  that each began by suspecting the wrong component; the host now says
  `[down] egress: ipv6-blackhole` on the daily run.
- **Protects every autonomous cycle at once.** Drain, review, deploy-reconcile
  and notification all egress through the same two hosts. A blackhole stops
  the whole stack silently — this is the shared precondition worth monitoring.
- **The fix is deterministic and reversible.** The preflight script is
  idempotent, backs up what it edits, and has `--check` / `--revert`. No agent
  runs it; no `sudo` enters the autonomous path.
- **No new dependencies and no network in tests.** Node stdlib only, probes
  injected in tests — nothing added to the supply chain, nothing flaky in CI.
- **Cost:** S–M — one diagnostic module, one shell script, one health-check
  wiring, tests for each.

## Companion Changes

`pilot-autonomous-replication` and `autonomous-deploy-pipeline` (the cycles
this unblocks), `telegram-activation` (whose adapter surfaced the symptom).
