## 1. Core Script

- [ ] 1.1 Create `agents/voice-intake.sh` — main entry point. Parse flags: `--mode <type|clip|mailbox|stdout>`, `--key <F-key>`, `--config <path>`, `install-key`, `check`. Set up signal traps for clean exit.
- [ ] 1.2 Implement `check` command — verify dependencies: `sox`/`rec`, `curl`, `xdotool`/`wtype` (optional), `xclip`/`wl-copy` (optional). Print status table with install instructions for missing deps.
- [ ] 1.3 Implement audio recording — `rec -q -r 16000 -c 1 -t wav "$TMPFILE"`. Start on invocation, stop on SIGINT (Ctrl+C) or timeout. Print `🎙 Recording...` / `⏹ Stopped`.
- [ ] 1.4 Implement max duration auto-stop — background timer kills `rec` process after `maxSeconds` from config (default 120).
- [ ] 1.5 Clean up temp file on exit (trap EXIT).

## 2. Groq Transcription

- [ ] 2.1 Implement Groq API call — `curl -s -X POST https://api.groq.com/openai/v1/audio/transcriptions -H "Authorization: Bearer $GROQ_API_KEY" -F file=@"$TMPFILE" -F model=whisper-large-v3-turbo -F language=en`. Parse JSON response for `.text` field.
- [ ] 2.2 Add API key validation — check `$GROQ_API_KEY` is set before recording. Print clear error if missing.
- [ ] 2.3 Add retry logic — on HTTP 5xx or curl error, wait 1s and retry once. On second failure, print error and exit 1.
- [ ] 2.4 Add error handling — parse Groq error responses (rate limit, invalid audio, etc.) and print human-readable messages.

## 3. Text Routing

- [ ] 3.1 Implement `type` mode — detect `$XDG_SESSION_TYPE`. X11: `xdotool type --delay 10 "$TEXT"`. Wayland: `wtype "$TEXT"`. Small delay between chars prevents dropped input.
- [ ] 3.2 Implement `clip` mode — X11: `echo "$TEXT" | xclip -selection clipboard`. Wayland: `echo "$TEXT" | wl-copy`. Print `📋 Copied to clipboard`.
- [ ] 3.3 Implement `mailbox` mode — append to `pm/voice-inbox.md` with ISO timestamp header.
- [ ] 3.4 Implement `stdout` mode — `echo "$TEXT"`.
- [ ] 3.5 Implement fallback chain — if `type` tools missing → try `clip` → try `stdout`. Print which mode was used.

## 4. Configuration

- [ ] 4.1 Create `agents/voice-config.json` — default config with key, mode, model, language, maxSeconds, groqApiKeyEnv, mailboxPath, audioFormat, sampleRate.
- [ ] 4.2 Load config in `voice-intake.sh` — parse JSON with `jq` (add to dependency check). CLI flags override config values.
- [ ] 4.3 Update `setup.mjs` — scaffold `voice-config.json` during project setup (optional section).

## 5. Key Binding

- [ ] 5.1 Implement `install-key` command for `keyd` — write `/etc/keyd/default.conf` entry mapping configured F-key to run `voice-intake.sh`. Requires sudo. Print instructions.
- [ ] 5.2 Implement `install-key` fallback for `xbindkeys` — write `~/.xbindkeysrc` entry. No sudo required. X11 only.
- [ ] 5.3 Implement toggle behavior — F-key press starts recording (background PID saved to `/tmp/voice-intake.pid`). Second F-key press sends SIGINT to stop recording and trigger transcription.
- [ ] 5.4 Document key binding setup in `docs/voice-intake.md` — instructions for keyd (recommended), xbindkeys (X11 fallback), and manual invocation.

## 6. Documentation & Integration

- [ ] 6.1 Create `docs/voice-intake.md` — setup guide, usage examples, troubleshooting (mic not found, API key missing, keyd permissions).
- [ ] 6.2 Update `CLAUDE.md` — add Voice Input section with commands and config reference.
- [ ] 6.3 Update `framework/maturity-model.md` — add voice input to Level 6 checklist as optional capability.
- [ ] 6.4 Add to `openspec/BACKLOG.md` promoted table.

## 7. Testing

- [ ] 7.1 Write test: `voice-intake.sh check` reports missing dependencies correctly (mock which/command -v).
- [ ] 7.2 Write test: Groq API response parsing extracts text correctly (mock curl output).
- [ ] 7.3 Write test: fallback chain selects correct mode based on available tools.
- [ ] 7.4 Write test: config loading merges CLI flags over file defaults.
- [ ] 7.5 Write test: mailbox mode appends correct format with timestamp.
- [ ] 7.6 Manual test: end-to-end record → transcribe → type into terminal.
