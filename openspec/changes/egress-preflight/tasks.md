# Tasks — egress-preflight

## Implementation

- [x] **T1**: `agents/net-doctor.mjs` — `checkEgress` + `DEFAULT_HOSTS`,
  injectable probes, per-host decision tree, `withTimeout` on every probe,
  CLI entry guarded by `__isMainModule`
  - Complexity: M · Spec: REQ-001, REQ-002
- [x] **T2**: `scripts/network-preflight.sh` — gai.conf IPv4 precedence +
  systemd-resolved drop-in, marker-guarded and idempotent, timestamped
  backups, `--check` / `--revert`
  - Complexity: M · Spec: REQ-003
- [x] **T3**: `agents/health-check.mjs` — add the `egress` check, make
  `runHealthCheck` async, update the CLI caller
  - Complexity: S · Spec: REQ-005

## Verification

- [x] **T4**: `tests/net-doctor.test.mjs` — hermetic probe fakes covering the
  blackhole scenario, healthy host, DNS failure, IPv4 unreachable, RFC1918
  resolver warn, per-host isolation, unknown-route fallback, timeout
  - Complexity: M · Spec: REQ-001, REQ-002
- [x] **T5**: `tests/health-check.test.mjs` — the four egress severity
  mappings and their effect on the overall rollup
  - Complexity: S · Spec: REQ-005
- [x] **T6**: Guardrail grep — `network-preflight.sh` appears only in
  remedies, docs, and tests; no new `sudo` in `agents/`
  - Complexity: S · Spec: REQ-004
- [x] **T7**: Live host verification — `net-doctor` reported the blackhole
  before the fix; `--check` wrote nothing (checksum-verified); after applying,
  `getent ahosts` puts IPv4 first for both hosts, `httpx` reaches both,
  `net-doctor` exits 0, `health-check` reports `[ok] egress`, and Tailscale
  MagicDNS + tailnet connectivity still work
  - Complexity: S · Spec: REQ-003, REQ-005
- [x] **T9**: `agents/net-doctor.mjs` — decide the blackhole on getaddrinfo
  order via a `lookupOrdered` probe; mitigated → info, undeterminable → warn
  - Complexity: S · Spec: REQ-006
- [x] **T10**: `tests/net-doctor.test.mjs` — post-remedy mitigated case and the
  undeterminable-order case; fake probe set gains `order`/`orderError`
  - Complexity: S · Spec: REQ-006
- [x] **T8**: `npm test` green (unit + four-layer-validate + behavior)
  - Complexity: S · Spec: all
