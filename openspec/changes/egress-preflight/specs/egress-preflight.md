# Specs — egress-preflight

## REQ-001 — Egress diagnostic names the IPv6-blackhole failure mode

**Statement:** `agents/net-doctor.mjs` exports
`checkEgress({ timeoutMs, hosts, probes }) -> { ok, findings[], checkedAt }`
and `DEFAULT_HOSTS` (`openrouter.ai`, `api.telegram.org`). When a host
publishes AAAA records and the machine has no IPv6 default route, it emits
exactly one `ipv6-blackhole` finding of severity `critical` naming that host,
with a remedy pointing at `scripts/network-preflight.sh`. `ok` is true only
when zero `critical` findings are present; a `warn` never flips `ok` to false.
Distinguishes `dns-unresolved`, `ipv4-unreachable`, and `ipv6-blackhole` as
separate ids so the three are never conflated.
**Acceptance:** hermetic unit tests with injected probes assert: the exact
blackhole scenario yields a single `ipv6-blackhole` critical; a fully healthy
host yields `ok: true` with zero findings; total DNS failure yields
`dns-unresolved` with no downstream probes attempted; `ipv4-unreachable` is
reported when A resolves but TCP 443 fails.
**Dependencies:** none (Node stdlib only).
**Complexity:** M
**Value:** Converts the recurring "provider is down" misdiagnosis into a named,
actionable finding.

## REQ-002 — The diagnostic cannot hang, crash, or half-report

**Statement:** Every probe call is bounded by an explicit timeout. One host
failing must not prevent the remaining hosts from being checked. An unknown
IPv6 default-route result (`ip` absent, non-Linux, permission denied) falls
back to a direct IPv6 connect attempt rather than assuming either outcome.
Probes returning unexpected values degrade to "no records" instead of throwing.
**Acceptance:** unit tests assert: a probe that never resolves still produces a
finding rather than hanging; one host throwing still leaves the other checked;
an `ipv6DefaultRoute` probe that throws falls back to a direct v6 connect.
**Dependencies:** REQ-001
**Complexity:** S
**Value:** A diagnostic that dies under the conditions it exists to diagnose is
worse than none.

## REQ-003 — Idempotent, reversible host remedy

**Statement:** `scripts/network-preflight.sh` makes IPv4 win destination
selection by writing a marker-guarded `precedence ::ffff:0:0/96 100` rule into
`/etc/gai.conf`, and places reliable public resolvers (1.1.1.1, 9.9.9.9) ahead
of the router via a `systemd-resolved` drop-in when resolved is in use.
Re-running changes nothing. It takes a timestamped backup of every file it
edits. `--check` diagnoses and writes nothing; `--revert` restores the most
recent backups. It must not disable IPv6 wholesale, so Tailscale IPv6 and
link-local traffic keep working.
**Acceptance:** `--check` on the live host exits non-zero while unfixed and
writes nothing (verified by checksum); applying it twice leaves the second run
reporting no changes; `--revert` restores the original `/etc/gai.conf`;
`node agents/net-doctor.mjs` reports `ok` after the fix; `tailscale status`
still resolves.
**Dependencies:** REQ-001 (supplies the remedy string)
**Complexity:** M
**Value:** The one action that actually restores egress, safe to re-run and to
undo.

## REQ-004 — Remediation never enters the autonomous path

**Statement:** No framework script, cron job, timer, or agent prompt invokes
`network-preflight.sh` or any `sudo` command. The remedy is surfaced to the
human as text only. This preserves the standing guardrail that an agent
encountering a permission error stops and reports rather than escalating.
**Acceptance:** a repo grep shows `network-preflight.sh` referenced only from
finding remedies, docs, and tests — never from an executed code path; no new
`sudo` appears in `agents/`.
**Dependencies:** REQ-003
**Complexity:** S
**Value:** Keeps root out of the autonomous loop.

## REQ-005 — Health check sees egress

**Statement:** `runHealthCheck()` includes an `egress` check derived from
`checkEgress`, mapping any `critical` finding to `down`, otherwise any `warn`
to `degraded`, otherwise `ok`, with a detail line naming the finding ids. The
function becomes async and all in-repo callers are updated. If `checkEgress`
itself throws, the check reports `degraded` with the error rather than failing
the health run.
**Acceptance:** unit tests with an injected egress prober assert each of the
four mappings (critical→down, warn→degraded, clean→ok, thrown→degraded) and
that the overall rollup reflects them; `node agents/health-check.mjs` prints an
`egress` line on the live host.
**Dependencies:** REQ-001
**Complexity:** S
**Value:** The daily `--notify` timer now announces a blackholed host instead
of letting it masquerade as a dead provider.
