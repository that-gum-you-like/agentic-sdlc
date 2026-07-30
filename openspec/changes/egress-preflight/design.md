# Design — egress-preflight

## Why a diagnostic and a remedy, kept separate

The two halves have different risk profiles and different operators:

- **Diagnosis is safe, so it is automated.** `net-doctor.mjs` only reads —
  DNS lookups, TCP connects, `ip -6 route show default`. It runs unprivileged,
  on a timer, inside the health check.
- **Remediation touches `/etc`, so it stays manual.** `network-preflight.sh`
  needs root. Per the framework guardrails an agent must **never** `sudo` —
  a permission error means stop and report. So the script is something Bryce
  runs, and the diagnostic's job is to tell him exactly when to run it.

This split is why the remedy string in every finding is a literal command
rather than an action the code takes on its own.

## net-doctor.mjs

```
checkEgress({ timeoutMs = 5000, hosts = DEFAULT_HOSTS, probes = {} })
  -> { ok, findings: Finding[], checkedAt }
Finding = { id, severity: 'critical'|'warn'|'info', summary, detail, remedy }
```

`ok` is true only when there are **zero `critical` findings** — a `warn` (the
RFC1918-resolver case) never flips a healthy host to failing.

`DEFAULT_HOSTS = ['openrouter.ai', 'api.telegram.org']` — the LLM provider and
the notification channel. Those two are the actual preconditions for an
autonomous cycle; checking more would be noise.

### Per-host decision tree

1. Resolve A and AAAA independently, each behind `withTimeout`.
2. **Neither resolves** → `dns-unresolved` (critical) and **stop** for that
   host. Connect probes against a name that doesn't resolve produce a second,
   redundant failure that obscures the real one.
3. **A resolves** → TCP connect `:443` with `family: 4`. Failure →
   `ipv4-unreachable` (critical). This is the genuinely-offline case, and it
   must be distinguishable from the blackhole.
4. **AAAA resolves** → establish whether IPv6 can work at all:
   - `ip -6 route show default` empty → `ipv6-blackhole` (critical)
     immediately, **without** attempting a connect. A connect over a
     non-existent route can only fail, so waiting on it buys nothing.
   - Route present, or its presence **unknown** (`ip` missing, non-Linux,
     permission error) → attempt a real `family: 6` connect and report
     `ipv6-blackhole` only if it fails. Unknown must degrade to measurement,
     never to a guess in either direction.

### Failure isolation

Three deliberate guards, because a diagnostic that dies is worse than no
diagnostic:

- Every probe call is wrapped in `withTimeout`, so a hung DNS server or a
  black-holed connect cannot hang the run.
- `checkHost` is individually try/caught inside the host loop — one host
  throwing still leaves the other checked.
- Probe results pass through `asList()` before any decision logic, so a probe
  returning something unexpected degrades to "no records" rather than throwing
  on `.length`.

### Injectable probes

`probes` overrides any of `resolve4`, `resolve6`, `tcpConnect`,
`ipv6DefaultRoute`, `activeResolvers`. Tests supply fakes and assert on exact
finding shapes, so the suite is hermetic and deterministic — no network, no
sleeps, no CI flake. This is the only reason the "exact blackhole scenario"
can be asserted as a test rather than reproduced by hand.

## scripts/network-preflight.sh

`sudo bash scripts/network-preflight.sh [--check|--revert]`

Two independent fixes, each applied only when needed:

1. **IPv4 precedence** — append a `precedence ::ffff:0:0/96 100` line to
   `/etc/gai.conf`. Under RFC 6724 that raises IPv4-mapped destinations above
   the default IPv6 entries, so `getaddrinfo` returns A records first and
   `httpx` connects over IPv4. Chosen over `sysctl
   net.ipv6.conf.all.disable_ipv6=1` because it is scoped to destination
   *selection* — Tailscale's IPv6 (`fd7a:115c:a1e0::/48`) and any link-local
   traffic keep working.
2. **Reliable resolvers** — put 1.1.1.1 and 9.9.9.9 ahead of the router. On a
   `systemd-resolved` host (this one: `/etc/resolv.conf` → `127.0.0.53`) that
   means a drop-in at `/etc/systemd/resolved.conf.d/` rather than editing
   `/etc/resolv.conf`, which resolved owns and rewrites.

Both edits are idempotent (marker-guarded), take timestamped backups, and are
undone by `--revert`. `--check` prints what *would* change and writes nothing,
which is what makes the script safe to point at from a finding's remedy.

## health-check.mjs wiring

`runHealthCheck()` becomes **async** — `checkEgress` is inherently async and
there is no honest synchronous way to probe a network. Its two existing
callers are the CLI in the same file and the tests; both are updated.

Severity maps: any `critical` finding → `down`; otherwise any `warn` →
`degraded`; otherwise `ok`. That plugs straight into the existing `worst()`
rollup with no changes to the reporting or `--notify` paths.

The egress check is **best-effort like every other check**: if `checkEgress`
itself throws, the check reports `degraded` with the error message rather than
taking down the whole health run. A broken diagnostic must not be
indistinguishable from a broken network.

Timeout is 3s per probe here (vs. the 5s CLI default) to keep the daily health
run brisk; a blackholed connect fails instantly anyway, so the shorter budget
costs nothing in the case that matters.
