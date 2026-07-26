# Tasks — operator-desktop-launcher

## Implementation

- [x] **T1**: `docs/assets/hermes.svg` — launcher icon
  - Complexity: S · Spec: REQ-001
- [x] **T2**: `agents/install-desktop-launcher.mjs` — install|uninstall|status, XDG-aware, absolute paths, Dashboard/Logs actions
  - Complexity: S · Spec: REQ-001
- [x] **T3**: `agents/notify.mjs` — `deliverArtifact()` + `deliver` CLI verb (HERMES_OUTBOX)
  - Complexity: S · Spec: REQ-002
- [x] **T4**: `agents/hermes-drain.sh` — failed-run log → outbox (best-effort); `agents/deploy-runner.mjs` — deploy receipt → outbox
  - Complexity: S · Spec: REQ-003
- [x] **T5**: `docs/RUNBOOK.md` — full solo-operation guide
  - Complexity: S · Spec: REQ-004

## Verification

- [x] **T6**: `tests/install-desktop-launcher.test.mjs` — temp XDG install/validate/uninstall/idempotent
  - Complexity: S · Spec: REQ-001
- [x] **T7**: outbox tests (deliverArtifact + producer source assertions)
  - Complexity: S · Spec: REQ-002, REQ-003
- [x] **T8**: `npm test` green; launcher installed on this host and visible in GNOME
  - Complexity: S · Spec: all
