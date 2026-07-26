# Design — operator-desktop-launcher

## Launcher

GNOME (Wayland) reads `~/.local/share/applications/*.desktop`; existing custom
entries on this host (telegram desktop, claude-code-url-handler) confirm the
pattern. The installer resolves absolute paths at install time (`which hermes`,
`$HOME`) — the generated file contains no `~` and no `$VARS` (desktop-entry
Exec lines don't expand them). `Terminal=false` + `Exec=gnome-terminal --` is
used instead of `Terminal=true` because GNOME's handling of Terminal=true is
unreliable across versions; gnome-terminal is the only emulator installed.

```
[Desktop Entry]  Type=Application  Name=Hermes Agent
Exec=<gnome-terminal> --title=Hermes -- <hermes-abs-path>
Icon=hermes-sdlc         (themed name; SVG installed to hicolor/scalable/apps)
Actions=dashboard;logs;
```

`status` verifies both files exist and `desktop-file-validate` passes (when the
tool is present). `uninstall` removes exactly the two files it wrote, nothing
else. Idempotent: re-install overwrites in place; `update-desktop-database` is
called when available (harmless when absent).

## Outbox

`~/hermes-outbox/` (override `HERMES_OUTBOX`). Files land as
`<YYYYMMDD-HHMMSS>-<basename>` — chronological sort, no collisions, no nesting
to spelunk. Producers:
- `notify.mjs deliverArtifact(path, note)` / CLI `notify.mjs deliver <path> [note]`
  — copies the file, then sends a normal notification naming it. Copy failure
  returns false, never throws (courtesy channel, same contract as popups).
- `hermes-drain.sh`: failed runs (`rc != 0`) copy their logfile in (`|| true`).
- `deploy-runner.mjs`: successful deploys write a small text receipt
  (project, sha, verify status, URL, timestamp).

Retention is Bryce's (documented in RUNBOOK: it's a folder; delete freely).

## RUNBOOK.md structure

Services → Scheduler → Watching (logs/status/dashboard) → Adding work (queue
JSON, seed script, kanban, Telegram chat) → Deploy approvals (APPROVE/REJECT,
pause via deploy.enabled, clearing failed-sha tokens) → Budget & caps →
**Kill switch** → Recovery (stale mutex, re-clone, gateway restart, token
re-auth) → File map. Every command copy-pasteable; no reference requires
reading another doc first.

## Non-goals

Tray applet / GUI beyond the .desktop entry; outbox retention policy; Telegram
`sendDocument` media (text notification names the file; the file is local).
