# Voice Capture Spec

## Requirements

1. **Push-to-talk recording** — Press configured Function key to start recording, press again (or release) to stop
2. **Audio format** — Record as 16kHz mono WAV (optimal for Whisper, minimal file size)
3. **Max duration** — Configurable cap (default 120s), auto-stop at limit
4. **Visual feedback** — Print `🎙 Recording...` on start, `⏹ Processing...` on stop
5. **Temp file cleanup** — Audio file deleted after successful transcription
6. **Key binding** — Configurable via `voice-config.json`, default F8. Note: the hardware Fn key cannot be bound by Linux (it's intercepted by keyboard firmware). Use an F-key (F8, F12) or modifier combo (Super+V) instead.
7. **Key binding install** — `voice-intake.sh install-key` sets up keyd or xbindkeys config
8. **Audio device detection** — On startup, verify recording device exists. Clear error if not.
9. **Dependency check** — Verify `sox` (or `arecord`) is installed. Print install instructions if missing.

## Acceptance Criteria

- [ ] F-key press starts recording, second press stops
- [ ] Audio saved as 16kHz mono WAV to temp file
- [ ] Recording auto-stops at max duration
- [ ] Visual indicators shown in terminal
- [ ] Temp file cleaned up after transcription
- [ ] Works on both PulseAudio and PipeWire audio backends
