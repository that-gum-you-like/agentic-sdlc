## Context

The operator communicates with the agentic SDLC system via typed text in Claude Code CLI sessions. The system already has:
- **Groq Whisper API** experience (used in LinguaFlow for transcription via `whisper-large-v3`)
- **OpenClaw mailbox** (`claude-mailbox.md`) for async message delivery
- **notify.mjs** for agent → human communication
- **Linux desktop** (Ubuntu, X11/Wayland) with standard audio stack (PulseAudio/PipeWire)
- **2011-era hardware** — no GPU, limited CPU. All ML inference must be remote.

The operator wants to press a Function key, speak, and have the transcription flow into the active Claude Code session as if they typed it.

## Goals / Non-Goals

**Goals:**
- Push-to-talk via a dedicated key. **Note:** The hardware Fn key is intercepted by keyboard firmware before the OS sees it — it cannot be bound by `keyd` or any Linux tool. Options: (a) use a specific F-key like F6 or F12 that's unlikely to conflict, (b) use a modifier combo like Super+V, (c) remap Fn to a scancode via firmware if the keyboard supports it. Default: **F6**.
- Audio capture → Groq Whisper API → text, end-to-end < 2 seconds for a 30-second clip
- Text injected into the active terminal (Claude Code session) via clipboard paste or stdin pipe, **with auto-Enter** so it submits immediately
- Voice always flows through the SDLC process: transcription → Claude Code → Claude asks clarifying questions → Claude parses into openspec/tasks when ready
- Voice-to-mailbox mode as fallback for when no Claude session is active
- Works on X11 and Wayland
- Zero local ML — all transcription via Groq API
- Graceful failure: if mic unavailable or API fails, show error and fall back to typing

**Non-Goals:**
- Real-time streaming transcription (batch after release is fine)
- Wake word detection ("Hey Claude")
- Speaker identification / multi-user
- Local Whisper inference
- Mobile / WhatsApp voice message transcription (already handled by OpenClaw)

## Decisions

### 1. Audio capture: `sox` (rec command)

**Choice:** `sox` via `rec` command
**Over:** `arecord` (ALSA-only, no PipeWire), `ffmpeg` (heavier), `parec` (PulseAudio-only)
**Rationale:** `sox` works across audio backends, is likely already installed, produces clean wav output. `rec -q -t wav /tmp/voice.wav` just works.

### 2. Groq API call: `curl` (no new dependencies)

**Choice:** Direct `curl` to `https://api.groq.com/openai/v1/audio/transcriptions`
**Over:** Python Groq SDK, Node.js wrapper
**Rationale:** Bash script with curl has zero dependencies beyond what's installed. The API is a single multipart POST. No reason to add a runtime.

### 3. Text injection: `xdotool type` (X11) / `wtype` (Wayland)

**Choice:** Simulate keyboard input to type the transcription into the active terminal
**Over:** Clipboard paste (`xclip` + Ctrl+V), stdout pipe
**Rationale:** `xdotool type` works with any terminal emulator and doesn't require the target app to support paste. For Wayland, `wtype` is the equivalent. Script auto-detects X11 vs Wayland via `$XDG_SESSION_TYPE`.

**Fallback:** If neither tool is available, copy to clipboard and notify user to paste.

### 4. Key binding: `keyd` (system-level, works everywhere)

**Choice:** `keyd` for Function key mapping
**Over:** `xbindkeys` (X11-only), `sxhkd` (X11-only), desktop-specific shortcuts
**Rationale:** `keyd` works at the evdev level — it functions on X11, Wayland, TTY, everywhere. Maps F5 → execute voice-intake script. Configured via `/etc/keyd/default.conf`.

**Alternative:** If `keyd` is not installable, fall back to `xbindkeys` for X11 or manual `bind` in bash.

### 5. Model: `whisper-large-v3-turbo`

**Choice:** `whisper-large-v3-turbo` via Groq
**Over:** `whisper-large-v3` (slower, marginally more accurate)
**Rationale:** Turbo is 216x realtime on Groq. For voice memos of 5-60 seconds, latency is imperceptible. Accuracy is sufficient for conversational English.

### 6. Recording feedback: terminal bell + visual indicator

**Choice:** Print colored status to stderr: `🎙 Recording...` / `⏹ Processing...` / `✅ Done`
**Over:** Desktop notification, audio beep
**Rationale:** Operator is looking at the terminal. Simple colored text is the least intrusive feedback mechanism.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────┐     ┌──────────────┐
│ Function Key │────▶│ voice-intake │────▶│ Groq API  │────▶│ Text Output  │
│ (F5 toggle)  │     │    .sh       │     │ Whisper   │     │              │
└─────────────┘     │              │     │ turbo     │     │ • xdotool    │
                    │ 1. rec audio │     └───────────┘     │ • clipboard  │
                    │ 2. curl Groq │                       │ • mailbox    │
                    │ 3. inject    │                       │ • stdout     │
                    └──────────────┘                       └──────────────┘
```

### Modes

| Mode | Flag | Behavior |
|------|------|----------|
| **type** (default) | `--mode type` | Transcription typed into active window via xdotool/wtype |
| **clipboard** | `--mode clip` | Copied to clipboard, user pastes |
| **mailbox** | `--mode mailbox` | Appended to `pm/voice-inbox.md` with timestamp |
| **stdout** | `--mode stdout` | Printed to stdout (for piping) |

### Config: `voice-config.json`

```json
{
  "key": "F6",
  "mode": "type",
  "autoSubmit": true,
  "model": "whisper-large-v3-turbo",
  "language": "en",
  "maxSeconds": 120,
  "groqApiKeyEnv": "GROQ_API_KEY",
  "mailboxPath": "pm/voice-inbox.md",
  "audioFormat": "wav",
  "sampleRate": 16000
}
```

## Risks / Trade-offs

- **[Mic permissions]** → Script checks for recording device on startup, prints clear error if unavailable
- **[Groq API rate limits]** → Free tier allows ~20 req/min. Sufficient for voice input use case. Script includes retry-once logic.
- **[Transcription errors]** → Groq Whisper is ~95% accurate for clear English. Operator can see and correct text before submitting. In `type` mode, text appears in terminal where it can be edited before pressing Enter.
- **[keyd requires root]** → Initial setup requires `sudo`. Document clearly. Provide xbindkeys fallback.
- **[Background noise on 2011 hardware]** → Older built-in mics may have noise. Groq Whisper handles this well. Can add `sox` noise reduction filter if needed.

## Resolved Questions

1. **Which key?** — Operator wanted Fn but that's hardware-level (can't bind). Using **F6** as default, configurable. Operator should pick whichever F-key they don't use.
2. **Auto-submit?** — **Yes.** Auto-press Enter after typing so it submits to Claude Code immediately.
3. **How are voice entries processed?** — Voice input always goes through the SDLC process: transcription → Claude Code session → Claude asks clarifying questions → Claude routes to openspec/tasks when the requirement is clear. Voice is just another input channel to Claude, not a separate pipeline. Mailbox mode is the fallback when no Claude session is active.
