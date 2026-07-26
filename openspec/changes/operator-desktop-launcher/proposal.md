# Proposal: operator-desktop-launcher

**Date**: 2026-07-26
**Author**: Claude (Fable 5) with Bryce
**Status**: proposed

---

## Problem

Bryce wants to run and test the Hermes/OpenRouter system **entirely solo**, but
today operating it requires knowing a dozen scattered commands:

1. **No desktop entry point** — launching the Hermes agent means opening a
   terminal and knowing the CLI; the dashboard means remembering port 7777.
2. **No operator runbook** — start/stop/status/kill-switch/approval/recovery
   procedures live in this assistant's head and half a dozen change docs, not
   in a document Bryce can follow alone.
3. **No local artifact delivery** — agents produce logs, receipts, and files
   inside clones and sandboxes; nothing lands anywhere Bryce would look
   ("send things to my local").

## Proposed Solution

1. **`agents/install-desktop-launcher.mjs`** (`install|uninstall|status`,
   zero deps, scheduler-install pattern): writes
   `~/.local/share/applications/hermes-sdlc.desktop` — icon-click opens
   gnome-terminal running the Hermes chat CLI; right-click Desktop Actions for
   **Dashboard** (`xdg-open http://127.0.0.1:7777`) and **Gateway logs**
   (journalctl follow). Ships `docs/assets/hermes.svg`, installed to
   `~/.local/share/icons/hicolor/scalable/apps/`.
2. **Outbox** — `~/hermes-outbox/` (env `HERMES_OUTBOX`): `notify.mjs` gains
   `deliverArtifact()` + a `deliver` CLI verb (copy file in, notify about it);
   `hermes-drain.sh` drops failed-run logs there; `deploy-runner.mjs` drops a
   deploy receipt on every successful deploy.
3. **`docs/RUNBOOK.md`** — the complete "operate Hermes solo" guide:
   start/stop/status, watching, adding work, approvals, budget knobs, the
   one-command kill switch, and recovery procedures.

## Value Analysis

- **This is the "without your help" requirement made real**: one icon to enter
  the system, one document that answers every operational question, one folder
  where agent output lands.
- **Reduces incident blast radius**: a documented kill switch
  (`systemctl --user stop 'sdlc-sched-*'`) beats hunting for unit names while
  an agent misbehaves.
- **Cost:** S. One installer + one doc + small hooks, all on existing patterns.

## Companion Changes

- `telegram-activation`, `autonomous-deploy-pipeline` — the runbook documents
  operating both.
