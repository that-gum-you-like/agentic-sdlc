# Voice Intake — Push-to-Talk Voice Input

Speak to the agentic SDLC system instead of typing. Press F6, speak your requirement or feedback, release — transcription flows into your active Claude Code session.

## How It Works

```
Press F6 → mic records → release/Ctrl+C → Groq Whisper transcribes → text typed into Claude Code → Enter
```

Voice input goes through the normal SDLC process: Claude receives your words, asks clarifying questions if needed, then routes to openspec/tasks when the requirement is clear.

## Setup

### 1. Install dependencies

```bash
# Required
sudo apt install sox curl jq

# For auto-typing into terminal (pick one):
sudo apt install xdotool    # X11
sudo apt install wtype       # Wayland

# For clipboard fallback:
sudo apt install xclip       # X11
# wl-copy comes with wl-clipboard on Wayland
```

### 2. Set Groq API key

```bash
export GROQ_API_KEY="gsk_your_key_here"
# Add to ~/.bashrc for persistence
```

### 3. Check dependencies

```bash
bash ~/agentic-sdlc/agents/voice-intake.sh check
```

### 4. Bind F6 key

```bash
bash ~/agentic-sdlc/agents/voice-intake.sh install-key
```

Or manually in your desktop environment:
- **GNOME:** Settings → Keyboard → Custom Shortcuts → F6 → `bash ~/agentic-sdlc/agents/voice-intake.sh`
- **KDE:** System Settings → Shortcuts → Custom Shortcuts

## Usage

### Interactive (press F6 or run directly)
```bash
bash ~/agentic-sdlc/agents/voice-intake.sh
# Records until Ctrl+C, transcribes, types into active window
```

### Modes
```bash
# Type into active window + auto-Enter (default)
voice-intake.sh --mode type

# Copy to clipboard
voice-intake.sh --mode clip

# Append to voice inbox
voice-intake.sh --mode mailbox

# Print to stdout (for piping)
voice-intake.sh --mode stdout | claude
```

### Configuration

Edit `agents/voice-config.json`:
```json
{
  "key": "F6",
  "mode": "type",
  "autoSubmit": true,
  "model": "whisper-large-v3-turbo",
  "language": "en",
  "maxSeconds": 120
}
```

## Troubleshooting

### No microphone detected
- Check `arecord -l` for capture devices
- Ensure PulseAudio/PipeWire is running
- Try `pavucontrol` to configure input device

### GROQ_API_KEY not set
- Get a key at https://console.groq.com
- Export it: `export GROQ_API_KEY="gsk_..."`

### Text not typed into window
- Install `xdotool` (X11) or `wtype` (Wayland)
- Falls back to clipboard if typing tools not available
- Falls back to stdout if no clipboard tools either

### Transcription quality is poor
- Speak clearly, close to the mic
- Reduce background noise
- The model handles accents well but may struggle with very technical jargon
