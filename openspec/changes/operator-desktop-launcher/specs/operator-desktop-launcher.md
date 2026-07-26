# Specs — operator-desktop-launcher

## REQ-001 — Desktop launcher

**Statement:** `install-desktop-launcher.mjs install` writes a valid
`hermes-sdlc.desktop` (absolute Exec paths, themed icon, Dashboard + Logs
actions) and the SVG icon into the user's XDG data dirs; `uninstall` removes
exactly those files; `status` reports both. Honors `$XDG_DATA_HOME`.
**Acceptance:** unit test installs into a temp `XDG_DATA_HOME`, asserts
content (no `~`, no `$`, actions present), validates with
`desktop-file-validate` when available, uninstalls clean, re-install idempotent.
**Complexity:** S · **Value:** one-click entry to the system

## REQ-002 — Outbox artifact delivery

**Statement:** `notify.mjs` exports `deliverArtifact(path, note)` (+ `deliver`
CLI): copies the file to `$HERMES_OUTBOX` (default `~/hermes-outbox`) with a
sortable timestamp prefix and sends a notification naming it; missing source
or copy failure returns false without throwing.
**Acceptance:** unit test with temp outbox: file lands prefixed; bad source →
false, no throw.
**Complexity:** S · **Value:** agent output reaches Bryce's machine

## REQ-003 — Producers feed the outbox

**Statement:** Failed drains copy their logfile to the outbox (best-effort);
successful deploys write a receipt file (project, sha8, verify status, URL).
**Acceptance:** source assertions in the drain test; receipt writer unit-level
check in deploy-runner test.
**Complexity:** S · **Value:** failures and ships are inspectable without ssh-fu

## REQ-004 — Operator runbook

**Statement:** `docs/RUNBOOK.md` covers services, scheduler, watching, adding
work, deploy approvals, budget knobs, kill switch, and recovery — every
command copy-pasteable and self-contained.
**Acceptance:** doc exists with all eight sections; kill-switch section names
`systemctl --user stop 'sdlc-sched-*'`.
**Complexity:** S · **Value:** Bryce operates solo
