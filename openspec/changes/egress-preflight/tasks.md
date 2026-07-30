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
- [ ] **T7**: Live host verification — `net-doctor` reports the blackhole
  before the fix; `--check` writes nothing; after applying, `net-doctor`
  reports `ok`, Tailscale still works, and Hermes reaches Telegram
  - Complexity: S · Spec: REQ-003, REQ-005
- [x] **T8**: `npm test` green (unit + four-layer-validate + behavior)
  - Complexity: S · Spec: all
