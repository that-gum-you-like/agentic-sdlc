# Voice Transcription Spec

## Requirements

1. **Groq Whisper API** — Send audio to `https://api.groq.com/openai/v1/audio/transcriptions` using `whisper-large-v3-turbo` model
2. **API key** — Read from `$GROQ_API_KEY` environment variable (same key used by LinguaFlow)
3. **Latency** — End-to-end transcription < 2 seconds for clips up to 60 seconds
4. **Error handling** — Retry once on 5xx. On persistent failure, print error and exit cleanly (no crash)
5. **Language** — Default `en`, configurable in `voice-config.json`
6. **File size** — Groq accepts up to 25MB. 120s of 16kHz mono WAV = ~3.8MB. Well within limit.
7. **Output** — Return plain text transcription string, trimmed of whitespace
8. **No OpenAI** — NEVER call OpenAI APIs. Groq only.

## Acceptance Criteria

- [ ] Audio file sent to Groq API and transcription returned
- [ ] API key sourced from environment variable
- [ ] Retry on transient failure
- [ ] Clear error message if API key missing
- [ ] Transcription returned as clean text string
