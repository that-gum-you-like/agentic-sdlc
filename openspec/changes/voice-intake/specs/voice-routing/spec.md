# Voice Routing Spec

## Requirements

1. **Type mode (default)** — Inject transcription text into active terminal window via `xdotool type` (X11) or `wtype` (Wayland). Text appears as if typed by keyboard. Does NOT auto-press Enter — operator reviews and submits manually.
2. **Clipboard mode** — Copy transcription to system clipboard via `xclip` (X11) or `wl-copy` (Wayland). Print notification that text is ready to paste.
3. **Mailbox mode** — Append transcription to `pm/voice-inbox.md` with ISO timestamp header. Format: `## YYYY-MM-DDTHH:MM:SS\n\n<transcription>\n\n---\n`
4. **Stdout mode** — Print transcription to stdout. Useful for piping: `voice-intake.sh --mode stdout | claude`
5. **Auto-detect display server** — Check `$XDG_SESSION_TYPE` for `x11` vs `wayland`. Use appropriate tool for each.
6. **Fallback chain** — If `xdotool`/`wtype` not installed, fall back to clipboard mode. If clipboard tools not installed, fall back to stdout.
7. **Mode selection** — Via `--mode <type|clip|mailbox|stdout>` flag, or default from `voice-config.json`

## Acceptance Criteria

- [ ] Type mode injects text into active window without pressing Enter
- [ ] Clipboard mode copies text and notifies user
- [ ] Mailbox mode appends timestamped entry to voice-inbox.md
- [ ] Stdout mode prints clean text
- [ ] Auto-detects X11 vs Wayland
- [ ] Fallback chain works when tools are missing
