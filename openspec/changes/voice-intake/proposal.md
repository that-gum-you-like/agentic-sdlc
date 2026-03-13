## Why

The human operator currently communicates with the agent system exclusively via typing — requirements, feedback, task descriptions, and corrections all require keyboard input. This is slow for stream-of-consciousness thinking, inconvenient when away from the desk, and creates friction that discourages frequent feedback. Voice input would let the operator speak naturally to the agent system: describe requirements, give feedback, approve tasks, and provide corrections — all via a mapped Function key that records, transcribes via Groq Whisper API, and pipes text into the active Claude Code session or the agent mailbox.

Hardware constraint: the operator's machine is from 2011 with limited local compute. All transcription must happen server-side via Groq API (privacy-acceptable, no OpenAI). Local work is limited to audio capture (trivial CPU).

## What Changes

- **New `voice-intake.sh` script** — Bash script that captures mic audio on Function key press (push-to-talk), sends to Groq Whisper API, returns transcription text
- **Function key binding** — Maps a configurable Function key (e.g., F5) to start/stop recording via `xbindkeys` or similar Linux keybinding tool
- **Interactive voice mode for Claude Code** — Wrapper/hook that intercepts Claude Code's input prompt and offers push-to-talk as an alternative to typing. Claude asks a question → user presses Fn key → speaks → transcription becomes the response
- **Voice-to-mailbox integration** — Transcriptions can optionally route to `pm/voice-inbox.md` for async processing by the agent system (task creation, feedback routing, requirement parsing)
- **Voice-to-task routing** — Agent parses transcription and routes to: task creation, feedback memory, openspec proposal input, or direct Claude Code input based on content/intent

## Value Analysis

**Before:** Every interaction requires typing. Feedback loop is slow. Operator avoids giving nuanced corrections because typing them out is tedious.

**After:** Operator presses F-key, speaks for 10-30 seconds, releases. Groq transcribes in <1s. Text flows into Claude Code or the task queue. Feedback frequency increases. Requirements capture becomes natural and complete.

**Cost:** Groq Whisper API is free tier or very low cost. No new hardware. ~200 lines of new code.

**Risk:** Low. Audio capture is well-understood. Groq API is reliable. Graceful fallback to typing if mic/API unavailable.

## Capabilities

### New Capabilities
- `voice-capture`: Push-to-talk audio recording via Function key, configurable key binding, audio format handling (wav/webm)
- `voice-transcription`: Groq Whisper API integration for speech-to-text, error handling, latency optimization
- `voice-routing`: Parse transcription intent and route to appropriate destination (Claude Code stdin, mailbox, task queue, feedback memory)

### Modified Capabilities
- (none — this is purely additive)

## Impact

- **New files:** `agents/voice-intake.sh` (audio capture + Groq API call), `agents/voice-config.json` (key binding, API config), keybinding config
- **Dependencies:** `sox` or `arecord` for audio capture (likely already installed), `curl` for Groq API, `xbindkeys` or `keyd` for Function key mapping
- **Config:** Groq API key (reuse from LinguaFlow's existing `GROQ_API_KEY` env var)
- **No changes to existing scripts** — voice-intake is a new input channel that feeds into existing systems
